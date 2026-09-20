// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Interruption continuity for "Nonlinear animation is all you need".
//
// gnome-shell's ease helpers remove a still-playing transition and start a
// new one from the current on-screen position — the start value is right, but
// the velocity resets to zero. That is the "flip two app-grid pages quickly
// and the second page re-accelerates from standstill" jolt.
//
// Fix: we keep a registry of every animation we wrapped (WeakMap keyed by the
// animatable, one record per property). When a new ease arrives for a property
// with a live record, we read the old curve's position/velocity analytically
// and seed the new animation with that velocity — the same trick Apple's
// animation stack uses for retargeting.
//
// Custom curves (splines, springs) are applied with a per-frame driver: the
// transition itself stays fully native (its mode is whatever the shell set;
// completion signals, remove-on-complete and the shell's own callbacks all
// keep working) and a connect_after('new-frame') handler writes the property
// right after the transition's class handler each frame. No GI imports —
// callers pass duck-typed targets, so the prefs side can reuse the math.

import {compileCurve, makeSpring} from './easing.js';

// target (GObject) -> Map(propName -> record)
const registry = new WeakMap();

// Entry velocity (normalized: progress-units per new duration) worth reacting
// to at all. Below MIN the plain curve is indistinguishable; above MAX no
// curve can honor the flick gracefully.
const MIN_V0 = 0.25;
const MAX_V0 = 4;

function record(target, prop) {
    return registry.get(target)?.get(prop) ?? null;
}

function noteAnimation(target, prop, curve, compiled, init, final, durationMs) {
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
    });
}

export function forgetAnimation(target, prop) {
    registry.get(target)?.delete(prop);
}

// Read position/velocity of the animation we previously started on
// target[prop]. Returns null when we have no live record (native animation,
// finished long ago, or started before the extension loaded).
function sampleMotion(target, prop, now) {
    const r = record(target, prop);
    if (!r)
        return null;
    const tau = (now - r.startedAt) / r.durationMs;
    if (tau < 0 || tau > 1.25)
        return null;
    const t = Math.min(tau, 1);
    return {
        value: r.init + (r.final - r.init) * r.compiled.eval(t),
        // units: property-units per ms
        velocity: (r.final - r.init) * r.compiled.deriv(t) / r.durationMs,
    };
}

// Compute the entry velocity (normalized progress per new duration) for a
// retargeted animation, or null when continuity shouldn't apply.
export function entryVelocity(target, prop, newTarget, newDurationMs, now = Date.now()) {
    const m = sampleMotion(target, prop, now);
    if (!m)
        return null;
    const remaining = newTarget - m.value;
    if (Math.abs(remaining) < 1e-6)
        return null;
    // Reversal (old motion runs away from the new target): the plain curve
    // is correct there, don't fight it.
    if (m.velocity * remaining <= 0)
        return null;
    const v0 = m.velocity * newDurationMs / Math.abs(remaining);
    if (v0 < MIN_V0)
        return null;
    return Math.min(v0, MAX_V0);
}

// Velocity-matched retarget curve: a spring that starts at progress 0 with
// the measured velocity (v0 normalized per duration) and settles at 1 within
// the window. Damping keeps a light overshoot; omega is tuned so the
// transient dies out by the end of the duration.
function retargetCompiled(v0, durationMs) {
    const T = Math.max(durationMs, 150) / 1000;
    const zeta = 0.8;
    const omega = Math.min(4.6 / (zeta * T), 30);
    return makeSpring(zeta, omega, v0 / T, T);
}

// Attach the per-frame driver for a custom curve (or a velocity-matched
// retarget, v0 != null). `target.get_transition(prop)` must return the live
// transition; `write(value)` applies a raw number to the animated property.
// Returns the transition or null when driving isn't possible (no live
// transition, non-numeric interval, zero duration).
export function driveTransition(target, prop, curve, write, v0 = null) {
    const tr = target.get_transition?.(prop);
    // a Clutter.Transition IS a Clutter.Timeline — use it directly
    if (!tr?.is_playing?.())
        return null;
    const iv = tr.get_interval?.();
    if (!iv)
        return null;
    const init = iv.peek_initial_value();
    const final = iv.peek_final_value();
    const dur = tr.get_duration();
    if (!(dur > 0) || !Number.isFinite(init) || !Number.isFinite(final))
        return null;

    const T = dur / 1000;
    let compiled;
    if (v0 !== null && curve.kind !== 'spring') {
        // interrupted + non-spring selection → universal spring retarget
        compiled = retargetCompiled(v0, dur);
    } else if (curve.kind === 'spring') {
        compiled = compileCurve(curve, v0 === null ? 0 : v0 / T, T);
    } else {
        compiled = compileCurve(curve);
    }

    const isNumeric = curve.kind === 'spring' && curve.solver === 'numeric';

    const handler = tr.connect_after('new-frame', (timeline, elapsed) => {
        const tau = Math.min(elapsed, dur) / dur;
        if (isNumeric)
            write(init + (final - init) * compiled.advanceTo(tau));
        else
            write(init + (final - init) * compiled.eval(tau));
    });

    noteAnimation(target, prop, curve, compiled, init, final, dur);
    tr.connect('stopped', () => {
        tr.disconnect(handler);
        forgetAnimation(target, prop);
    });
    return tr;
}

// For plain-mode animations there is no driver; we only register the record
// so a later interruption can read the velocity. getTransition() must return
// the live transition for the property (or null).
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
    const compiled = compileCurve(curve);
    noteAnimation(target, prop, curve, compiled, init, final, dur);
    tr.connect('stopped', () => forgetAnimation(target, prop));
}
