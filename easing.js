// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pure easing math for "Nonlinear animation is all you need".
//
// No GObject/GI imports here on purpose: the shell side (extension.js) uses it
// on the hot per-frame path, and the prefs side uses the same evaluators to
// draw gallery thumbnails, so behavior and preview can never drift apart.
//
// Performance doctrine: every evaluator closes over plain precomputed numbers
// and allocates nothing per call. A frame costs at most one exp() plus a
// couple of trig calls (springs) or a dozen multiply/adds (splines).

// ---------------------------------------------------------------------------
// Native Clutter modes — closed forms for value and derivative.
// Used for gallery thumbnails, velocity readback of in-flight animations we
// wrapped with a plain mode, and the continuity engine's entry-velocity math.
// tau is normalized time in [0, 1]; value is progress (may exceed [0, 1] for
// back/elastic).
// ---------------------------------------------------------------------------

const _LN2 = Math.LN2;
const _C1_BACK = 1.70158;
const _C3_BACK = _C1_BACK + 1;
const _C4_ELASTIC = 2 * Math.PI / 3;

export const MODE_FUNCS = {
    'ease-out-cubic': {
        value: t => 1 - (1 - t) ** 3,
        deriv: t => 3 * (1 - t) ** 2,
    },
    'ease-out-expo': {
        value: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t),
        deriv: t => 10 * _LN2 * 2 ** (-10 * t),
    },
    'ease-out-quart': {
        value: t => 1 - (1 - t) ** 4,
        deriv: t => 4 * (1 - t) ** 3,
    },
    'ease-out-quint': {
        value: t => 1 - (1 - t) ** 5,
        deriv: t => 5 * (1 - t) ** 4,
    },
    'ease-in-out-cubic': {
        value: t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
        deriv: t => t < 0.5 ? 12 * t * t : 3 * (-2 * t + 2) ** 2,
    },
    'ease-in-out-quart': {
        value: t => t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2,
        deriv: t => t < 0.5 ? 32 * t ** 3 : 4 * (-2 * t + 2) ** 3,
    },
    'ease-in-out-quint': {
        value: t => t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2,
        deriv: t => t < 0 ? 0 : t < 0.5 ? 80 * t ** 4 : 5 * (-2 * t + 2) ** 4,
    },
    'ease-in-out-expo': {
        value: t => t <= 0 ? 0 : t >= 1 ? 1
            : t < 0.5 ? 2 ** (20 * t - 11)
            : 1 - 2 ** (-20 * t + 9),
        deriv: t => t <= 0 || t >= 1 ? 0
            : t < 0.5 ? 20 * _LN2 * 2 ** (20 * t - 11)
            : 20 * _LN2 * 2 ** (-20 * t + 9),
    },
    'ease-out-back': {
        value: t => 1 + _C3_BACK * (t - 1) ** 3 + _C1_BACK * (t - 1) ** 2,
        deriv: t => 3 * _C3_BACK * (t - 1) ** 2 + 2 * _C1_BACK * (t - 1),
    },
    'ease-out-elastic': {
        value: t => t <= 0 ? 0 : t >= 1 ? 1
            : 2 ** (-10 * t) * Math.sin((10 * t - 0.75) * _C4_ELASTIC) + 1,
        // Analytic derivative is noisy near the endpoints; a central finite
        // difference is plenty for velocity readback (called once per
        // interruption, never per frame).
        deriv: t => {
            const e = 0.001;
            const f = MODE_FUNCS['ease-out-elastic'].value;
            return (f(t + e) - f(t - e)) / (2 * e);
        },
    },
};

// ---------------------------------------------------------------------------
// Cubic bezier (CSS-style, 2 control points). Only used offline: converting
// imported bezier curves to splines and drawing. Not on the frame path.
// ---------------------------------------------------------------------------

export function bezierY(p1x, p1y, p2x, p2y, t) {
    const u = 1 - t;
    const a = 3 * u * u * t, b = 3 * u * t * t;
    // solve y(s) where x(s) = t via Newton + bisection fallback
    let s = t;
    for (let i = 0; i < 8; i++) {
        const x = ((a * p1x + b * p2x + t ** 3) - t);
        const dx = 3 * u * u * p1x + 6 * u * t * p2x + 3 * t * t;
        if (Math.abs(x) < 1e-6 || Math.abs(dx) < 1e-6)
            break;
        s -= x / dx;
    }
    const us = 1 - s;
    return 3 * us * us * s * p1y + 3 * us * s * s * p2y + s ** 3;
}

