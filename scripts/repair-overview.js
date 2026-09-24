(async () => {
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const ov = Main.overview;
const out = {};

out.patchStillInstalled = ov._animateNotVisible.toString().includes('gestureEnd');

// restore the stock implementation verbatim (gnome-50 source)
ov._animateNotVisible = function () {
    if (!this._visible || this._animationInProgress)
        return;

    this._animationInProgress = true;
    this._visibleTarget = false;

    Main.layoutManager.overviewGroup.set_child_above_sibling(
        this._coverPane, null);
    this._coverPane.show();

    this._overview.prepareToLeaveOverview();
    this._changeShownState('HIDING');
    this._overview.animateFromOverview(() => this._hideDone());
};
out.restoredStock = true;

// repair any stuck state from the failed experiment
out.stateBefore = {
    visible: ov.visible,
    shown: ov._shown,
    animating: ov._animationInProgress,
    shownState: ov._shownState,
};
if (ov._animationInProgress && !ov.visible)
    ov._animationInProgress = false;   // no animation can be running while hidden
if (ov.visible && !ov._shown)
    ov.hide();
out.stateAfter = {
    visible: ov.visible,
    shown: ov._shown,
    animating: ov._animationInProgress,
    shownState: ov._shownState,
};
globalThis.RESULT = JSON.stringify(out);
})()
