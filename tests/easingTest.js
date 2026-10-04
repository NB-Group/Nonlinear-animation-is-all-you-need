// Unit tests for easing.js / curves.js (pure JS, no GI). Run:
//   gjs -m tests/easingTest.js
import {MODE_FUNCS, makeSpline, makeSpring, makeSpringNumeric, compileCurve} from '../easing.js';
import GLib from 'gi://GLib';
import * as Curves from '../curves.js';
// continuity.js must also load under tests: a syntax error there once
// shipped into the installed zip because no test imports it.
import * as Continuity from '../continuity.js';
import * as SimEngine from '../simengine.js';

let failures = 0;
function check(name, cond) {
    if (!cond) {
        failures++;
        console.error(`FAIL: ${name}`);
    }
}

// --- modes: endpoints and monotone rise -----------------------------------
for (const [nick, f] of Object.entries(MODE_FUNCS)) {
    check(`${nick} value(0)===0`, Math.abs(f.value(0)) < 1e-6);
    check(`${nick} value(1)===1`, Math.abs(f.value(1) - 1) < 1e-6);
    check(`${nick} value(0.5) in [-0.1, 1.6]`, f.value(0.5) > -0.1 && f.value(0.5) < 1.6);
    // numeric derivative vs analytic
    const e = 1e-4;
    for (const t of [0.1, 0.3, 0.7, 0.9]) {
        const num = (f.value(t + e) - f.value(t - e)) / (2 * e);
        check(`${nick} deriv(${t})`, Math.abs(num - f.deriv(t)) < 0.02);
    }
}

// --- spline: passes through points, endpoints exact ------------------------
{
    const sp = makeSpline([[0, 0], [0.3, 0.72], [0.55, 1.05], [1, 1]]);
    check('spline(0)', Math.abs(sp.eval(0)) < 1e-9);
    check('spline(1)', Math.abs(sp.eval(1) - 1) < 1e-9);
    check('spline passes through interior point', Math.abs(sp.eval(0.3) - 0.72) < 1e-9);
    check('spline overshoot preserved', sp.eval(0.55) > 1.0);
    // no wild oscillation between points
    let max = 0;
    for (let i = 0; i <= 100; i++)
        max = Math.max(max, sp.eval(i / 100));
    check('spline max bounded', max < 1.35);
    // derivative roughly matches value slope
    const d = sp.deriv(0.3);
    check('spline deriv sane at knot', d > 0 && d < 8);
}

// --- springs: endpoints, overshoot, v0 continuity ---------------------------
{
    const s = makeSpring(0.6, 9, 0, 1);
    check('spring starts at 0', Math.abs(s.eval(0)) < 1e-9);
    const T = 1.5; // period used for deriv scaling in these tests
    const withT = makeSpring(0.6, 9, 0, T);
    // settle: near 1 at tau=1 with enough duration
    check('spring settles', Math.abs(withT.eval(1) - 1) < 0.05);
    // overshoot exists for underdamped
    let mx = 0;
    for (let i = 0; i <= 200; i++)
        mx = Math.max(mx, withT.eval(i / 200));
    check('underdamped overshoots', mx > 1.02 && mx < 1.3);
    // initial velocity honored: deriv(0) == v0 * period (d value/d tau)
    const v0 = 2;
    const s2 = makeSpring(0.6, 9, v0, T);
    const d0 = s2.deriv(0);
    check('spring v0 seeds deriv(0)', Math.abs(d0 - v0 * T) < 0.05);
}

