globalThis.RESULT = "recording"; (async () => {
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const ov = Main.overview;
const adj = ov._overview.controls._stateAdjustment;
const appDisplay = ov._overview.controls._appDisplay;

const log = [];
const t0 = Date.now();
const stamp = tag => log.push([Date.now() - t0, tag, +adj.value.toFixed(2),
    appDisplay.visible ? 'appVis' : 'appHid']);

adj.connect('notify::value', () => {
    if (log.length < 400 && (log.length === 0 ||
        Date.now() - t0 - log[log.length - 1][0] > 16))
        stamp('adj');
});
for (const sig of ['showing', 'shown', 'hiding', 'hidden'])
    ov.connect(sig, () => stamp(sig));

await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

globalThis.RESULT = JSON.stringify(log.slice(0, 200));
})()
