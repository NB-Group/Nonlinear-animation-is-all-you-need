// Headless regression tests for the actual magic-lamp hook. Run:
//   gjs -m tests/magicLampTest.js
// Like planSmoke.js, slice the method from extension.js so these tests cannot
// silently diverge from the implementation. No running Shell is touched.
import GLib from 'gi://GLib';

const here = GLib.filename_from_uri(import.meta.url)[0];
const source = new TextDecoder().decode(GLib.file_get_contents(
    GLib.build_filenamev([GLib.path_get_dirname(here), '..', 'extension.js']))[1]);
const start = source.indexOf('    _easeMagicLamp(actor) {');
const end = source.indexOf('    disable() {', start);
if (start < 0 || end < 0)
    throw new Error('could not slice _easeMagicLamp');

const minimizeName = 'minimize-magic-lamp-effect';
const restoreName = 'unminimize-magic-lamp-effect';
const pending = new Map();
let nextId = 1;
const loop = {
    PRIORITY_HIGH_IDLE: 100,
    SOURCE_REMOVE: false,
    idle_add(_priority, callback) {
        const id = nextId++;
        pending.set(id, callback);
        return id;
    },
    source_remove(id) { pending.delete(id); },
};
const mode = {AnimationMode: {EASE_OUT_CUBIC: 6}};
const Hook = new Function('GLib', 'Clutter', 'MAGIC_LAMP_MINIMIZE',
    'MAGIC_LAMP_UNMINIMIZE', `return class {${source.slice(start, end)}};`)(
    loop, mode, minimizeName, restoreName);

function check(condition, message) {
    if (!condition)
        throw new Error(message);
}
function flush() {
    for (const [id, callback] of [...pending]) {
        pending.delete(id);
        check(callback() === loop.SOURCE_REMOVE, 'idle callback must terminate');
    }
}
function timeline(elapsed = 0, playing = false) {
    return {
        elapsed, playing, duration: 400, advances: [],
        set_duration(value) { this.duration = value; },
        set_progress_mode(value) { this.mode = value; },
        is_playing() { return this.playing; },
        get_elapsed_time() { return this.elapsed; },
        get_duration() { return this.duration; },
        advance(value) { this.advances.push(value); },
    };
}
function actor(name, timer) {
    const effects = new Map(name ? [[name, {timerId: timer}]] : []);
    return {effects, get_effect(key) { return effects.get(key); }};
}

let duration = 700;
const hook = new Hook();
hook._settings = {get_int(key) {
    check(key === 'magic-lamp-duration-ms', 'unexpected setting');
    return duration;
}};

// The old timing and easing stay unchanged by default, in both directions.
for (const name of [minimizeName, restoreName]) {
    const timer = timeline();
    const window = actor(name, timer);
    hook._easeMagicLamp(window);
    flush();
    check(timer.duration === 700, 'default duration must remain 700 ms');
    check(timer.mode === mode.AnimationMode.EASE_OUT_CUBIC, 'easing changed');
}

// Every subsequent animation reads the live setting, including range edges.
for (const value of [1, 500, 1200, 5000]) {
    duration = value;
    for (const name of [minimizeName, restoreName]) {
        const timer = timeline();
        hook._easeMagicLamp(actor(name, timer));
        flush();
        check(timer.duration === value, `configured duration ignored: ${value}`);
    }
}

// Preserve normalized progress even if the user changes duration mid-flight.
// Equal durations keep the original elapsed-time behavior unchanged.
for (const [oldDuration, value, elapsed, expected] of [
    [700, 700, 350, 350], [500, 500, 200, 200],
    [700, 1400, 350, 700], [700, 200, 350, 100],
    [1200, 500, 900, 375], [700, 1, 699, 0],
    [500, 1200, 600, null], [500, 500, 500, null],
    [1200, 1200, 0, null], [0, 500, 10, null],
]) {
    duration = value;
    const previous = timeline(elapsed, true);
    previous.duration = oldDuration;
    const current = timeline();
    const window = actor(restoreName, current);
    hook._magicLampTimers.set(window, {timeline: previous});
    hook._easeMagicLamp(window);
    flush();
    check(current.advances.length === (expected === null ? 0 : 1),
        `wrong interruption guard: old=${oldDuration}, new=${value}, elapsed=${elapsed}`);
    if (expected !== null)
        check(current.advances[0] === expected, 'wrong normalized interruption position');
}

// Coalesce repeated events for one actor without losing another actor's event.
duration = 500;
const first = timeline();
const second = timeline();
const firstActor = actor(minimizeName, first);
hook._easeMagicLamp(firstActor);
hook._easeMagicLamp(firstActor);
hook._easeMagicLamp(actor(restoreName, second));
check(pending.size === 2, 'per-actor deferral must be preserved');
flush();
check(first.duration === 500 && second.duration === 500, 'lost actor update');
check(hook._lampDefers.size === 0, 'completed deferrals must be removed');

// The companion extension need not be installed; missing effects are harmless.
hook._easeMagicLamp(null);
hook._easeMagicLamp(actor());
flush();
check(pending.size === 0, 'idle callbacks leaked');
console.log('magic-lamp duration: PASS (defaults, live updates, both directions, interruptions, deferrals, absent effect)');
