// Storm diagnostic: count every ease call (actor + adjustment) with the
// mode the CALLER passed, verify the extension's overshoot clamp on a
// dummy adjustment, then open the overview and read the storm.
globalThis.RESULT = 'pending';
(async () => {
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Main = await import('resource:///org/gnome/shell/ui/main.js');
const EL = Clutter.AnimationMode.EASE_OUT_ELASTIC;

const counts = {actorEase: 0, adjEase: 0, adjElasticReq: 0,
    actorElasticReq: 0};
const aOrig = Clutter.Actor.prototype.ease;
Clutter.Actor.prototype.ease = function (p) {
    counts.actorEase++;
    if (p?.mode === EL)
        counts.actorElasticReq++;
    return aOrig.call(this, p);
};
const jOrig = St.Adjustment.prototype.ease;
St.Adjustment.prototype.ease = function (v, p) {
    counts.adjEase++;
    if (p?.mode === EL)
        counts.adjElasticReq++;
    return jOrig.call(this, v, p);
};

// guard check: a dummy adjustment eased with elastic must land clamped
const dummy = new St.Adjustment({lower: 0, upper: 1, value: 0});
dummy.ease(1, {duration: 250, mode: EL});
const dtr = dummy.get_transition('value');
const dMode = dtr?.get_timeline?.().get_progress_mode?.() ??
    dtr?.get_progress_mode?.();
const guardWorks = dMode !== undefined && dMode !== EL;

if (Main.overview.visible)
    Main.overview.hide();
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500,
    () => { r(); return GLib.SOURCE_REMOVE; }));
counts.actorEase = counts.adjEase = 0;
counts.adjElasticReq = counts.actorElasticReq = 0;
let paints = 0;
const ph = global.stage.connect('after-paint', () => paints++);
const t0 = Date.now();
Main.overview.show();
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1200,
    () => { r(); return GLib.SOURCE_REMOVE; }));
const late = Date.now() - t0;
const pDuring = paints;
await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000,
    () => { r(); return GLib.SOURCE_REMOVE; }));
global.stage.disconnect(ph);
Clutter.Actor.prototype.ease = aOrig;
St.Adjustment.prototype.ease = jOrig;
globalThis.RESULT = JSON.stringify({guardWorks, dMode: String(dMode),
    lateMs: late, paintsDuring: pDuring, paintsAfter: paints, counts});
})()
