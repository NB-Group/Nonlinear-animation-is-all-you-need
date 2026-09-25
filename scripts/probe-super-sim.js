globalThis.RESULT = 'recording';
(async () => {
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const ov = Main.overview;
const controls = ov._overview.controls;
const adj = controls._stateAdjustment;

if (ov.visible)
    ov.hide();
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

const log = [];
let recording = true;
const sample = () => {
    if (!recording)
        return GLib.SOURCE_REMOVE;
    log.push([
        Math.round(+adj.value.toFixed(2) * 100) / 100,
        Math.round(controls._workspacesDisplay.opacity),
        Math.round(controls._appDisplay.opacity),
        Math.round(controls._thumbnailsBox.opacity),
        Math.round(controls._appDisplay.translation_y ?? 0),
    ]);
    return GLib.SOURCE_CONTINUE;
};
const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 33, sample);

// super #1: open overview
ov.show();
// super #2 at 150ms (transitioning upward): _shiftState(UP), exactly what
// the overlay-key handler does when shouldShift
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
    controls._shiftState(Meta.MotionDirection.UP);
    return GLib.SOURCE_REMOVE;
});

await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
recording = false;
GLib.source_remove(id);
ov.hide();
globalThis.RESULT = JSON.stringify(log);
})()
