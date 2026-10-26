globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const WA = await import('resource:///org/gnome/shell/ui/workspaceAnimation.js');
const MG = WA.MonitorGroup;

const wsm = global.workspace_manager;
const n = wsm.get_n_workspaces();
const A = n - 1;          // dynamic workspaces may trim empty ones, so
const B = 0;              // never assume a fixed count; A->B still tests
if (A === B) {            // the interrupt retarget (reverse direction)
    globalThis.RESULT = 'need >=2 workspaces';
    return;
}

const anim = Main.wm._workspaceAnimation;
// Workspace switching inside the overview does not use WorkspaceAnimation;
// make sure it is closed or the run measures nothing.
if (Main.overview.visible)
    Main.overview.hide();
const paints = {n: 0};
const ph = global.stage.connect('after-paint', () => paints.n++);

const t0 = Date.now();
const log = [];
let groupId = 0;
let lastGroup = null;
let myTag = -1;
const id = GLib.timeout_add(GLib.PRIORITY_HIGH, 8, () => {
    const g = Main.uiGroup.get_children().filter(c => c instanceof MG);
    let note = '';
    if (g.length && g[0] !== lastGroup) {
        lastGroup = g[0];
        myTag = ++groupId;
        note = `NEWGROUP#${myTag}`;
    }
    log.push([Date.now() - t0,
        g.length ? myTag : 0,
        g.length ? +g[0].progress.toFixed(3) : null,
        anim._switchData ? 1 : 0,
        note]);
    return GLib.SOURCE_CONTINUE;
});

// Settle on B first so activate(A) below is guaranteed to be a real
// switch (a leftover active workspace turns it into a silent no-op).
wsm.get_workspace_by_index(B).activate(global.get_current_time());
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200,
    () => { r(); return GLib.SOURCE_REMOVE; }));

wsm.get_workspace_by_index(A).activate(global.get_current_time());
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350,
    () => { r(); return GLib.SOURCE_REMOVE; }));
const INT = Date.now() - t0;
wsm.get_workspace_by_index(B).activate(global.get_current_time());
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500,
    () => { r(); return GLib.SOURCE_REMOVE; }));
GLib.source_remove(id);
global.stage.disconnect(ph);
globalThis.RESULT = JSON.stringify({interruptAt: INT, paints: paints.n, log});
})()