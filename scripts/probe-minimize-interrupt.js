// Real-window minimize interruption probe: minimize a real window, unminimize
// mid-flight, sample its actor geometry through the whole sequence.
const GLib = imports.gi.GLib;
const actors = global.get_window_actors();
const victim = actors.find(a =>
    a.meta_window?.get_wm_class?.() === 'com.mattjakeman.ExtensionManager') ??
    actors.find(a => a.meta_window && !a.meta_window.minimized);
if (!victim) {
    globalThis.RESULT = JSON.stringify({error: 'no victim window'});
} else {
    const mw = victim.meta_window;
    const out = {
        wm: mw.get_wm_class(),
        orig: [victim.x, victim.y, +victim.scale_x.toFixed(4)],
        trace: [],
    };
    const a = victim;
    const t0 = Date.now();

    // minimize now
    mw.minimize();

    // unminimize mid-flight (150ms in, animation ~250*2.9=725ms)
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
        out.atInterrupt = [Date.now() - t0, Math.round(a.x), Math.round(a.y),
            +a.scale_x.toFixed(4)];
        mw.unminimize();
        return GLib.SOURCE_REMOVE;
    });

    // sample through 1.5s
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
        out.trace.push([Date.now() - t0, Math.round(a.x), Math.round(a.y),
            +a.scale_x.toFixed(3)]);
        if (out.trace.length >= 45) {
            GLib.source_remove(id);
            // make sure we leave the window restored
            if (mw.minimized)
                mw.unminimize();
            out.end = [Math.round(a.x), Math.round(a.y), +a.scale_x.toFixed(4),
                [Math.round(a.x) - out.orig[0], Math.round(a.y) - out.orig[1],
                 +(a.scale_x - out.orig[2]).toFixed(4)]];
            globalThis.RESULT = JSON.stringify(out);
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    });
    globalThis.RESULT = 'PENDING';
}
'ok'
