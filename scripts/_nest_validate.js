// Post-launch self-check for the nested devkit shell. Run this BEFORE
// handing the shell to a human: it proves the shell paints, the extension
// is ACTIVE at the expected version, and a workspace switch goes through
// the WorkspaceAnimation path without killing anything.
//
// Usage: DBUS_SESSION_BUS_ADDRESS=$(cat /tmp/nla/nested-bus) \
//     python3 scripts/shell-eval.py scripts/_nest_validate.js 12
//
// Standing rule (user, 2026-10-28): whoever launches the nested shell
// validates it over dbus/eval first; a shell that dies on first touch
// must never reach the user.
//
// Eval traps this script respects: no raw Gio.Settings for the extension
// schema (GLib-GIO-ERROR is FATAL), no imports.ui (use dynamic import of
// main.js), hide the overview first (switches inside it bypass
// WorkspaceAnimation), use first/last workspace indices (dynamic
// workspaces trim empty ones), settle before switching (stale active ws
// makes activate a silent no-op).
globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const EM = await import('resource:///org/gnome/shell/misc/extensionUtils.js');

const fail = s => {
    globalThis.RESULT = `FAIL: ${s}`;
};
const ext = Main.extensionManager?.lookup?.('nonlinear-animation@nbgroup');
if (!ext)
    return fail('extension not found (extensionManager.lookup)');
// ext.state is the raw enum number; compare against the enum directly
// (plain objects do not reverse-map 1 -> 'ACTIVE').
if (ext.state !== EM.ExtensionState.ACTIVE)
    return fail(`extension state ${ext.state} ` +
        `(want ${EM.ExtensionState.ACTIVE} ACTIVE)`);
if (ext.metadata?.version !== 10)
    return fail(`version ${ext.metadata?.version}, expected 10`);
if (Main.overview.visible)
    Main.overview.hide();

const wsm = global.workspace_manager;
const n = wsm.get_n_workspaces();
if (n < 2)
    return fail(`only ${n} workspace(s), switch test impossible`);
const A = n - 1;
const B = 0;

let paints = 0;
const ph = global.stage.connect('after-paint', () => paints++);
let sawSwitchData = false;
const probe = GLib.timeout_add(GLib.PRIORITY_HIGH, 8, () => {
    if (Main.wm._workspaceAnimation?._switchData)
        sawSwitchData = true;
    return GLib.SOURCE_CONTINUE;
});
const wait = ms => new Promise(r => GLib.timeout_add(
    GLib.PRIORITY_DEFAULT, ms, () => { r(); return GLib.SOURCE_REMOVE; }));

// settle on B so the first activate is a real switch
wsm.get_workspace_by_index(B).activate(global.get_current_time());
await wait(1200);
paints = 0;
wsm.get_workspace_by_index(A).activate(global.get_current_time());
await wait(1400);
wsm.get_workspace_by_index(B).activate(global.get_current_time());
await wait(1400);
GLib.source_remove(probe);
global.stage.disconnect(ph);

if (paints === 0)
    return fail('0 paints: window occluded, clocks frozen (INVALID run)');
if (!sawSwitchData)
    return fail('no _switchData during switches: WorkspaceAnimation bypassed');
globalThis.RESULT = `PASS: v${ext.metadata.version} ACTIVE, ` +
    `${paints} paints, switchData seen, shell alive`;
})()
