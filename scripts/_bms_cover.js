globalThis.RESULT = 'pending';
(async () => {
    const GLib = imports.gi.GLib;
    const St = imports.gi.St;
    const Main = await import('resource:///org/gnome/shell/ui/main.js');
    if (globalThis.__animA) { globalThis.__animA.destroy(); globalThis.__animA = null; }
    // A fullscreen opaque layer: the coverage-freeze path should stop the
    // overview/dock blur surfaces from repainting entirely.
    const a = new St.Widget({width: 1920, height: 1200,
        style: 'background:#101418;'});
    Main.uiGroup.add_child(a);
    Main.uiGroup.set_child_above_sibling(a, null);
    globalThis.__animA = a;
    globalThis.RESULT = 'fullscreen-cover';
})()
