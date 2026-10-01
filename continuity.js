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
// GLib is imported only for the sampler timer; the rest stays duck-typed.

import GLib from 'gi://GLib';
import {compileCurve} from './easing.js';

// target (GObject) -> Map(propName -> record)
const registry = new WeakMap();

// How long a finished animation's motion state stays bridging-eligible.
const STATE_GRACE_MS = 250;
// Normalized entry velocity below which momentum is imperceptible.
export const MIN_V0 = 0.15;
// Above this no curve can honor the flick gracefully.
export const MAX_V0 = 4;

// Visual sampler: the analytic reconstruction of a registered animation
// (wall-clock since ease + closed-form curve) drifts from what is actually
// painted — window unminimize starts measurably later than its ease call,
// and the effective curve differs from the assumed one. Bridging from the
// analytic position then TELEPORTED the window at the interrupt. While a
// record is live, sample the real property value every 50ms (a handful of
// property reads; no JS per frame) and trust the freshest sample instead.
const SAMPLE_MS = 25;
const SAMPLE_FRESH_MS = 150;
const samplers = new Set();  // {ref: WeakRef(target), read(), rec}
let samplerId = 0;

function pumpSamplers() {
    const now = Date.now();
    for (const s of [...samplers]) {
        if (s.rec.stoppedAt && now - s.rec.stoppedAt > STATE_GRACE_MS) {
            samplers.delete(s);
            continue;
        }
        const t = s.ref.deref();
        if (!t) {
            samplers.delete(s);
            continue;
        }
        let v;
        try {
            v = s.read();
        } catch {
            samplers.delete(s);
            continue;
        }
        if (typeof v !== 'number' || !Number.isFinite(v))
            continue;
        s.rec.samples.push([now, v]);
        if (s.rec.samples.length > 6)
            s.rec.samples.shift();
    }
    if (samplers.size === 0 && samplerId) {
        GLib.source_remove(samplerId);
        samplerId = 0;
    }
    return GLib.SOURCE_CONTINUE;
}

function startSampler(target, prop, rec, read) {
    if (!rec.samples)
        rec.samples = [];
    samplers.add({ref: new WeakRef(target), read, rec});
    if (!samplerId) {
        samplerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAMPLE_MS,
            pumpSamplers);
    }
}

function record(target, prop) {
    return registry.get(target)?.get(prop) ?? null;
}

function noteAnimation(target, prop, compiled, init, final, durationMs,
    read = null) {
    let m = registry.get(target);
    if (!m) {
        m = new Map();
        registry.set(target, m);
    }
    const rec = {
        compiled,
        init,
        final,
        durationMs,
        startedAt: Date.now(),
        stoppedAt: 0,
        samples: [],
    };
    m.set(prop, rec);
    if (read)
        startSampler(target, prop, rec, read);
    return rec;
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
    // Prefer a fresh visual sample: it is the true painted position, immune
    // to start latency and curve mismatch (see samplers above). Extrapolate
    // it linearly to `now` with the sampled velocity — at an expo-curve
    // sprint (several units per 50ms sample) the raw sample alone is far
    // behind what is on screen right now.
    const s = r.samples;
    if (s?.length && now - s[s.length - 1][0] <= SAMPLE_FRESH_MS) {
        const [tw, vw] = s[s.length - 1];
        let velocity = 0;
        if (s.length >= 2) {
            const [pw, pv] = s[s.length - 2];
            if (tw - pw > 5)
                velocity = (vw - pv) / (tw - pw);
        }
        let value = vw + velocity * (now - tw);
        const lo = Math.min(r.init, r.final);
        const hi = Math.max(r.init, r.final);
        const slack = 0.05 * (hi - lo);
        value = Math.max(lo - slack, Math.min(hi + slack, value));
        return {
            value,
            velocity,
            init: r.init,
            final: r.final,
            playing: !r.stoppedAt,
        };
    }
    const tau = Math.min((now - r.startedAt) / r.durationMs, 1);
    return {
        value: r.init + (r.final - r.init) * r.compiled.eval(tau),
        velocity: (r.final - r.init) * r.compiled.deriv(tau) / r.durationMs,
        init: r.init,
        final: r.final,
        playing: !r.stoppedAt,
    };
}

