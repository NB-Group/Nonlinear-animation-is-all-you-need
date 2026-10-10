globalThis.RESULT = 'pending';
(() => {
    // Report every window and its BMS backdrop surface state.
    const rows = global.get_window_actors().map(wa => {
        const m = wa.meta_window;
        const kids = (wa.get_children?.() ?? []).map(c => ({
            name: c.name ?? c.get_name?.() ?? '?',
            vis: c.visible,
        })).filter(k => k.name.includes('bms'));
        return {
            wm: m?.get_wm_class?.() ?? '?',
            fs: m?.is_fullscreen?.() ?? false,
            min: m?.minimized ?? false,
            waVis: wa.visible,
            backdrop: kids.length ? kids : 'none',
        };
    });
    globalThis.RESULT = JSON.stringify(rows);
})()
