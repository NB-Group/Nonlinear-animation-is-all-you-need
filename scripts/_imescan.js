globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const before = new Set(global.get_window_actors().map(w => w));
const sleep = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
// window-actor based IME (ibus wayland popup)
await sleep(50);
const wins = global.get_window_actors().map(w => ({
    cls: w.meta_window.get_wm_class(),
    title: (w.meta_window.get_title() || '').slice(0, 20),
    type: w.meta_window.get_window_type(),
    effects: w.get_effects().map(e => e.constructor.name),
}));
// chrome actors with blur effects (St popup inside shell)
const chrome = [];
const scan = (a, path, depth) => {
    if (depth > 8 || chrome.length > 20)
        return;
    try {
        const effs = a.get_effects().map(e => e.constructor.name);
        if (effs.some(n => n.includes('Blur') || n.includes('blur')))
            chrome.push([path, effs.join(','), a.constructor?.name]);
    } catch (e) {}
    a.get_children?.().forEach((c, i) => scan(c, `${path}/${i}`, depth + 1));
};
scan(Main.layoutManager.uiGroup, 'ui', 0);
globalThis.RESULT = JSON.stringify({wins, chrome});
})()
