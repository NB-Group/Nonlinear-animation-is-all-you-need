// Drawer open→interrupt-close on the live session: sample the state
// adjustment to see whether the interruption reverses, replays, or nods.
(async () => {
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const GLib = imports.gi.GLib;
const controls = Main.overview._overview.controls;
const adj = controls._stateAdjustment;
const out = {trace: [], events: []};

Main.overview.show();
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
    out.events.push(['open-click', +adj.value.toFixed(3)]);
    Main.overview.dash.showAppsButton.checked = true;    // drawer opens
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
        out.events.push(['close-click', +adj.value.toFixed(3)]);
        Main.overview.dash.showAppsButton.checked = false;   // interrupt
        return GLib.SOURCE_REMOVE;
    });
    return GLib.SOURCE_REMOVE;
});

let n = 0;
const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
    out.trace.push(+adj.value.toFixed(3));
    if (++n >= 60) {
        GLib.source_remove(id);
        Main.overview.hide();
        globalThis.RESULT = JSON.stringify(out);
        return GLib.SOURCE_REMOVE;
    }
    return GLib.SOURCE_CONTINUE;
});
globalThis.RESULT = 'PENDING';
})()
