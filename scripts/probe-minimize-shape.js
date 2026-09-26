globalThis.RESULT = 'recording';
(async () => {
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const actors = global.get_window_actors();
const victim = actors.find(a =>
    a.meta_window?.get_wm_class?.() === 'com.mattjakeman.ExtensionManager') ??
    actors.find(a => a.meta_window && !a.meta_window.minimized);
if (!victim) {
    globalThis.RESULT = 'no-window';
} else {
    const a = victim;
    const trace = [];
    const t0 = Date.now();
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => {
        trace.push([Date.now() - t0, +a.scale_x.toFixed(3), a.opacity]);
        return GLib.SOURCE_CONTINUE;
    });
    a.meta_window.minimize();
    await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1400, () => {
        r();
        return GLib.SOURCE_REMOVE;
    }));
    GLib.source_remove(id);
    // restore for the user
    a.meta_window.unminimize();
    globalThis.RESULT = JSON.stringify(trace.slice(0, 40));
}
})()
