globalThis.RESULT = 'pending';
(async () => {
    const GLib = imports.gi.GLib;
    const St = imports.gi.St;
    const Main = await import('resource:///org/gnome/shell/ui/main.js');
    if (globalThis.__animA) { globalThis.__animA.destroy(); globalThis.__animA = null; }
    const a = new St.Widget({width: 400, height: 260,
        style: 'background:rgba(200,60,60,0.6);'});
    Main.uiGroup.add_child(a);
    globalThis.__animA = a;
    let t = 0;
    globalThis.__animId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
        t += 0.016;
        a.set_position(300 + 200 * Math.sin(t), 300);
        return GLib.SOURCE_CONTINUE;
    });
    globalThis.RESULT = 'animating-under-cover';
})()