// Elastic retarget: a lightly damped spring seeded with the FULL measured
// entry velocity. Velocity stays continuous across the interrupt — the
// window keeps its speed, decelerates over a visible stretch like it hit
// something soft, then springs toward the new target. Clamping the entry
// shallow was tried and is wrong: at a fast interrupt the carried speed was
// chopped to a fraction in one frame, which read as a hard stop followed by
// a big positional nod (the nod depth scales with the remaining travel).
const RETARGET_DAMPING = 0.92;
function retargetCompiled(v0, durationMs) {
    const T = durationMs / 1000;
    // progress/sec; a dead-zone interrupt (entry ~0) still departs briskly
    let entry = v0 / T;
    if (Math.abs(entry) < 0.3 / T)
        entry = entry < 0 ? -0.3 / T : 0.3 / T;
    // compileCurve's omega floor is tuned for zero entry velocity; a seeded
    // spring can still be moving at timeline end, and the final write then
    // teleports the residual. Stiffen until the spring lands on the target
    // by tau = 1 (checked, not assumed).
    const floor = 4.6 / (RETARGET_DAMPING * T);
    let omega = floor;
    let compiled = null;
    for (let i = 0; i < 6; i++) {
        compiled = compileCurve({kind: 'spring', damping: RETARGET_DAMPING,
            omega}, entry, T);
        if (Math.abs(compiled.eval(1) - 1) < 0.015)
            return compiled;
        omega = Math.max(omega * 1.6, floor + i / T);
    }
    return compiled;
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
    if (v0 !== null && curve.kind !== 'spring') {
        // Any seeded interruption uses the velocity-matched retarget curve —
        // including low-velocity ones: falling back to the selected curve
        // here replays its slow-start region (see retargetCompiled).
        compiled = retargetCompiled(v0, dur);
    } else if (curve.kind === 'spring') {
        compiled = compileCurve(curve, v0 === null ? 0 : v0 / T, T);
    } else {
        compiled = compileCurve(curve);
    }

    const isNumeric = curve.kind === 'spring' && curve.solver === 'numeric';
    const range = final - init;
    // A seeded reversal nods beyond its start point; on POSITION properties
    // (x/y over hundreds of pixels) a deep nod flings the window off-screen.
    // Keep every driven value inside the travel band plus a little slack.
    const lo = Math.min(init, final) - 0.10 * Math.abs(range);
    const hi = Math.max(init, final) + 0.10 * Math.abs(range);
    const clamp = v => Math.max(lo, Math.min(hi, v));

    const handler = tr.connect_after('new-frame', (timeline, elapsed) => {
        if (elapsed >= dur) {
            // final frame: land exactly on the target instead of leaving the
            // curve's last sampled (≈1) value
            write(final);
            return;
        }
        const tau = elapsed / dur;
        if (isNumeric)
            write(clamp(init + range * compiled.advanceTo(tau)));
        else
            write(clamp(init + range * compiled.eval(tau)));
    });

    // Write the first value in the same main-loop turn the driver is
    // attached: between the caller's reset (the shell normalizes window
    // scale to 1.0 at minimize time) and the first new-frame tick, a frame
    // can paint the reset state. At an early interrupt that is a full-size
    // flash before the bridged animation takes over.
    if (isNumeric)
        write(init + range * compiled.advanceTo(0));
    else
        write(init + range * compiled.eval(0));

    noteAnimation(target, prop, compiled, init, final, dur, () => target[prop.replaceAll('-', '_')]);
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
    noteAnimation(target, prop, compileCurve(curve), init, final, dur, () => target[prop.replaceAll('-', '_')]);
    tr.connect('stopped', () => {
        const r = record(target, prop);
        if (r)
            r.stoppedAt = Date.now();
    });
}

// Seed an ADJUSTMENT transition with continuity, entirely through native
// mechanics: rewriting the interval's initial value bridges over a
// reset-to-start (anti-teleport), and a native cubic-bezier progress curve
// whose initial slope equals the measured velocity carries the momentum.
// No JS runs per frame on adjustments — their value writes go through
// notify::value, and the controls layer's reaction to that makes mutter kill
// any transition we drive from connect_after.
// `gv` is a preallocated GValue typed to the property's GType; `bezier` is a
// Graphene.Point pair builder; both passed in to keep this module GI-free.
export function seedAdjustmentTransition(target, prop, seed, makeCompiled,
    gv, setGv, points) {
    const tr = target.get_transition?.(prop);
    if (!tr?.is_playing?.())
        return null;
    const iv = tr.get_interval?.();
    if (!iv)
        return null;
    const final = iv.peek_final_value();
    let init = iv.peek_initial_value();
    if (seed?.fromValue !== undefined && Number.isFinite(seed.fromValue)) {
        setGv(seed.fromValue);
        iv.set_initial(gv);
        init = seed.fromValue;
    }
    const dur = tr.get_duration();
    if (!(dur > 0) || !Number.isFinite(init) || !Number.isFinite(final))
        return null;

    const v0 = seed?.v0 ?? 0;
    let m0 = Math.max(-1.2, Math.min(1.5, 0.85 * v0));
    // Same rule as retargetCompiled: an interruption never restarts from a
    // standstill, even when the measured velocity is tiny.
    if (m0 > -0.15 && m0 < 0.3)
        m0 = 0.3;
    if (Math.abs(m0) >= 0.05) {
        // bezier initial slope dProgress/dTau = p1y / p1x
        const p1x = 0.32;
        const p1y = Math.max(-0.45, Math.min(0.5, m0 * p1x));
        tr.set_cubic_bezier_progress(points(p1x, p1y), points(0.62, 1.0));
    }
    noteAnimation(target, prop, makeCompiled(m0), init, final, dur, () => target[prop.replaceAll('-', '_')]);
    tr.connect('stopped', () => {
        const r = record(target, prop);
        if (r)
            r.stoppedAt = Date.now();
    });
    return tr;
}
