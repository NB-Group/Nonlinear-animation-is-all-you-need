// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Nonlinear animation is all you need — make GNOME's overview/workspace/window
// animations feel more macOS-like (smooth easing curves, springs, velocity
// continuity) by wrapping the prototype ease methods gnome-shell adds in
// js/ui/environment.js.
//
// Curve model (curves.js): native-mode presets, N-point monotone splines and
// damped springs. Native modes are applied by just swapping params.mode —
// zero overhead. Custom curves are driven per-frame: the transition is left
// fully native (completion signals, remove-on-complete, the shell's own
// callbacks all keep working) and a connect_after('new-frame') handler writes
// the eased value right after the class handler each frame (continuity.js).
//
// Interruption continuity: when a new ease replaces a still-playing one,
// gnome-shell restarts from the current position with zero velocity — the
// "second app-grid page re-accelerates from standstill" jolt. We read the old
// animation's velocity from our registry and seed the new curve with it.
//
// All settings are live (GSettings reads are cached lookups, not IPC).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import System from 'system';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Curves from './curves.js';
import {
    MAX_V0,
    MIN_V0,
    driveTransition,
    motionState,
    noteModeAnimation,
} from './continuity.js';

// WorkspaceAnimation drives one MonitorGroup per monitor to slide workspaces.
// Those actors size themselves from the monitor layout while animating, and a
// changed duration/curve there has been reported to make secondary monitors
// flicker on multi-head fractional-scale setups (issue #1), so we leave them
// entirely alone.
import * as WorkspaceAnimation from
    'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const MonitorGroup = WorkspaceAnimation.MonitorGroup ?? null;

// Stay out of the way while the shell is still coming up at login: the boot
// sequence (first layout passes, chrome fades) is timing-sensitive on
// multi-monitor setups and "sometimes fails to initialize" (issue #1).
const BOOT_GRACE_MS = 8000;

const MODE_MAP = {
    'ease-out-cubic': Clutter.AnimationMode.EASE_OUT_CUBIC,
    'ease-out-expo': Clutter.AnimationMode.EASE_OUT_EXPO,
    'ease-out-quart': Clutter.AnimationMode.EASE_OUT_QUART,
    'ease-out-quint': Clutter.AnimationMode.EASE_OUT_QUINT,
    'ease-in-out-cubic': Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
    'ease-in-out-quart': Clutter.AnimationMode.EASE_IN_OUT_QUART,
    'ease-in-out-quint': Clutter.AnimationMode.EASE_IN_OUT_QUINT,
    'ease-in-out-expo': Clutter.AnimationMode.EASE_IN_OUT_EXPO,
    'ease-out-back': Clutter.AnimationMode.EASE_OUT_BACK,
    'ease-out-elastic': Clutter.AnimationMode.EASE_OUT_ELASTIC,
};

// Keys of the ease params object that control the animation rather than name
// an animated property (mirrors what gnome-shell's own helpers consume).
const CONTROL_KEYS = new Set([
    'duration', 'delay', 'mode', 'progress_mode', 'repeatCount', 'autoReverse',
    'animationRequired', 'onComplete', 'onStopped',
]);

// GObject type names we can drive numerically. Anything else (booleans,
// enums, boxed values, '@'-escaped sub-object properties) is left native.
const NUMERIC_TYPES = new Set(['gfloat', 'gdouble', 'gint', 'guint']);
const GVALUE_SETTERS = {
    gfloat: 'set_float',
    gdouble: 'set_double',
    gint: 'set_int',
    guint: 'set_uint',
};

// compiz-alike-magic-lamp-effect drives its minimize/unminimize DeformEffect
// with a Clutter.Timeline left at default LINEAR progress, so the window
// collapses into the dock at full speed and stops dead. When the user opts
// in (magic-lamp-easing setting), we set that timeline's progress_mode to
// EASE_OUT_CUBIC so it decelerates into the dock. The effect names must match
// the constants in compiz-alike-magic-lamp-effect/extension.js.
const MAGIC_LAMP_MINIMIZE = 'minimize-magic-lamp-effect';
const MAGIC_LAMP_UNMINIMIZE = 'unminimize-magic-lamp-effect';

