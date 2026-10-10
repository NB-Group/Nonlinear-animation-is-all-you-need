globalThis.RESULT = 'pending';
(async () => {
    // Enumerate BMS overview-component surfaces in the HOST shell and report
    // whether the overview background blur pipeline is alive.
    const Main = await import('resource:///org/gnome/shell/ui/main.js');
    const out = {overviewGroup_children: [], bms_widgets: [], bms_ext: '?'};
    const grp = Main.layoutManager.overviewGroup;
    const walk = (a, depth) => {
        out.overviewGroup_children.push(
            `${'  '.repeat(depth)}${a.name ?? a.get_name?.() ?? a.toString().slice(0, 30)} vis=${a.visible}`);
        for (const c of (a.get_children?.() ?? []).slice(0, 12))
            if (depth < 2) walk(c, depth + 1);
    };
    if (grp) walk(grp, 0);
    for (const w of global.get_stage().get_children()) {
        const n = w.name ?? w.get_name?.() ?? '';
        if (String(n).startsWith('bms'))
            out.bms_widgets.push(`${n} vis=${w.visible} effects=${w.get_effects().length}`);
    }
    out.bms_ext = String(global.blur_my_shell?.constructor?.name ?? 'none');
    globalThis.RESULT = JSON.stringify(out);
})()
