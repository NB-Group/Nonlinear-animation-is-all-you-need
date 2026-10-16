globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const a = new St.Button({label: 'X', width: 40, height: 40,
    style: 'background:#f66;'});
Main.uiGroup.add_child(a);
a.set_position(100, 600);
const t0 = Date.now();
a.ease({x: 1400, duration: 600});
const rows = [];
for (const wait of [100, 150, 100, 100]) {
    await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, wait,
        () => { r(); return GLib.SOURCE_REMOVE; }));
    const tr = a.get_transition('x');
    rows.push([Date.now() - t0, +(tr?.get_progress?.() ?? -1).toFixed(3),
        +a.x.toFixed(0)]);
}
a.destroy();
globalThis.RESULT = JSON.stringify(rows);
})()