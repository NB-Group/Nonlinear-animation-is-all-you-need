// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Persistent spring-simulation engine for "Nonlinear animation is all you
// need".
//
// The bridge architecture (reconstruct state from a record, seed a new
// curve per interruption) accumulates estimation error across rapid
// interruption chains: opacity drift, position teleports. iOS/macOS never
// rebuild state because every property runs as ONE persistent spring whose
// (position, velocity) IS the animation state; interrupting means changing
// the spring's rest point and nothing else.
//
// This module implements that model for actor properties:
//   - one sim per (actor, property), surviving across transitions;
//   - a retarget changes the target (and re-tunes stiffness from the new
//     requested duration); position and velocity carry over untouched —
//     initValue from the caller is applied ONLY at first takeover, because
//     by then the shell's reset has already happened;
//   - integration runs per transition via the caller's
//     connect_after('new-frame') handler (same write-ordering guarantee as
//     the bridge driver: always after the native write), semi-implicit
//     Euler with the frame's own delta;
//   - the NATIVE transition underneath keeps owning completion semantics;
//     when it stops we settle the sim onto the target unless a newer
//     transition has already retargeted it.
//
// No GI imports; writes go through a caller-supplied closure.

// actor -> Map(prop -> sim)
const sims = new WeakMap();

function integrate(sim, dt) {
    const k = sim.omega * sim.omega;
    const c = 2 * sim.zeta * sim.omega;
    const dx = sim.target - sim.pos;
    const a = k * dx - c * sim.vel;
    sim.vel += a * dt;
    sim.pos += sim.vel * dt;
}

// Hand one animation to the engine. Returns {sim, fresh}: an EXISTING sim
// keeps its position/velocity (the interruption case — that state is the
// whole point); a fresh one starts at initValue.
export function simRetarget(actor, prop, initValue, target, durationMs,
    write) {
    let entry = sims.get(actor);
    if (!entry) {
        entry = new Map();
        sims.set(actor, entry);
    }
    const T = Math.max(durationMs, 1) / 1000;
    const zeta = 0.92;
    // settle (<=1% envelope) within T, same tuning rule as compileCurve
    const omega = Math.max(4.6 / (zeta * T), 1);
    const prev = entry.get(prop);
    if (prev) {
        prev.target = target;
        prev.omega = omega;
        prev.zeta = zeta;
        prev.write = write;
        return {sim: prev, fresh: false};
    }
    const sim = {
        pos: Number.isFinite(initValue) ? initValue : target,
        vel: 0,
        target,
        omega,
        zeta,
        write,
    };
    entry.set(prop, sim);
    return {sim, fresh: true};
}

// Seed a sim's velocity (first takeover from the bridge path). Position is
// only applied on fresh sims for the same reason as above.
export function simSeed(actor, prop, value, velocity) {
    const sim = sims.get(actor)?.get(prop);
    if (!sim)
        return null;
    if (Number.isFinite(value))
        sim.pos = value;
    if (Number.isFinite(velocity))
        sim.vel = velocity;
    return sim;
}

// One frame of the simulation, driven from the transition's own
// connect_after('new-frame'). Writes the integrated position through the
// stored closure and returns it (null if the sim is gone or the write
// failed — the caller should then stop ticking).
export function simAdvance(actor, prop, dtMs) {
    const sim = sims.get(actor)?.get(prop);
    if (!sim)
        return null;
    const dt = Math.min(Math.max(dtMs, 0) / 1000, 0.05);
    if (dt > 0)
        integrate(sim, dt);
    try {
        sim.write(sim.pos);
    } catch {
        return null;
    }
    return sim.pos;
}

// The native transition completed (or was replaced): land exactly on the
// target and retire the sim. Callers check currency before invoking.
export function simSettle(actor, prop, target) {
    const sim = sims.get(actor)?.get(prop);
    if (!sim)
        return;
    try {
        sim.write(target);
    } catch {
        // actor gone
    }
    sims.get(actor)?.delete(prop);
}

export function simDropActor(actor) {
    sims.delete(actor);
}