export default class SpringEaseExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._migrateSettings();

        this._orig = {
            ease: Clutter.Actor.prototype.ease,
            easeProperty: Clutter.Actor.prototype.ease_property,
            easeAsync: Clutter.Actor.prototype.easeAsync,
            adjustmentEase: St.Adjustment.prototype.ease,
        };

        const settings = this._settings;
        const orig = this._orig;

        // Curve cache: resolved per ease call without re-parsing JSON.
        // Invalidated live when the selection, the curve library or the
        // spring solver changes.
        let curve = this._resolveCurve(settings);
        const invalidateCurve = () => (curve = this._resolveCurve(settings));
        settings.connectObject(
            'changed::selected-curve', invalidateCurve,
            'changed::user-curves', invalidateCurve,
            'changed::spring-solver', invalidateCurve,
            this);

        // Touchpad-gesture exclusion: when the user drives an overview/workspace
        // open with a 3-finger swipe, the motion is gesture-driven (it already
        // tracks the finger). We leave the wrap-up animation at GNOME's native
        // speed so it doesn't feel dragged after release. Discrete triggers
        // (Super key) still get the curve. We stamp the last gesture event time
        // and skip springify for a short grace window after it.
        let lastGestureTime = 0;
        global.stage.connectObject('captured-event', (_stage, event) => {
            const t = event.type();
            if (t === Clutter.EventType.TOUCHPAD_SWIPE ||
                t === Clutter.EventType.TOUCHPAD_PINCH) {
                // 3-/4-finger swipe, pinch
                lastGestureTime = Date.now();
            } else if (t === Clutter.EventType.SCROLL) {
                // 2-finger touchpad scroll (app-grid / overview paging) arrives as
                // a SCROLL event whose source is FINGER/CONTINUOUS — NOT a mouse
                // wheel. Without this, 2-finger pages aren't seen as gestures and
                // get the full in-out+scaled treatment (the "stutter").
                const src = event.get_scroll_source?.();
                if (src === Clutter.ScrollSource.FINGER ||
                    src === Clutter.ScrollSource.CONTINUOUS)
                    lastGestureTime = Date.now();
            }
            return Clutter.EVENT_PROPAGATE;
        }, this);

        const bootTime = Date.now();

        // Idle garbage collection. The first animation after a quiet period
        // can stall for its whole duration and then snap to the end: the
        // allocations of the animation trigger a major GC on a shell heap
        // swollen by other extensions, and the main loop blocks through the
        // collection. Forcing a full GC while the screen has been completely
        // still for a while pays that cost where nobody can see it.
        let lastEaseAt = 0;
        let lastGcAt = Date.now();
        this._idleGcId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30000, () => {
            const now = Date.now();
            if (lastEaseAt > lastGcAt &&
                now - lastEaseAt > 45000 && now - bootTime > 60000) {
                System.gc();
                lastGcAt = now;
            }
            return GLib.SOURCE_CONTINUE;
        });

        // --- shared plan for one ease call ---------------------------------
        // Runs BEFORE the original ease: mutates params (mode/duration) and
        // collects what postEase() must do afterwards (per-prop drivers with
        // optional velocity seed). Returns null when nothing should happen.
        // forcedProp/forcedValue are set for the ease_property / Adjustment
        // forms, where the animated property name and its target value live
        // outside the params object.
        const planEase = (target, props, forcedProp, forcedValue) => {
            try {
                return planEaseInner(target, props, forcedProp, forcedValue);
            } catch {
                // Never let a settings/read hiccup break the caller's ease.
                return null;
            }
        };
        const planEaseInner = (target, props, forcedProp, forcedValue) => {
            if (!settings.get_boolean('enabled'))
                return null;
            if (!props || typeof props !== 'object' || props.duration === undefined)
                return null;
            if (props.duration < settings.get_int('threshold-ms'))
                return null;
            if (Date.now() - bootTime < BOOT_GRACE_MS)
                return null;

            const grace = settings.get_int('gesture-grace-ms');
            const inGrace = grace > 0 && Date.now() - lastGestureTime < grace;
            lastEaseAt = Date.now();
            if (inGrace) {
                // Gesture-driven motion already carries the finger's momentum.
                // For the wrap-up we ONLY decelerate (ease-out): an in-out curve
                // would decelerate-then-accelerate and jolt against the gesture's
                // velocity. We keep GNOME's velocity-matched EASE_OUT_CUBIC (its
                // t=0 derivative matches the release velocity) but stretch the
                // duration a touch so the deceleration phase reads more.
                // gesture-duration-scale defaults 1.3; 1.0 = fully native.
                props.mode = Clutter.AnimationMode.EASE_OUT_CUBIC;
                const gscale = settings.get_double('gesture-duration-scale');
                if (gscale !== 1.0)
                    props.duration = Math.min(5000,
                        Math.round(props.duration * gscale));
                return null;  // native path, no driver, no continuity
            }

            const c = curve;
            if (!c)
                return null;

            // The overview state adjustment is the spine of GNOME's
            // choreography: a hide() requested while it animates is deferred
            // by the shell until the animation completes, so double-clicking
            // the drawer button shows "open fully, then close". The deferral
            // is upstream and cannot be removed from an animation wrapper;
            // capping this one transition's scale shrinks the dead window
            // from ~1.2s to ~600ms while everything else keeps the setting.
            let dscale = settings.get_double('duration-scale');
            if (target === Main.overview?._overview?.controls?._stateAdjustment)
                dscale = Math.min(dscale, 1.5);
            props.duration = Math.min(5000, Math.round(props.duration * dscale));

            // Collect animated (property, new target value) pairs.
            // '@'-escaped sub-object properties are left native (the value is
            // not a plain number on this actor).
            const animated = [];
            if (forcedProp !== null) {
                animated.push([forcedProp, forcedValue]);
            } else {
                for (const key of Object.keys(props)) {
                    if (CONTROL_KEYS.has(key))
                        continue;
                    animated.push([key.replaceAll('_', '-'), props[key]]);
                }
            }

            const continuityOn = settings.get_boolean('continuity');
            const simpleCase = props.delay === undefined &&
                props.repeatCount === undefined;

            // Pass 1: per property, reconstruct the previous motion state and
            // whether the caller reset the property for a replay.
            const candidates = [];
            for (const [prop, newTarget] of animated) {
                const pspec = target.find_property?.(prop);
                const typeName = pspec?.value_type?.name;
                if (!typeName || !NUMERIC_TYPES.has(typeName))
                    continue;
                if (typeof newTarget !== 'number' || !Number.isFinite(newTarget))
                    continue;
                const isInt = typeName === 'gint' || typeName === 'guint';

                let cand = null;
                if (continuityOn && simpleCase) {
                    const state = motionState(target, prop);
                    if (state) {
                        const remaining = newTarget - state.value;
                        if (Math.abs(remaining) > 1e-6) {
                            // Anti-teleport: bridge over a reset only when the
                            // caller snapped the property onto the previous
                            // animation's endpoints (replay semantics, e.g.
                            // minimize/unminimize resetting to the icon
                            // geometry). A genuine geometry change (workspace
                            // move, resize) lands anywhere else and must start
                            // from its own new value, or windows end up
                            // animating from stale positions.
                            let fromValue;
                            const nowValue = target[prop.replaceAll('-', '_')];
                            const rangeAbs = Math.abs(state.final - state.init);
                            if (typeof nowValue === 'number' &&
                                Number.isFinite(nowValue) &&
                                rangeAbs > 1e-6 &&
                                Math.abs(nowValue - state.value) >
                                    Math.max(0.5, 0.01 * Math.abs(remaining)) &&
                                (Math.abs(nowValue - state.init) < 0.1 * rangeAbs ||
                                 Math.abs(nowValue - state.final) < 0.1 * rangeAbs))
                                fromValue = state.value;
                            const start = fromValue ?? state.value;
                            cand = {
                                prop, isInt, typeName,
                                gtype: pspec.value_type,
                                fromValue,
                                stateValue: state.value,
                                naturalV0: state.velocity * props.duration /
                                    (newTarget - start),
                                span: Math.abs(newTarget - start),
                            };
                        }
                    }
                }
                if (cand)
                    candidates.push(cand);
                else
                    numericProps.push(prop);
            }

            // Pass 2: properties of one ease must move along ONE shared
            // retarget curve. Giving each property its own seeded spring let
            // scale-x and scale-y drift apart mid-flight and windows visibly
            // stretch. The dominant property (largest travel) defines the
            // shared velocity seed; every property maps that one progress
            // curve onto its own [start, target] range, so relative geometry
            // (aspect ratio included) stays locked for the whole animation.
            // Bridging is all-or-nothing: if any property restarts from its
            // pre-reset position, every property with a motion state must,
            // or x and y set off from different eras and the window skews.
            const anyBridge = candidates.some(c => c.fromValue !== undefined);
            if (anyBridge) {
                for (const cand of candidates)
                    if (cand.fromValue === undefined)
                        cand.fromValue = cand.stateValue;
            }
            let sharedV0 = null;
            let bestSpan = 0;
            for (const cand of candidates) {
                if (Math.abs(cand.naturalV0) < MIN_V0 && cand.fromValue === undefined)
                    continue;
                if (cand.span > bestSpan) {
                    bestSpan = cand.span;
                    sharedV0 = cand.naturalV0;
                }
            }
            if (sharedV0 !== null)
                sharedV0 = Math.max(-MAX_V0, Math.min(MAX_V0, sharedV0));

            // Interruptions resolve FASTER, not slower: a retarget that keeps
            // the full (stretched) duration crawls into its target for
            // hundreds of milliseconds after the eye has decided the motion
            // is over. Shrink the retarget to 60% so the redirect is quick
            // and the settle decisive. v0 scales linearly with duration, so
            // scaling the seed here matches the shorter window exactly.
            if (sharedV0 !== null || anyBridge) {
                props.duration = Math.max(150, Math.round(props.duration * 0.6));
                sharedV0 = sharedV0 === null ? null : sharedV0 * 0.6;
            }

            const drivers = [];
            for (const cand of candidates) {
                const seed = sharedV0 === null && cand.fromValue === undefined
                    ? null
                    : {fromValue: cand.fromValue, v0: sharedV0 ?? 0};
                const wantsDriver = simpleCase && (seed !== null ||
                    c.kind === 'spline' || c.kind === 'spring');
                if (wantsDriver)
                    drivers.push({...cand, seed});
                else
                    numericProps.push(cand.prop);
            }

            if (c.kind === 'mode') {
                const mode = MODE_MAP[c.mode];
                if (mode !== undefined)
                    props.mode = mode;
            }
            // For custom curves the native mode under the driver is invisible
            // (we overwrite the value every frame); whatever mode the caller
            // asked for keeps running underneath until our handler runs.

            return {curve: c, drivers, numericProps};
        };

        // --- after the original ease --------------------------------------
        const postEase = (target, plan) => {
            if (!plan)
                return;
            try {
                for (const d of plan.drivers) {
                    // Write through the ClutterAnimatable interface — the same
                    // channel the transition itself uses. A plain property set
                    // emits notify, which invalidates stage views and makes
                    // mutter kill the very transition we are driving; the
                    // animatable path for x/y etc. bypasses notify entirely.
                    // The GValue is allocated once per animation and reused
                    // every frame (typed to the property's exact GType).
                    const gv = new GObject.Value();
                    gv.init(d.gtype);
                    const set = GVALUE_SETTERS[d.typeName];
                    const round = d.isInt ? Math.round : (v => v);
                    const write = v => {
                        gv[set](round(v));
                        target.set_final_state(d.prop, gv);
                    };
                    driveTransition(target, d.prop, plan.curve, write, d.seed);
                }
                // Register plain-mode (and non-driven numeric) animations so a
                // later interruption can read their velocity.
                for (const prop of plan.numericProps) {
                    if (!plan.drivers.some(d => d.prop === prop))
                        noteModeAnimation(target, prop, plan.curve,
                            () => target.get_transition?.(prop));
                }
            } catch {
                // A driver failure must never break the caller.
            }
        };

        const skipActor = actor =>
            MonitorGroup && actor instanceof MonitorGroup;

        Clutter.Actor.prototype.ease = function (props) {
            if (skipActor(this))
                return orig.ease.call(this, props);
            const plan = planEase(this, props, null, null);
            const r = orig.ease.call(this, props);
            postEase(this, plan);
            return r;
        };
        Clutter.Actor.prototype.ease_property = function (propName, value, params) {
            if (skipActor(this))
                return orig.easeProperty.call(this, propName, value, params);
            const plan = planEase(this, params, propName, value);
            const r = orig.easeProperty.call(this, propName, value, params);
            postEase(this, plan);
            return r;
        };
        if (orig.easeAsync) {
            Clutter.Actor.prototype.easeAsync = function (props) {
                if (skipActor(this))
                    return orig.easeAsync.call(this, props);
                const plan = planEase(this, props, null, null);
                const r = orig.easeAsync.call(this, props);
                postEase(this, plan);
                return r;
            };
        }
        St.Adjustment.prototype.ease = function (value, params) {
            const plan = planEase(this, params, 'value', value);
            const r = orig.adjustmentEase.call(this, value, params);
            postEase(this, plan);
            return r;
        };

        // Optional: ease the compiz-alike-magic-lamp-effect minimize/unminimize
        // timeline so it decelerates instead of stopping dead. Live-toggleable.
        this._deferredEaseId = 0;
        this._installMagicLampHooks();
        this._settings.connectObject(
            'changed::magic-lamp-easing', () => this._installMagicLampHooks(),
            this);
    }

    _resolveCurve(settings) {
        try {
            const userCurves = Curves.parseUserCurves(settings.get_strv('user-curves'));
            const id = settings.get_string('selected-curve');
            const c = Curves.findCurve(id, userCurves) ??
                Curves.findCurve(Curves.defaultCurveId(), userCurves);
            if (c?.kind === 'spring')
                return {...c, solver: settings.get_string('spring-solver')};
            return c;
        } catch {
            return null;
        }
    }

    // One-time: carry the legacy `mode` key into the curve library.
    _migrateSettings() {
        if (this._settings.get_int('schema-version') >= 2)
            return;
        const oldMode = this._settings.get_string('mode');
        const mapped = Curves.MIGRATION_MAP[oldMode];
        if (mapped)
            this._settings.set_string('selected-curve', mapped);
        this._settings.set_int('schema-version', 2);
    }

    _installMagicLampHooks() {
        global.window_manager.disconnectObject(this);
        if (!this._settings.get_boolean('magic-lamp-easing'))
            return;
        global.window_manager.connectObject(
            'minimize', (_wm, actor) => this._easeMagicLamp(actor),
            'unminimize', (_wm, actor) => this._easeMagicLamp(actor),
            this);
    }

    _easeMagicLamp(actor) {
        if (!actor) return;
        // Defer one main-loop iteration: signal handlers run synchronously in
        // connection order, so depending on load order our handler may fire
        // before magic-lamp has called add_effect_with_name(). By the next
        // HIGH_IDLE the effect (and the timeline created in its vfunc_set_actor)
        // is in place, and the timeline's first new-frame has not fired yet.
        if (this._deferredEaseId)
            GLib.source_remove(this._deferredEaseId);
        this._deferredEaseId = GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
            this._deferredEaseId = 0;
            if (!this._magicLampTimers)
                this._magicLampTimers = new WeakMap();
            const prev = this._magicLampTimers.get(actor);
            for (const name of [MAGIC_LAMP_MINIMIZE, MAGIC_LAMP_UNMINIMIZE]) {
                const effect = actor.get_effect(name);
                const timeline = effect?.timerId;
                if (timeline?.set_progress_mode) {
                    timeline.set_progress_mode(Clutter.AnimationMode.EASE_OUT_CUBIC);
                    // Fixed duration for both minimize and unminimize so they
                    // feel symmetric. 700ms = slow enough to read the
                    // deceleration; tune here.
                    timeline.set_duration(700);
                    // Interruption: if the previous magic-lamp timeline for
                    // this window was still mid-flight, fast-forward the new
                    // one so the effect continues instead of teleporting back
                    // to the start of its deformation.
                    const elapsed = prev?.timeline?.is_playing?.()
                        ? prev.timeline.get_elapsed_time() : 0;
                    if (elapsed > 0 && elapsed < 700)
                        timeline.advance(elapsed);
                    this._magicLampTimers.set(actor, {timeline});
                }
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        Clutter.Actor.prototype.ease = this._orig.ease;
        Clutter.Actor.prototype.ease_property = this._orig.easeProperty;
        if (this._orig.easeAsync)
            Clutter.Actor.prototype.easeAsync = this._orig.easeAsync;
        St.Adjustment.prototype.ease = this._orig.adjustmentEase;
        global.stage.disconnectObject(this);
        global.window_manager.disconnectObject(this);
        this._settings.disconnectObject(this);
        if (this._deferredEaseId) {
            GLib.source_remove(this._deferredEaseId);
            this._deferredEaseId = 0;
        }
        if (this._idleGcId) {
            GLib.source_remove(this._idleGcId);
            this._idleGcId = 0;
        }
        this._orig = null;
        this._settings = null;
    }
}
