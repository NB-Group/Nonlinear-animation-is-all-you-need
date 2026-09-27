globalThis.RESULT = 'recording';
(async () => {
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');

// find the calculator icon button
let icon = null;
for (const child of Main.overview.dash._box.get_children()) {
    const btn = child.child ?? child;
    const app = btn.app ?? btn._delegate?.app;
    if (app && app.get_id?.() === 'org.gnome.Calculator.desktop') {
        icon = btn;
        break;
    }
}
if (!icon) {
    globalThis.RESULT = 'no-icon';
} else {
    const a = global.get_window_actors().find(w =>
        w.meta_window?.get_wm_class?.() === 'org.gnome.Calculator');
    const tr = [];
    const t0 = Date.now();
    const marks = [];
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 25, () => {
        tr.push([Date.now() - t0, Math.round(a.x), Math.round(a.y),
            +a.scale_x.toFixed(3), +a.scale_y.toFixed(3), a.opacity,
            a.meta_window.minimized ? 1 : 0]);
        return GLib.SOURCE_CONTINUE;
    });
    const click = () => icon.emit('clicked');
    const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        r();
        return GLib.SOURCE_REMOVE;
    }));

    click();                    // dock click 1: minimize
    await wait(1200);
    marks.push(['restore-start', Math.round(a.scale_x * 100)]);
    click();                    // dock click 2: restore begins
    await wait(300);
    marks.push(['interrupt-at-300ms', Math.round(a.scale_x * 100)]);
    click();                    // dock click 3: interrupt the restore
    await wait(2000);
    GLib.source_remove(id);
    click();                    // final: leave it open
    await wait(600);
    globalThis.RESULT = JSON.stringify({marks, tr});
}
})()
