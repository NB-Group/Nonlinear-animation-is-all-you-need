// Experiment v2: gesture-exit + suppress the stale open-chain _showDone.
(async () => {
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const GLib = imports.gi.GLib;
const ov = Main.overview;
const adj = ov._overview.controls._stateAdjustment;
const out = {};

const origANV = ov._animateNotVisible.bind(ov);
const origSD = ov._showDone.bind(ov);
let suppress = 0;

ov._animateNotVisible = function () {
    if (this._visible && this._animationInProgress) {
        try {
            suppress++;                       // the open chain's _showDone is stale
            this._visibleTarget = false;
            this._changeShownState('HIDING');
            Main.panel.style = 'transition-duration: 250ms;';
            this._overview.controls.gestureEnd(0, 250, () => this._hideDone());
            return;
        } catch (e) {
            out.errors = out.errors || [];
            out.errors.push('patch: ' + String(e).slice(0, 100));
        }
    }
    origANV();
};
ov._showDone = function () {
    if (suppress > 0) {
        suppress--;
        out.suppressed++;
        return;
    }
    origSD();
};

const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

const run = async (name, steps) => {
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
    out[name] = {
        end: [adj.value, ov.visible],
        trace: trace.map(t => t[0]),
        visTail: trace.slice(-6).map(t => t[1]),
    };
};

await run('dbl', async () => {
    ov.show(2);
    await wait(250);
    out.hideAt = +adj.value.toFixed(2);
    ov.hide();
});
await run('tri', async () => {
    ov.show(2);
    await wait(200);
    ov.hide();
    await wait(250);
    ov.show(2);
    await wait(200);
    ov.hide();
});

// restore everything
ov._animateNotVisible = origANV;
ov._showDone = origSD;
out.restored = true;
if (ov.visible)
    ov.hide();
out.suppressLeft = suppress;
globalThis.RESULT = JSON.stringify(out);
})()
