// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Motion-state continuity for "Nonlinear animation is all you need".
//
// gnome-shell's ease helpers give every new animation a clean slate:
//   - a retarget restarts from the current position but with zero velocity
//     ("flip two app-grid pages quickly and the second page re-accelerates");
//   - many animations are re-triggered after the caller resets the property
//     to its start value, so the visual teleports back before replaying;
//   - an opposite-direction trigger kills the outgoing motion outright.
//
// We keep a registry of every animation we wrapped (WeakMap keyed by the
// animatable, one record per property) holding its curve, interval and start
// time — enough to reconstruct the on-screen POSITION and VELOCITY
// analytically at any moment, even after the transition is gone. Records
// survive for a short grace after stopping, so a re-trigger can bridge over
// the reset:
//
//   anti-teleport  new animation is driven from the old visual position
//                  instead of the caller's reset value (the driver writes
//                  after the class handler, so no teleport frame is painted);
//   momentum       the new curve is a spring seeded with the old velocity —
//                  same-direction AND reversal: a reversal just means the
//                  spring starts moving "backwards" before physics pulls it
//                  to the new target, exactly like the real world.
//
// Custom curves (and every bridged animation) run on a per-frame driver: the
// transition itself stays native (completion signals, remove-on-complete and
// the shell's own callbacks keep working) and a connect_after('new-frame')
// handler writes the property after the class handler each frame.
// No GI imports — callers pass duck-typed targets.

import {compileCurve} from './easing.js';

// target (GObject) -> Map(propName -> record)
const registry = new WeakMap();

// How long a finished animation's motion state stays bridging-eligible.
const STATE_GRACE_MS = 250;
// Normalized entry velocity below which momentum is imperceptible.
export const MIN_V0 = 0.15;
// Above this no curve can honor the flick gracefully.
export const MAX_V0 = 4;

function record(target, prop) {
    return registry.get(target)?.get(prop) ?? null;
}

function noteAnimation(target, prop, compiled, init, final, durationMs) {
    let m = registry.get(target);
    if (!m) {
        m = new Map();
        registry.set(target, m);
    }
    m.set(prop, {
        compiled,
        init,
        final,
        durationMs,
        startedAt: Date.now(),
        stoppedAt: 0,
    });
}

// Reconstruct the on-screen motion state (position + velocity in
// property-units/ms) of the animation we last drove/registered on
// target[prop]. Returns null when there is nothing fresh to bridge from
// (no record, or the record is stale).
export function motionState(target, prop, now = Date.now()) {
    const r = record(target, prop);
    if (!r)
        return null;
    if (r.stoppedAt && now - r.stoppedAt > STATE_GRACE_MS)
        return null;
    const tau = Math.min((now - r.startedAt) / r.durationMs, 1);
    return {
        value: r.init + (r.final - r.init) * r.compiled.eval(tau),
        velocity: (r.final - r.init) * r.compiled.deriv(tau) / r.durationMs,
        init: r.init,
        final: r.final,
        playing: !r.stoppedAt,
    };
}

// Velocity-matched retarget curve: a cubic Hermite from progress 0 to 1 with
// the start tangent set to a damped fraction of the measured (normalized)
// velocity and the end tangent zero. Unlike a seeded spring, it settles on
// the target exactly, so the last frame never snaps a residual gap. The
// carried momentum is heavily damped and clamped shallow: a reversal nods in
// the outgoing direction briefly instead of committing to it, and the caller
// shortens the retarget's duration so the settle is decisive. v0 = 0
// degenerates to smoothstep.
function retargetCompiled(v0, _durationMs) {
    const m0 = Math.max(-0.6, Math.min(0.8, 0.5 * v0));
    return {
        analytic: true,
        eval(tau) {
            const t2 = tau * tau;
            const t3 = t2 * tau;
            return (t3 - 2 * t2 + tau) * m0 - 2 * t3 + 3 * t2;
        },
        deriv(tau) {
            const t2 = tau * tau;
            return (3 * t2 - 4 * tau + 1) * m0 - 6 * t2 + 6 * tau;
        },
    };
}

// Attach the per-frame driver. `target.get_transition(prop)` must return the
// live transition; `write(value)` applies a raw number to the animated
// property. `seed` optionally carries continuity from an interrupted
// animation: {fromValue, v0}. Returns the transition or null when driving
// isn't possible.
export function driveTransition(target, prop, curve, write, seed = null) {
    const tr = target.get_transition?.(prop);
    // a Clutter.Transition IS a Clutter.Timeline — use it directly
    if (!tr?.is_playing?.())
        return null;
    const iv = tr.get_interval?.();
    if (!iv)
        return null;
    const init = seed?.fromValue ?? iv.peek_initial_value();
    const final = iv.peek_final_value();
    const dur = tr.get_duration();
    if (!(dur > 0) || !Number.isFinite(init) || !Number.isFinite(final))
        return null;

    const T = dur / 1000;
    const v0 = seed?.v0 ?? null;
    let compiled;
    if (v0 !== null && Math.abs(v0) >= MIN_V0 && curve.kind !== 'spring') {
        // interruption with momentum → universal velocity-matched spring
        compiled = retargetCompiled(v0, dur);
    } else if (curve.kind === 'spring') {
        compiled = compileCurve(curve, v0 === null ? 0 : v0 / T, T);
    } else {
        compiled = compileCurve(curve);
    }

    const isNumeric = curve.kind === 'spring' && curve.solver === 'numeric';
    const range = final - init;

    const handler = tr.connect_after('new-frame', (timeline, elapsed) => {
        if (elapsed >= dur) {
            // final frame: land exactly on the target instead of leaving the
            // curve's last sampled (≈1) value
            write(final);
            return;
        }
        const tau = elapsed / dur;
        if (isNumeric)
            write(init + range * compiled.advanceTo(tau));
        else
            write(init + range * compiled.eval(tau));
    });

    noteAnimation(target, prop, compiled, init, final, dur);
    tr.connect('stopped', () => {
        tr.disconnect(handler);
        // keep the record for STATE_GRACE_MS so a re-trigger right after the
        // stop can still bridge over a reset-to-start
        const r = record(target, prop);
        if (r)
            r.stoppedAt = Date.now();
    });
    return tr;
}

// For plain-mode animations there is no driver; we only register the record
// so a later interruption can read the motion state. getTransition() must
// return the live transition for the property (or null).
export function noteModeAnimation(target, prop, curve, getTransition) {
    const tr = getTransition?.();
    const iv = tr?.get_interval?.();
    const dur = tr?.get_duration?.() ?? 0;
    if (!iv || !(dur > 0))
        return;
    const init = iv.peek_initial_value();
    const final = iv.peek_final_value();
    if (!Number.isFinite(init) || !Number.isFinite(final))
        return;
    noteAnimation(target, prop, compileCurve(curve), init, final, dur);
    tr.connect('stopped', () => {
        const r = record(target, prop);
        if (r)
            r.stoppedAt = Date.now();
    });
}
