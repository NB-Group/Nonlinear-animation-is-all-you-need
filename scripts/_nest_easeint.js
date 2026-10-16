globalThis.RESULT = 'recording';
(async () => {
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Main = await import('resource:///org/gnome/shell/ui/main.js');

// Synthetic interruption, no WM dependencies: an St actor eased across the
// screen, interrupted mid-flight into the OPPOSITE target. The engine must
// bridge position and velocity (reversal buffering): no teleport, and the
// motion must not die to zero and re-accelerate from standstill.
const actor = new St.Button({label: 'X', width: 40, height: 40,
    style: 'background:#f66;'});
Main.uiGroup.add_child(actor);
actor.set_position(100, 500);

const tr = [];
const paints = {n: 0};
const paintHook = global.stage.connect('after-paint', () => paints.n++);
const t0 = Date.now();
const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
    try {
        tr.push([Date.now() - t0, +actor.x.toFixed(1)]);
    } catch (e) {}
    return GLib.SOURCE_CONTINUE;
});

actor.ease({x: 1400, duration: 600, mode: 2 /* linear base */});
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
const vBefore = (tr[tr.length - 1][1] - tr[tr.length - 8]?.[1] ?? tr[0][1]) /
    ((tr[tr.length - 1][0] - tr[tr.length - 8]?.[0] ?? tr[0][0]) || 1);
actor.ease({x: 100, duration: 600});          // opposite-direction interrupt
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
GLib.source_remove(id);
global.stage.disconnect(paintHook);
actor.destroy();

// Occlusion sentinel: the nested window throttles to near zero frames when
// the host fully/partially covers it, freezing every timeline — an
// under-painted run measures the rig, not the extension. Invalidate it.
if (paints.n < 25) {
    globalThis.RESULT = JSON.stringify({verdict: 'INVALID-OCCLUDED',
        paints: paints.n});
    return;
}

const nums = tr.filter(s => typeof s[1] === 'number' && s[0] < 1100);
const xs = nums.map(s => s[1]);
const span = Math.max(...xs) - Math.min(...xs);
let teleports = 0;
for (let i = 1; i < nums.length; i++)
    if (Math.abs(nums[i][1] - nums[i - 1][1]) > 0.12 * span + 4)
        teleports++;
// post-interrupt stall: within 120ms after the reversal, speed should stay
// above 15% of pre-interrupt speed (carried velocity, not a dead restart)
const iCut = nums.findIndex(s => s[0] >= 250);
const win = nums.filter(s => s[0] >= 250 && s[0] <= 370);
const speedAfter = win.length > 2
    ? Math.abs(win[win.length - 1][1] - win[0][1]) /
        ((win[win.length - 1][0] - win[0][0]) || 1) : 0;
const stalled = speedAfter < 0.15 * Math.abs(vBefore || 1);
globalThis.RESULT = JSON.stringify({
    span: +span.toFixed(0), teleports, stalled,
    speedBefore: +Math.abs(vBefore).toFixed(2),
    speedAfter: +speedAfter.toFixed(2),
    trace: nums.map(s => [s[0], s[1]]),
    verdict: teleports === 0 && !stalled ? 'PASS' : 'FAIL'});
})()