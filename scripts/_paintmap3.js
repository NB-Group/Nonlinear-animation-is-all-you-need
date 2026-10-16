globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const targets = [];
const scan = (a, path, depth) => {
    if (depth > 9 || targets.length > 40)
        return;
    try {
        const effs = a.get_effects().map(e => e.constructor?.name ?? '?');
        if (effs.some(n => n.includes('PaintCallback')))
            targets.push([path, a.constructor?.name, `vis=${a.visible}`,
                `op=${a.opacity}`, `${Math.round(a.width)}x${Math.round(a.height)}`,
                effs.join('+').slice(0, 40)]);
    } catch (err) {}
    a.get_children?.().forEach((c, i) => scan(c, `${path}/${i}`, depth + 1));
};
scan(Main.layoutManager.uiGroup, 'ui', 0);
globalThis.RESULT = JSON.stringify({found: targets.length, rows: targets});
})()
