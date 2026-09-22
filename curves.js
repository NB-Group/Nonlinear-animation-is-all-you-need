// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Curve library for "Nonlinear animation is all you need": built-in presets,
// user-created curves (N-point splines, springs), JSON import/export, and
// GSettings (de)serialization.
//
// A curve is a plain serializable object:
//   {id, name, kind: 'mode',   mode: 'ease-in-out-cubic'}
//   {id, name, kind: 'spline', points: [[0,0], [0.3,1.06], [1,1]]}
//   {id, name, kind: 'spring', damping: 0.62, omega: 8}
// Built-in ids are 'preset:<slug>'; user curves get 'user:<hex>'.
// This module has no GI imports — it is shared by the shell and prefs sides.

import {sampleBezier} from './easing.js';

// Marker for xgettext only; the prefs side translates builtin names at
// display time with _() (see the gallery builder).
const N_ = s => s;

export const FORMAT_TAG = 'nonlinear-animation/curve';
export const FORMAT_VERSION = 1;
export const MAX_USER_CURVES = 100;

// The curated gallery — deliberately tiny: two done-for-you presets plus
// whatever the user creates/imports. Springs are intentionally NOT presets:
// macOS's lesson is that springs belong in the physics layer (interruption
// momentum), picked for you, not in the picker.
export const BUILTIN_CURVES = [
    {id: 'preset:ease-in-out-cubic', builtin: true, name: N_('Balanced'), kind: 'mode', mode: 'ease-in-out-cubic'},
    {id: 'preset:ease-in-out-expo', builtin: true, name: N_('Dramatic'), kind: 'mode', mode: 'ease-in-out-expo'},
];

export const MIGRATION_MAP = {
    'ease-out-cubic': 'preset:ease-in-out-cubic',
    'ease-out-expo': 'preset:ease-in-out-expo',
    'ease-out-quart': 'preset:ease-in-out-cubic',
    'ease-out-quint': 'preset:ease-in-out-cubic',
    'ease-in-out-cubic': 'preset:ease-in-out-cubic',
    'ease-in-out-quart': 'preset:ease-in-out-expo',
    'ease-in-out-quint': 'preset:ease-in-out-expo',
    'ease-in-out-expo': 'preset:ease-in-out-expo',
    'ease-out-back': 'preset:ease-in-out-expo',
    'ease-out-elastic': 'preset:ease-in-out-expo',
};

// --- validation -----------------------------------------------------------

export function validateCurve(curve) {
    if (!curve || typeof curve !== 'object')
        return 'not an object';
    if (typeof curve.name !== 'string' || !curve.name.trim())
        return 'missing name';
    if (curve.name.length > 64)
        return 'name too long';
    if (curve.kind === 'mode') {
        const valid = ['ease-out-cubic', 'ease-out-expo', 'ease-out-quart',
            'ease-out-quint', 'ease-in-out-cubic', 'ease-in-out-quart',
            'ease-in-out-quint', 'ease-in-out-expo', 'ease-out-back',
            'ease-out-elastic'];
        if (!valid.includes(curve.mode))
            return `unknown mode ${curve.mode}`;
        return null;
    }
    if (curve.kind === 'spring') {
        if (!(curve.damping > 0.2 && curve.damping <= 1))
            return 'damping out of range';
        if (!(curve.omega > 1 && curve.omega < 40))
            return 'omega out of range';
        return null;
    }
    if (curve.kind === 'spline')
        return validatePoints(curve.points);
    return `unknown kind ${curve.kind}`;
}

export function validatePoints(points) {
    if (!Array.isArray(points) || points.length < 2 || points.length > 24)
        return 'need 2–24 points';
    let prevX = -Infinity;
    for (const p of points) {
        if (!Array.isArray(p) || p.length !== 2 ||
            !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
            return 'points must be [x, y] pairs of finite numbers';
        if (p[0] <= prevX)
            return 'x values must be strictly increasing';
        if (p[0] < -0.001 || p[0] > 1.001)
            return 'x values must stay in [0, 1]';
        if (p[1] < -0.5 || p[1] > 1.5)
            return 'y values must stay in [-0.5, 1.5]';
        prevX = p[0];
    }
    if (points[0][0] !== 0 || points[points.length - 1][0] !== 1)
        return 'first point must be x=0, last x=1';
    return null;
}

// --- GSettings (de)serialization ------------------------------------------

export function parseUserCurves(strv) {
    const out = [];
    for (const s of strv ?? []) {
        let c;
        try {
            c = JSON.parse(s);
        } catch {
            continue; // skip corrupt entries rather than breaking the shell
        }
        if (!validateCurve(c))
            out.push(c);
    }
    return out;
}

export function serializeUserCurve(curve) {
    return JSON.stringify({
        v: FORMAT_VERSION,
        id: curve.id,
        name: curve.name,
        kind: curve.kind,
        ...(curve.kind === 'mode' ? {mode: curve.mode} : {}),
        ...(curve.kind === 'spline' ? {points: curve.points.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)])} : {}),
        ...(curve.kind === 'spring' ? {damping: curve.damping, omega: curve.omega} : {}),
    });
}

// --- import / export ------------------------------------------------------

// Accepts both the single-curve and bundle envelopes. Returns
// {curves: [...]} on success or {error: msg} on failure.
export function parseImportFile(text) {
    let root;
    try {
        root = JSON.parse(text);
    } catch {
        return {error: 'not valid JSON'};
    }
    if (root?.format !== FORMAT_TAG)
        return {error: 'not a nonlinear-animation curve file'};
    if ((root.v ?? 0) > FORMAT_VERSION)
        return {error: 'file written by a newer version'};
    const list = Array.isArray(root.curves) ? root.curves
        : root.curve ? [root.curve]
        : null;
    if (!list)
        return {error: 'no curves in file'};
    const curves = [];
    for (const c of list) {
        const nc = normalizeCurve(c);
        const err = validateCurve(nc);
        if (err)
            return {error: `curve "${c?.name ?? '?'}": ${err}`};
        curves.push(nc);
    }
    return {curves};
}

function normalizeCurve(c) {
    // Older/share files may carry CSS-style beziers; convert to a spline
    // approximation so there is exactly one custom evaluation path.
    if (c.kind === 'bezier')
        return {name: c.name, kind: 'spline', points: sampleBezier(c.p[0], c.p[1], c.p[2], c.p[3])};
    const out = {name: c.name.trim(), kind: c.kind};
    if (c.kind === 'mode')
        out.mode = c.mode;
    if (c.kind === 'spline')
        out.points = c.points.map(p => [p[0], p[1]]);
    if (c.kind === 'spring') {
        out.damping = c.damping;
        out.omega = c.omega;
    }
    return out;
}

export function exportBundle(curves) {
    return JSON.stringify({
        format: FORMAT_TAG,
        v: FORMAT_VERSION,
        curves: curves.map(c => normalizeCurve(c)),
    }, null, 2) + '\n';
}

// --- lookup ---------------------------------------------------------------

export function findCurve(id, userCurves) {
    for (const c of BUILTIN_CURVES) {
        if (c.id === id)
            return c;
    }
    for (const c of userCurves) {
        if (c.id === id)
            return c;
    }
    return null;
}

export function defaultCurveId() {
    return BUILTIN_CURVES[0].id;
}
