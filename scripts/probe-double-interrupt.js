globalThis.RESULT = 'recording';
(async () => {
const GLib = imports.gi.GLib;
const actors = global.get_window_actors();
const a = actors.find(w => w.meta_window?.get_wm_class?.() === 'org.gnome.Calculator');
if (!a) {
    globalThis.RESULT = 'no-calc';
} else {
    if (!a.meta_window.minimized)
        a.meta_window.minimize();
    await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => {
        r();
        return GLib.SOURCE_REMOVE;
    }));
    const tr = [];
    const t0 = Date.now();
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => {
        tr.push([Date.now() - t0, Math.round(a.x), Math.round(a.y),
            +a.scale_x.toFixed(3), +a.scale_y.toFixed(3), a.opacity]);
        return GLib.SOURCE_CONTINUE;
    });
    a.meta_window.unminimize();              // restore starts
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
        tr.push(['INTERRUPT-POINT', Math.round(a.x), Math.round(a.y),
            +a.scale_x.toFixed(3)]);
        a.meta_window.minimize();            // interrupt at +0.3s
        return GLib.SOURCE_REMOVE;
    });
    await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2400, () => {
        r();
        return GLib.SOURCE_REMOVE;
    }));
    GLib.source_remove(id);
    a.meta_window.unminimize();
    globalThis.RESULT = JSON.stringify(tr);
}
})()
