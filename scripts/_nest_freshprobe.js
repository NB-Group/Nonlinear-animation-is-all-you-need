// End-to-end fresh-animation probe: create a real actor, run ONE fresh
// ease (no interruption), sample the actual x trajectory per frame, and
// compare it against the compiled selected curve and against stock
// EASE_OUT_CUBIC. This is the user-visible contract for custom curves:
// a fresh animation must FOLLOW the selected curve.
//
// Usage: DBUS_SESSION_BUS_ADDRESS=$(cat ~/.cache/nla/nested-bus) \
//     python3 scripts/shell-eval.py scripts/_nest_freshprobe.js 8
globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const Easing = await import('file:///mnt/Code/Nonlinear-animation-is-all-you-need/easing.js');

const curve = {kind: 'spline',
    points: [[0, 0], [0.05, 0.52], [0.32, 0.98], [1, 1]]};
const compiled = Easing.compileCurve(curve);

const actor = new Clutter.Actor({
    x: 0, y: 200, width: 60, height: 60,
});
Main.uiGroup.add_child(actor);

let paints = 0;
const ph = global.stage.connect('after-paint', () => paints++);
const TARGET = 300;
const t0 = Date.now();
const log = [];
actor.ease({x: TARGET, duration: 600,
    mode: Clutter.AnimationMode.EASE_OUT_CUBIC});
const tr = actor.get_transition('x');
const dur = tr ? tr.get_duration() : 0;

const id = GLib.timeout_add(GLib.PRIORITY_HIGH, 16, () => {
    log.push([Date.now() - t0, actor.x]);
    return GLib.SOURCE_CONTINUE;
});
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3200,
    () => { r(); return GLib.SOURCE_REMOVE; }));
GLib.source_remove(id);
global.stage.disconnect(ph);
Main.uiGroup.remove_child(actor);

if (paints === 0) {
    globalThis.RESULT = 'INVALID: 0 paints (occluded)';
    return;
}
if (!(dur > 0)) {
    globalThis.RESULT = `FAIL: no transition (dur=${dur})`;
    return;
}
let maxDev = 0, maxCubic = 0;
const checkpoints = [];
for (const [t, x] of log) {
    const tau = Math.min(1, t / dur);
    const want = TARGET * compiled.eval(tau);
    const cubic = TARGET * (1 - Math.pow(1 - tau, 3));
    maxDev = Math.max(maxDev, Math.abs(x - want));
    maxCubic = Math.max(maxCubic, Math.abs(x - cubic));
    if ([0.1, 0.25, 0.5, 0.75].some(f =>
            Math.abs(tau - f) < 0.02))
        checkpoints.push({tau: +tau.toFixed(2), x: +x.toFixed(1),
            spline: +want.toFixed(1), cubic: +cubic.toFixed(1)});
}
const verdict = maxDev < 0.05 * TARGET
    ? (maxCubic > 0.1 * TARGET ? 'FOLLOWS-SPLINE' : 'AMBIGUOUS')
    : (maxCubic < 0.05 * TARGET ? 'FOLLOWS-STOCK-CUBIC' : 'NEITHER');
globalThis.RESULT = JSON.stringify({dur, paints, samples: log.length,
    maxDev: +maxDev.toFixed(1), maxCubic: +maxCubic.toFixed(1),
    verdict, checkpoints});
})()
