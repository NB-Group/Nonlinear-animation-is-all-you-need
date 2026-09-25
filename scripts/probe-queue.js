globalThis.RESULT = 'recording';
(async () => {
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const ov = Main.overview;
const adj = ov._overview.controls._stateAdjustment;

if (ov.visible)
    ov.hide();
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

const trace = [];
let n = 0;
const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
    trace.push([+adj.value.toFixed(2), ov.visible ? 1 : 0]);
    return GLib.SOURCE_CONTINUE;
});

ov.show(2);   // drawer opens from desktop (first click)
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
ov.hide();    // second click equivalent
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1800, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
GLib.source_remove(id);
const vals = trace.map(t => t[0]);
const hideIdx = Math.round(1150 / 30);   // approx index of hide click
globalThis.RESULT = JSON.stringify({
    vals,
    visTail: trace.slice(-8).map(t => t[1]),
    maxAfterHide: Math.max(...vals.slice(hideIdx)),
    patchInstalled: ov._animateNotVisible.toString().includes('gestureEnd'),
    shownStateNow: ov._shownState,
});
})()