// --- compiled springs settle within the animation window --------------------
{
    // The bug: fixed omega left the spring ~9-13% short of target when the
    // timeline ended, snapping to the final value. compileCurve must stiffen
    // omega so the envelope decays to ~1% by tau=1.
    for (const [zeta, omega, T] of [[0.62, 8.5, 0.45], [0.9, 5, 0.36],
                                    [0.55, 6, 0.9], [0.8, 12, 0.15]]) {
        const c = compileCurve({kind: 'spring', damping: zeta, omega}, 0, T);
        check(`spring settles by end (z=${zeta}, w=${omega}, T=${T})`,
            Math.abs(c.eval(1) - 1) < 0.015);
    }
    // stiffer-than-needed user omega is preserved (early settle, flat tail)
    const stiff = compileCurve({kind: 'spring', damping: 0.62, omega: 30}, 0, 1.2);
    check('stiff spring kept', Math.abs(stiff.eval(1) - 1) < 0.005);
}

// --- reversal continuity: interrupting with opposite-direction momentum -----
{
    // incoming motion runs against the new target: the spring must carry it
    // (progress dips below 0) and still settle at 1 — physical, no dead stop
    const s = makeSpring(0.8, 10, -3, 1.0);
    check('reversal carries momentum backwards', s.eval(0.02) < 0);
    check('reversal still settles', Math.abs(s.eval(1) - 1) < 0.02);
    const mid = makeSpring(0.8, 10, -3, 1.0);
    let min = 1;
    for (let i = 0; i <= 100; i++)
        min = Math.min(min, mid.eval(i / 100));
    check('reversal dips then returns', min < -0.03 && min > -0.1);
}

// --- numeric (Ultra) spring matches analytic closely ------------------------
{
    const zeta = 0.55, omega = 8, T = 1.2;
    const a = makeSpring(zeta, omega, 1.5, T);
    const n = makeSpringNumeric(zeta, omega, 1.5, T);
    let maxErr = 0;
    for (let i = 0; i <= 120; i++) {
        const tau = i / 120;
        maxErr = Math.max(maxErr, Math.abs(a.eval(tau) - n.eval(tau)));
    }
    check('numeric spring tracks analytic', maxErr < 0.05);
}

// --- curves: validation / import / export round-trip ------------------------
{
    check('validate good spline', Curves.validateCurve(
        {name: 'x', kind: 'spline', points: [[0, 0], [0.5, 1], [1, 1]]}) === null);
    check('validate non-monotone x', Curves.validateCurve(
        {name: 'x', kind: 'spline', points: [[0, 0], [0.7, 1], [0.3, 1], [1, 1]]}) !== null);
    check('validate spring range', Curves.validateCurve(
        {name: 'x', kind: 'spring', damping: 0.6, omega: 8}) === null);
    check('validate bad damping', Curves.validateCurve(
        {name: 'x', kind: 'spring', damping: 2, omega: 8}) !== null);
    check('validate endpoint rule', Curves.validateCurve(
        {name: 'x', kind: 'spline', points: [[0.1, 0], [1, 1]]}) !== null);

    const bundle = JSON.stringify({
        format: Curves.FORMAT_TAG, v: 1,
        curves: [
            {name: 'Mine', kind: 'spline', points: [[0, 0], [0.4, 1.08], [1, 1]]},
            {name: 'Legacy bezier', kind: 'bezier', p: [0.4, 0, 0.2, 1]},
        ],
    });
    const r = Curves.parseImportFile(bundle);
    check('import ok', r.error === undefined && r.curves.length === 2);
    check('bezier converted to spline', r.curves[1].kind === 'spline');
    check('import rejects junk', Curves.parseImportFile('{"a": 1}').error !== undefined);
    check('import rejects bad json', Curves.parseImportFile('not json').error !== undefined);
    check('import rejects future version', Curves.parseImportFile(
        `{"format": "${Curves.FORMAT_TAG}", "v": 99, "curves": []}`).error !== undefined);

    const out = JSON.parse(Curves.exportBundle(r.curves));
    check('export round-trip', out.format === Curves.FORMAT_TAG && out.curves.length === 2);
    check('exported spline monotone', Curves.validateCurve(out.curves[0]) === null);

    check('find builtin', Curves.findCurve('preset:ease-in-out-cubic', []).kind === 'mode');
    check('find user', Curves.findCurve('user:abc',
        [{id: 'user:abc', name: 'n', kind: 'spline', points: [[0, 0], [1, 1]]}]) !== null);
    check('find fallback null', Curves.findCurve('nope', []) === null);

    const parsed = Curves.parseUserCurves([
        Curves.serializeUserCurve({id: 'user:1', name: 'ok', kind: 'spring', damping: 0.7, omega: 6}),
        '{corrupt',
    ]);
    check('user-curves parse skips junk', parsed.length === 1 && parsed[0].kind === 'spring');

    check('migration map covers all modes',
        Object.keys(Curves.MIGRATION_MAP).length === 10);
}

