// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Nonlinear animation is all you need — make GNOME's overview/workspace/window
// animations feel more macOS-like (smooth easing curves, optionally with
// overshoot) by wrapping the prototype ease methods gnome-shell adds in
// js/ui/environment.js.
//
// All settings are live (read from GSettings on every ease call, which is a
// cached lookup, not IPC) — adjust them in the extension's preferences window
// or via gsettings/dconf and the next animation reflects them instantly.
// No relogin needed to tune (only the very first enable needs the shell to
// have loaded the extension).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

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
        this._settings = this.getSettings('org.gnome.shell.extensions.nonlinear-animation');

        this._orig = {
            ease: Clutter.Actor.prototype.ease,
            easeProperty: Clutter.Actor.prototype.ease_property,
            easeAsync: Clutter.Actor.prototype.easeAsync,
            adjustmentEase: St.Adjustment.prototype.ease,
        };

        const settings = this._settings;
        const orig = this._orig;

        // Touchpad-gesture exclusion: when the user drives an overview/workspace
        // open with a 3-finger swipe, the motion is gesture-driven (it already
        // tracks the finger). We leave the wrap-up animation at GNOME's native
        // speed so it doesn't feel dragged after release. Discrete triggers
        // (Super key) still get the spring. We stamp the last gesture event time
        // and skip springify for a short grace window after it.
        let lastGestureTime = 0;
        this._gestureId = global.stage.connect('captured-event', (_stage, event) => {
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
        });

        const springify = params => {
            if (!settings.get_boolean('enabled'))
                return params;
            if (!params || typeof params !== 'object' || params.duration === undefined)
                return params;
            if (params.duration < settings.get_int('threshold-ms'))
                return params;

            const grace = settings.get_int('gesture-grace-ms');
            const inGrace = grace > 0 && Date.now() - lastGestureTime < grace;
            if (inGrace) {
                // Gesture-driven motion already carries the finger's momentum. For
                // the wrap-up we ONLY decelerate (ease-out): an in-out curve would
                // decelerate-then-accelerate and jolt against the gesture's velocity.
                // We keep GNOME's velocity-matched EASE_OUT_CUBIC (its t=0 derivative
                // matches the release velocity, so changing the curve would jolt) but
                // stretch the duration a touch so the deceleration phase reads more
                // (native gesture commits are tuned quite fast). gesture-duration-scale
                // defaults 1.3; set 1.0 to make gestures fully native again.
                params.mode = Clutter.AnimationMode.EASE_OUT_CUBIC;
                const gscale = settings.get_double('gesture-duration-scale');
                if (gscale !== 1.0)
                    params.duration = Math.round(params.duration * gscale);
                return params;
            }

            const mode = MODE_MAP[settings.get_string('mode')];
            if (mode !== undefined)
                params.mode = mode;
            params.duration = Math.round(params.duration * settings.get_double('duration-scale'));
            return params;
        };

        Clutter.Actor.prototype.ease = function (props) {
            return orig.ease.call(this, springify(props));
        };
        Clutter.Actor.prototype.ease_property = function (propName, target, params) {
            return orig.easeProperty.call(this, propName, target, springify(params));
        };
        if (orig.easeAsync) {
            Clutter.Actor.prototype.easeAsync = function (props) {
                return orig.easeAsync.call(this, springify(props));
            };
        }
        St.Adjustment.prototype.ease = function (target, params) {
            return orig.adjustmentEase.call(this, target, springify(params));
        };

        // Optional: ease the compiz-alike-magic-lamp-effect minimize/unminimize
        // timeline so it decelerates instead of stopping dead. Live-toggleable.
        this._mlIds = [];
        this._installMagicLampHooks();
        this._mlSettingId = settings.connect(
            'changed::magic-lamp-easing', () => this._installMagicLampHooks());
    }

    _installMagicLampHooks() {
        this._removeMagicLampHooks();
        if (!this._settings.get_boolean('magic-lamp-easing'))
            return;
        this._mlIds = [
            global.window_manager.connect('minimize', (_wm, actor) => this._easeMagicLamp(actor)),
            global.window_manager.connect('unminimize', (_wm, actor) => this._easeMagicLamp(actor)),
        ];
    }

    _removeMagicLampHooks() {
        for (const id of this._mlIds) {
            try { global.window_manager.disconnect(id); } catch (e) {}
        }
        this._mlIds = [];
    }

    _easeMagicLamp(actor) {
        if (!actor) return;
        // Defer one main-loop iteration: signal handlers run synchronously in
        // connection order, so depending on load order our handler may fire
        // before magic-lamp has called add_effect_with_name(). By the next
        // HIGH_IDLE the effect (and the timeline created in its vfunc_set_actor)
        // is in place, and the timeline's first new-frame has not fired yet.
        GLib.idle_add(GLib.PRIORITY_HIGH_IDLE, () => {
            try {
                for (const name of [MAGIC_LAMP_MINIMIZE, MAGIC_LAMP_UNMINIMIZE]) {
                    const effect = actor.get_effect(name);
                    const timeline = effect?.timerId;
                    if (timeline && timeline.set_progress_mode) {
                        timeline.set_progress_mode(Clutter.AnimationMode.EASE_OUT_CUBIC);
                        // Stretch the timeline a touch so the deceleration reads
                        // more (native magic-lamp is quite fast). 1.3 ≈ noticeable
                        // but not slow; tune here.
                        const orig = timeline.get_duration();
                        if (orig > 0)
                            timeline.set_duration(Math.round(orig * 1.3));
                    }
                }
            } catch (e) {}
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        Clutter.Actor.prototype.ease = this._orig.ease;
        Clutter.Actor.prototype.ease_property = this._orig.easeProperty;
        if (this._orig.easeAsync)
            Clutter.Actor.prototype.easeAsync = this._orig.easeAsync;
        St.Adjustment.prototype.ease = this._orig.adjustmentEase;
        if (this._gestureId) {
            global.stage.disconnect(this._gestureId);
            this._gestureId = 0;
        }
        this._removeMagicLampHooks();
        if (this._mlSettingId) {
            this._settings.disconnect(this._mlSettingId);
            this._mlSettingId = 0;
        }
        this._orig = null;
        this._settings = null;
    }
}