export function sampleBezier(p1x, p1y, p2x, p2y, n = 20) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        // linear-x approximation of the bezier time parameter is fine for
        // curve *shape* sampling (x control points of real easing beziers are
        // monotone and near-diagonal)
        pts.push([t, bezierY(p1x, p1y, p2x, p2y, t)]);
    }
    return pts;
}

// ---------------------------------------------------------------------------
// Monotone cubic Hermite spline (Fritsch–Carlson tangents).
// points: [[x, y], ...] with x strictly increasing; x in [0, 1] is normalized
// time, y is progress and may exceed [0, 1] (overshoot).
// makeSpline() precomputes everything once; eval/deriv are allocation-free.
// ---------------------------------------------------------------------------

export function makeSpline(points) {
    const n = points.length;
    const xs = new Array(n), ys = new Array(n), ms = new Array(n);
    for (let i = 0; i < n; i++) {
        xs[i] = points[i][0];
        ys[i] = points[i][1];
    }
    if (n === 2) {
        ms[0] = ms[1] = (ys[1] - ys[0]) / (xs[1] - xs[0]);
    } else {
        const d = new Array(n - 1);
        for (let i = 0; i < n - 1; i++)
            d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
        ms[0] = d[0];
        ms[n - 1] = d[n - 2];
        for (let i = 1; i < n - 1; i++) {
            if (d[i - 1] * d[i] <= 0) {
                ms[i] = 0;
            } else {
                const w1 = 2 * (xs[i] - xs[i - 1]) + (xs[i + 1] - xs[i]);
                const w2 = (xs[i] - xs[i - 1]) + 2 * (xs[i + 1] - xs[i]);
                ms[i] = (d[i - 1] * w1 + d[i] * w2) / (w1 + w2);
                // Fritsch–Carlson clamp keeps the segment monotone
                const lim = 3 * Math.min(Math.abs(d[i - 1]), Math.abs(d[i]));
                if (Math.abs(ms[i]) > lim)
                    ms[i] = Math.sign(ms[i]) * lim;
            }
        }
    }

    // closure state — no allocation inside eval/deriv
    let seg = 0;

    const findSeg = x => {
        if (x <= xs[0])
            return 0;
        if (x >= xs[n - 1])
            return n - 2;
        if (x < xs[seg])
            seg = 0;
        while (x > xs[seg + 1])
            seg++;
        return seg;
    };

    return {
        xs, ys, ms,
        eval(x) {
            const i = findSeg(x);
            const h = xs[i + 1] - xs[i];
            const t = (x - xs[i]) / h;
            const t2 = t * t, t3 = t2 * t;
            return (2 * t3 - 3 * t2 + 1) * ys[i] +
                (t3 - 2 * t2 + t) * h * ms[i] +
                (-2 * t3 + 3 * t2) * ys[i + 1] +
                (t3 - t2) * h * ms[i + 1];
        },
        deriv(x) {
            const i = findSeg(x);
            const h = xs[i + 1] - xs[i];
            const t = (x - xs[i]) / h;
            const t2 = t * t;
            const dydt = (6 * t2 - 6 * t) * ys[i] +
                (3 * t2 - 4 * t + 1) * h * ms[i] +
                (-6 * t2 + 6 * t) * ys[i + 1] +
                (3 * t2 - 2 * t) * h * ms[i + 1];
            return dydt / h;
        },
    };
}

// ---------------------------------------------------------------------------
// Springs — damped harmonic oscillator, target 1, start 0, initial velocity
// v0 (progress units per second of real time). All evaluators work on
// normalized time tau in [0, 1], mapped to `periodSec` of real time; the
// caller passes the transition's duration. Overshoot beyond 1 is intentional
// and supported.
//
// makeSpring() is the closed-form analytic solution: one exp() + two trig per
// frame, coefficients precomputed. makeSpringNumeric() is the "Ultra" mode:
// semi-implicit Euler integration with a small fixed substep, trading CPU for
// fidelity (still allocation-free; state lives in closure variables).
// ---------------------------------------------------------------------------

