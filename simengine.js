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
//     requested duration); position and velocity carry over untouched;
//   - one master Clutter timeline ticks every frame, semi-implicit Euler
//     integrates every live sim and writes the value through the same
//     ClutterAnimatable channel the bridge driver uses;
//   - the NATIVE transition underneath keeps owning completion semantics
//     (onComplete/onStopped/remove-on-complete), so the shell cannot tell
//     the difference; when it completes we snap the sim onto the target.
//
// No GI imports for Clutter beyond the timeline handed in by the caller;
// writes go through a caller-supplied closure, same as continuity.js.

const EPS_POS = 1e-4;
const EPS_VEL = 1e-4;

// actor -> Map(prop -> sim)
const sims = new WeakMap();
let master = null;   // caller-provided {start(), stop()} frame driver
let running = false;
let lastTick = 0;

function tick() {
    const now = Date.now();
    // clamp dt: a long stall (GC, VT switch) must not explode the springs
    const dt = Math.min((now - lastTick) / 1000, 1 / 20);
    lastTick = now;
    let live = 0;
    for (const entry of [...registryList]) {
        for (const sim of entry.sims.values()) {
            integrate(sim, dt);
            try {
                sim.write(sim.pos);
            } catch {
                dropSim(entry.actor, sim.prop);
                continue;
            }
            live++;
        }
    }
    if (live === 0 && master) {
        master.stop();
        running = false;
    }
}

// Semi-implicit Euler on the normalized spring; sim.pos/vel are in PROPERTY
// units, the spring parameters are derived per retarget so the motion
// settles within the requested duration.
function integrate(sim, dt) {
    const k = sim.omega * sim.omega;
    const c = 2 * sim.zeta * sim.omega;
    const dx = sim.target - sim.pos;
    const a = k * dx - c * sim.vel;
    sim.vel += a * dt;
    sim.pos += sim.vel * dt;
}

const registryList = [];

function dropSim(actor, prop) {
    const entry = registryList.find(e => e.actor === actor);
    entry?.sims.delete(prop);
    if (entry && entry.sims.size === 0) {
        const i = registryList.indexOf(entry);
        if (i >= 0)
            registryList.splice(i, 1);
    }
}

// Feed one animation into the engine. `initValue` is the CURRENT visual
// value of the property (a first takeover starting at the target would not
// move at all); `write` applies a raw number; `durationMs` tunes the spring
// so the motion reads like that duration.
export function simRetarget(actor, prop, initValue, target, durationMs,
    write, onActorDestroy) {
    let entry = sims.get(actor);
    if (!entry) {
        entry = new Map();
        sims.set(actor, entry);
        const listEntry = {actor, sims: entry};
        registryList.push(listEntry);
        try {
            onActorDestroy(() => {
                const i = registryList.indexOf(listEntry);
                if (i >= 0)
                    registryList.splice(i, 1);
                sims.delete(actor);
            });
        } catch {
            // actor without a destroy signal; the write-failure path prunes
        }
    }
    const T = Math.max(durationMs, 1) / 1000;
    const zeta = 0.92;
    // settle (<=1% envelope) within T, same tuning rule as compileCurve
    const omega = Math.max(4.6 / (zeta * T), 1);
    const prev = entry.get(prop);
    if (prev) {
        // THE interruption case: position and velocity carry over exactly;
        // only the rest point and tuning change.
        prev.target = target;
        prev.omega = omega;
        prev.zeta = zeta;
        prev.write = write;
        wake();
        return prev;
    }
    const sim = {
        prop,
        pos: Number.isFinite(initValue) ? initValue : target,
        vel: 0,
        target,
        omega,
        zeta,
        write,
    };
    entry.set(prop, sim);
    wake();
    return sim;
}

function wake() {
    if (master && !running) {
        lastTick = Date.now();
        master.start();
        running = true;
    }
}

// Seed a sim's state from the CURRENT visual value and velocity (used when
// the engine takes over a property that was animated by the native path or
// by the bridge): without this, a first retarget mid-flight would start
// from the target instead of the screen.
export function simSeed(actor, prop, value, velocity) {
    const entry = sims.get(actor);
    const sim = entry?.get(prop);
    if (sim && Number.isFinite(value)) {
        sim.pos = value;
        if (Number.isFinite(velocity))
            sim.vel = velocity;
    }
    return sim ?? null;
}

// The native transition completed (or was replaced): land exactly on the
// target and retire the sim. Callers check currency (that a newer
// transition has not taken the slot) before invoking this.
export function simSettle(actor, prop, target) {
    const entry = sims.get(actor);
    const sim = entry?.get(prop);
    if (!sim)
        return;
    try {
        sim.write(target);
    } catch {
        // actor gone
    }
    dropSim(actor, prop);
}

export function simDropActor(actor) {
    const i = registryList.findIndex(e => e.actor === actor);
    if (i >= 0)
        registryList.splice(i, 1);
    sims.delete(actor);
}

export function startEngine(makeFrameDriver) {
    if (master)
        return;
    master = makeFrameDriver(() => tick());
    lastTick = Date.now();
    master.start();
    running = true;
}

export function stopEngine() {
    master?.stop();
    master = null;
    running = false;
    registryList.length = 0;
}
