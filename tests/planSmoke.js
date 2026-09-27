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