export function makeSpring(zeta, omega, v0PerSec = 0, periodSec = 1) {
    zeta = Math.min(zeta, 1);
    const alpha = zeta * omega;
    // guard against wild flicks (progress/sec)
    const v0 = Math.min(Math.max(v0PerSec, -200), 200);
    if (zeta >= 0.999) {
        // critically damped: x(s) = 1 - e^(-ωs)·(1 + (ω - v0)·s)
        const b = omega - v0;
        return {
            analytic: true,
            eval(tau) {
                const s = tau * periodSec;
                const e = Math.exp(-omega * s);
                return 1 - e * (1 + b * s);
            },
            deriv(tau) {
                const s = tau * periodSec;
                const e = Math.exp(-omega * s);
                return (omega * e * (1 + b * s) - e * b) * periodSec;
            },
        };
    }
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const b = (v0 - alpha) / wd;
    return {
        analytic: true,
        eval(tau) {
            const s = tau * periodSec;
            const e = Math.exp(-alpha * s);
            return 1 - e * (Math.cos(wd * s) - b * Math.sin(wd * s));
        },
        deriv(tau) {
            const s = tau * periodSec;
            const e = Math.exp(-alpha * s);
            return (alpha * e * (Math.cos(wd * s) - b * Math.sin(wd * s)) +
                e * (wd * Math.sin(wd * s) + b * wd * Math.cos(wd * s))) * periodSec;
        },
    };
}

// Ultra mode: per-frame integration. The substep (in seconds) is chosen small
// enough that the fastest spring we allow (ω ≤ 40) stays well stable.
export function makeSpringNumeric(zeta, omega, v0PerSec = 0, periodSec = 1) {
    let x = 0;
    let v = Math.min(Math.max(v0PerSec, -200), 200);
    let tauDone = 0;
    const maxDt = Math.min(1 / (omega * 12 + 60), periodSec / 16);
    const c = omega * omega;
    const damp = 2 * zeta * omega;
    return {
        analytic: false,
        // integrate forward to tau; deterministic monotonic playback
        advanceTo(tau) {
            if (tau <= tauDone)
                return x;
            const sTarget = tau * periodSec;
            let s = tauDone * periodSec;
            while (s < sTarget) {
                const dt = Math.min(maxDt, sTarget - s);
                v += (c * (1 - x) - damp * v) * dt;
                x += v * dt;
                s += dt;
            }
            tauDone = tau;
            return x;
        },
        eval(tau) {
            return this.advanceTo(tau);
        },
    };
}

// ---------------------------------------------------------------------------
// Unified curve runtime. A curve object from curves.js is compiled once into
// an evaluator over normalized time tau in [0, 1]; the transition's own
// duration is already scaled by the wrapper. v0 (progress units per second)
// seeds a spring with the interrupted animation's velocity.
// ---------------------------------------------------------------------------

export function compileCurve(curve, v0 = 0, periodSec = 1) {
    if (curve.kind === 'mode') {
        // unify the interface: splines/springs expose eval/deriv
        const f = MODE_FUNCS[curve.mode] ?? MODE_FUNCS['ease-in-out-cubic'];
        return {eval: f.value, deriv: f.deriv};
    }
    if (curve.kind === 'spline')
        return makeSpline(curve.points);
    if (curve.kind === 'spring') {
        // A spring must settle within the animation's duration, or the value
        // snaps to the target when the timeline ends (very visible on GNOME's
        // short animations). Stiffen omega until the envelope decays to ~1%
        // by the end; a stiffer user omega is kept (it simply settles early
        // and rests). damping stays the character knob (overshoot amount).
        const T = Math.max(periodSec, 0.05);
        const omegaMin = 4.6 / (curve.damping * T);
        const omega = Math.min(Math.max(curve.omega, omegaMin), 40);
        if (curve.solver === 'numeric')
            return makeSpringNumeric(curve.damping, omega, v0, periodSec);
        return makeSpring(curve.damping, omega, v0, periodSec);
    }
    return MODE_FUNCS['ease-in-out-cubic'];
}

// Native-cubic-bezier evaluator (matches clutter_timeline_set_cubic_bezier_
// progress). Used where a retarget must run entirely inside the native
// transition (St.Adjustment targets: JS per-frame writes on them trigger
// layout churn that kills the transition being driven).
export function makeBezierEvaluator(p1x, p1y, p2x, p2y) {
    const evalY = t => bezierY(p1x, p1y, p2x, p2y, t);
    const e = 0.002;
    return {
        analytic: true,
        eval: evalY,
        deriv: t => (evalY(t + e) - evalY(t - e)) / (2 * e),
    };
}