// --- extension.js brace balance: a python-surgery once ate a closing brace
// and only the shell's loader noticed; never let that ship again ---
{
    const here = import.meta.url.replace('file://', '');
    const path = here.slice(0, here.lastIndexOf('/') + 1) + '../extension.js';
    const [, bytes] = GLib.file_get_contents(path);
    const text = new TextDecoder().decode(bytes);
    // naive count: braces inside strings/comments skew this in principle,
    // but this file's strings carry balanced braces, and the check's value
    // is catching a surgically-deleted brace (depth drifts to ±1)
    let depth = 0;
    for (const c of text) {
        if (c === '{')
            depth++;
        else if (c === '}')
            depth--;
    }
    check('extension.js brace balance', depth === 0);

    // every local module the extension imports must be in the zip
    // whitelist: simengine.js once shipped without itself and the shell
    // put the extension in ERROR state at login.
    const build = new TextDecoder().decode(
        GLib.file_get_contents(here.slice(0, here.lastIndexOf('/') + 1) +
            '../build.sh')[1]);
    for (const m of text.matchAll(/from '\.\/([a-z-]+\.js)'/g)) {
        check(`build.sh ships ${m[1]}`,
            build.includes(`'${m[1]}'`));
    }

    // every settings key referenced by prefs.js must exist in the schema:
    // a removed key left in the prefs window crashed it on open.
    {
        const root = here.slice(0, here.lastIndexOf('/') + 1);
        const prefs = new TextDecoder().decode(
            GLib.file_get_contents(root + '../prefs.js')[1]);
        const xml = new TextDecoder().decode(
            GLib.file_get_contents(root +
                '../schemas/org.gnome.shell.extensions.nonlinear-animation.gschema.xml')[1]);
        const keys = new Set([...xml.matchAll(/<key name="([^"]+)"/g)]
            .map(k => k[1]));
        const used = new Set();
        for (const m of prefs.matchAll(/'(?:bind|get_|set_)\w+'\(\s*'([^']+)'/g))
            used.add(m[1]);
        for (const m of prefs.matchAll(/settings\.(?:bind|get_\w+|set_\w+)\('([^']+)'/g))
            used.add(m[1]);
        for (const k of used)
            check(`prefs key '${k}' exists in schema`, keys.has(k));
        check('prefs references some keys', used.size >= 8);
    }
}

// --- continuity.js loads and its registry round-trips -----------------------
{
    check('continuity module exports', typeof Continuity.motionState === 'function' &&
        typeof Continuity.driveTransition === 'function');
    check('motionState null on unknown target', Continuity.motionState({}, 'x') === null);
    check('simengine module exports',
        typeof SimEngine.simRetarget === 'function' &&
        typeof SimEngine.simLand === 'function');
    {
        // A sim at its target lands immediately (the gjs test runner has no
        // main loop, so multi-tick glides cannot be observed here).
        let written = [];
        const fake = {};
        SimEngine.simRetarget(fake, 'x', 100, 100, 50,
            v => written.push(v));
        SimEngine.simLand(fake, 'x', v => written.push(v), 300);
        check('sim land writes target and retires', written.includes(100));
    }
}

if (failures > 0) {
    console.error(`${failures} failure(s)`);
    throw new Error(`${failures} easing test failure(s)`);
} else {
    console.log('all tests passed');
}