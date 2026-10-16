globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const a = new St.Button({label: 'X', width: 40, height: 40,
    style: 'background:#f66;'});
Main.uiGroup.add_child(a);
a.set_position(100, 600);
a.ease({x: 1400, duration: 400});
const rows = [];
for (let i = 0; i < 6; i++) {
    await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120,
        () => { r(); return GLib.SOURCE_REMOVE; }));
    const tr = a.get_transition('x');
    rows.push([i * 120, +a.x.toFixed(0),
        tr ? +tr.get_progress().toFixed(2) : null]);
}
a.destroy();
globalThis.RESULT = JSON.stringify(rows);
})()