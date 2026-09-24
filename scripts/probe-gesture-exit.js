// Experiment: route deferred hides through the gesture exit so an interrupt
// reverses the drawer immediately instead of waiting for the open to finish.
(async () => {
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const GLib = imports.gi.GLib;
const ov = Main.overview;
const adj = ov._overview.controls._stateAdjustment;
const out = {patched: false, traces: [], errors: []};

// ---- patch ----
const orig = ov._animateNotVisible.bind(ov);
ov._animateNotVisible = function () {
    if (this._visible && this._animationInProgress) {
        try {
            this._visibleTarget = false;
            this._changeShownState('HIDING');
            Main.panel.style = 'transition-duration: 250ms;';
            this._overview.controls.gestureEnd(0, 250, () => this._hideDone());
            out.patched = true;
            return;
        } catch (e) {
            out.errors.push('patch-path: ' + String(e).slice(0, 120));
        }
    }
    orig();
};
out.origSaved = true;

const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

const runCase = async (name, steps) => {
    if (ov.visible)
        ov.hide();
    await wait(900);
    const trace = [];
    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
        trace.push([+adj.value.toFixed(2), ov.visible]);
        return GLib.SOURCE_CONTINUE;
    });
    await steps();
    await wait(1400);
    GLib.source_remove(id);
    out.traces.push({name,
        end: [adj.value, ov.visible],
        trace: trace.map(t => t[0]),
        visibleTail: trace.slice(-8).map(t => t[1]),
        sawReversalImmediately: undefined});
    return trace;
};

// case 1: double click (open then hide mid-flight)
let t1 = await runCase('double', async () => {
    ov.show(2);
    await wait(250);
    out.hideClickedAt = +adj.value.toFixed(2);
    ov.hide();   // previously deferred
});

// case 2: triple click
await runCase('triple', async () => {
    ov.show(2);
    await wait(200);
    ov.hide();
    await wait(250);
    ov.show(2);
    await wait(200);
    ov.hide();
});

// ---- restore ----
ov._animateNotVisible = orig;
out.restored = true;
if (ov.visible)
    ov.hide();

// analyze case 1: after hide click, value must fall promptly (no full rise to 2)
const hideIdx = Math.round(250 / 30);
const t1v = t1.map(x => x[0]);
out.t1_afterHide = t1v.slice(hideIdx, hideIdx + 8);
out.t1_maxAfterHide = Math.max(...t1v.slice(hideIdx));
out.t1_minAfterHide = Math.min(...t1v.slice(hideIdx));
globalThis.RESULT = JSON.stringify(out);
})()
