// Overview open/close probe under the current curve: settle with the
// overview hidden (fresh state), open it, sample paints and liveness
// through the animation window, close it again. A wedged shell leaves
// RESULT at 'pending' with paints frozen - the caller treats that as the
// freeze signature.
globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
if (Main.overview.visible)
    Main.overview.hide();
let paints = 0;
const ph = global.stage.connect('after-paint', () => paints++);
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500,
    () => { r(); return GLib.SOURCE_REMOVE; }));
paints = 0;
const t0 = Date.now();
Main.overview.show();
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200,
    () => { r(); return GLib.SOURCE_REMOVE; }));
const p1 = paints;
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000,
    () => { r(); return GLib.SOURCE_REMOVE; }));
global.stage.disconnect(ph);
globalThis.RESULT = JSON.stringify({openedAt: Date.now() - t0,
    paintsDuring: p1, paintsAfter: paints,
    visible: Main.overview.visible});
})()
