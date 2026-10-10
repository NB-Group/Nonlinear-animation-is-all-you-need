globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const pump = new Clutter.Actor({width: 1, height: 1, opacity: 255,
    reactive: false});
Main.layoutManager.uiGroup.add_child(pump);
let on = false;
const id = GLib.timeout_add(GLib.PRIORITY_HIGH_IDLE, 8, () => {
    pump.opacity = (on = !on) ? 254 : 255;
    return GLib.SOURCE_CONTINUE;
});
const sleep = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
await sleep(15000);
GLib.source_remove(id);
pump.destroy();
globalThis.RESULT = 'pump-done';
})()
