// Smoke test: slice planEaseInner out of extension.js and execute it under
// stubs, so a free identifier or silent throw can never ship again (a brace
// balance test cannot catch `numericProps is not defined`).
import GLib from 'gi://GLib';

const here = import.meta.url.replace('file://', '');
const src = new TextDecoder().decode(
    GLib.file_get_contents(here.slice(0, here.lastIndexOf('/') + 1) +
        '../extension.js')[1]);

const start = src.indexOf('const planEaseInner =');
const end = src.indexOf('const skipActor =');
if (start < 0 || end < 0)
    throw new Error('could not slice planEaseInner');

const body = src.slice(start, end)
    .replace('const planEaseInner =', 'const planEaseInner =');

const settings = {
    get_boolean: () => true,
    get_int: () => 100,
    get_double: () => 1.8,
    get_string: () => 'preset:ease-in-out-expo',
};
const curve = {kind: 'mode', mode: 'ease-in-out-expo'};
const state = {
    Date, Math,
    settings, curve, bootTime: 0, lastGestureTime: 0,
    BOOT_GRACE_MS: 0,
    motionState: () => null,
    hookDispose: () => {},
    MIN_V0: 0.15, MAX_V0: 4,
    CONTROL_KEYS: new Set(['duration', 'delay', 'mode', 'progress_mode',
        'repeatCount', 'autoReverse', 'animationRequired', 'onComplete',
        'onStopped']),
    NUMERIC_TYPES: new Set(['gfloat', 'gdouble', 'gint', 'guint']),
    MODE_MAP: {'ease-in-out-expo': 19},
    Main: {overview: {_overview: {controls: {_stateAdjustment: {}}}}},
    Clutter: {AnimationMode: {EASE_OUT_CUBIC: 6}, Actor: function Actor() {}},
    // Stub for the accessibility gate: animations enabled, and the
    // reduced-motion enum absent exactly like GNOME 49/50.
    St: {
        Settings: {get: () => ({enableAnimations: true})},
        ReducedMotion: undefined,
    },
};
const fn = new Function(...Object.keys(state),
    `${body}\nreturn planEaseInner;`)(...Object.values(state));

const fakeActor = {
    find_property: () => ({value_type: {name: 'gfloat'}}),
    get_property: undefined,
};
const props = {x: 400, duration: 400};
const plan = fn(fakeActor, props, null, null);
if (plan === null)
    throw new Error('planEaseInner returned null (engine dead)');
if (props.mode !== 19)
    throw new Error(`mode not swapped (got ${props.mode})`);
if (!Array.isArray(plan.drivers) || !Array.isArray(plan.numericProps))
    throw new Error('plan missing arrays');
console.log('planEaseInner smoke: ALIVE (mode=19, dur=' + props.duration + ')');

// Regression (EGO user report on the curve-library version): a FRESH
// animation (no prior motion state) with a custom SPLINE curve selected
// must still produce a driver. The spline has no native Clutter mode, so
// without a driver it never plays at all; before the fix only
// interruptions ever drove it, which reads as "custom curves do nothing".
const actorCtor = state.Clutter.Actor;
const splineActor = new actorCtor();
splineActor.find_property = () => ({value_type: {name: 'gfloat'}});
const splineState = {...state, curve: {kind: 'spline',
    points: [[0, 0], [0.4, 1.06], [1, 1]]}};
const splineFn = new Function(...Object.keys(splineState),
    `${body}\nreturn planEaseInner;`)(...Object.values(splineState));
const plan2 = splineFn(splineActor, {x: 400, duration: 400}, null, null);
if (plan2 === null)
    throw new Error('spline planEaseInner returned null');
if (plan2.drivers.length !== 1 || plan2.drivers[0].prop !== 'x')
    throw new Error(`fresh spline not driven (drivers=${plan2.drivers.length})`);
if (plan2.numericProps.length !== 0)
    throw new Error('fresh spline prop left in numericProps');
console.log('planEaseInner smoke: fresh spline driven');
