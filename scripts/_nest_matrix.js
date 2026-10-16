globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const run = async (label, props) => {
    const a = new St.Button({label: 'X', width: 40, height: 40,
        style: 'background:#f66;'});
    Main.uiGroup.add_child(a);
    a.set_position(100, 600);
    a.ease(props);
    let x250 = null, xEnd = null;
    await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250,
        () => { x250 = +a.x.toFixed(0); r(); return GLib.SOURCE_REMOVE; }));
    const tr = a.get_transition('x');
    const dur = tr ? tr.get_duration() : -1;
    await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2600,
        () => { xEnd = +a.x.toFixed(0); r(); return GLib.SOURCE_REMOVE; }));
    a.destroy();
    return [label, `x@250ms=${x250}`, `x@end=${xEnd}`, `trDur=${dur}`];
};
const out = [];
out.push(await run('dur400', {x: 1400, duration: 400}));
out.push(await run('dur600', {x: 1400, duration: 600}));
out.push(await run('dur600+mode2', {x: 1400, duration: 600, mode: 2}));
out.push(await run('dur2000', {x: 1400, duration: 2000}));
globalThis.RESULT = JSON.stringify(out);
})()