globalThis.RESULT = 'recording';
(async () => {
const GLib = imports.gi.GLib;
const actors = global.get_window_actors();
const a = actors.find(w => w.meta_window?.get_wm_class?.() === 'org.nla.T1');
if (!a) {
    globalThis.RESULT = 'no-test-window';
    return;
}
if (!a.meta_window.minimized)
    a.meta_window.minimize();
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
const tr = [];
const t0 = Date.now();
const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => {
    try {
        tr.push([Date.now() - t0, Math.round(a.x), Math.round(a.y),
            +a.scale_x.toFixed(3), +a.scale_y.toFixed(3), a.opacity]);
    } catch (e) {
        tr.push([Date.now() - t0, 'gone']);
    }
    return GLib.SOURCE_CONTINUE;
});
a.meta_window.unminimize();              // restore starts
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
    try {
        tr.push(['INTERRUPT', Math.round(a.x), a.scale_x, a.opacity]);
    } catch (e) {}
    a.meta_window.minimize();            // reversal interrupt at +0.3s
    return GLib.SOURCE_REMOVE;
});
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2400, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
GLib.source_remove(id);

// Self-verdict over the numeric samples:
// 1. teleport: consecutive dx/dy jump larger than 8% of the total x travel
//    between two 25ms samples is a snap, not motion.
// 2. scale continuity at the interrupt: scale must not jump backwards by
//    more than 25% of its range in one sample.
// 3. opacity should follow scale (position-derived), never reach 0 while
//    scale is mid-range.
const nums = tr.filter(s => typeof s[1] === 'number');
const xs = nums.map(s => s[1]);
const span = Math.max(...xs) - Math.min(...xs);
let teleports = 0;
for (let i = 1; i < nums.length; i++)
    if (Math.abs(nums[i][1] - nums[i - 1][1]) > 0.08 * span + 2)
        teleports++;
let scaleJumps = 0;
for (let i = 1; i < nums.length; i++)
    if (Math.abs(nums[i][3] - nums[i - 1][3]) > 0.25)
        scaleJumps++;
let ghostOpacity = 0;
for (const s of nums)
    if (s[3] > 0.35 && s[3] < 0.9 && s[5] < 24)
        ghostOpacity++;
globalThis.RESULT = JSON.stringify({
    samples: nums.length, teleports, scaleJumps, ghostOpacity,
    jumps: nums.filter((s, i) => i > 0 &&
        Math.abs(s[3] - nums[i - 1][3]) > 0.25)
        .map(s => [s[0], s[1], s[3], s[5]]),
    trace: nums.map(s => [s[0], s[1], s[3], s[5]]),
    verdict: (teleports === 0 && scaleJumps === 0 && ghostOpacity === 0)
        ? 'PASS' : 'FAIL'});
})()