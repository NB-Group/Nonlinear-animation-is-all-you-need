// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Preferences for "Nonlinear animation is all you need". Everything here is live — the extension
// reads GSettings on every animation, so dragging these applies instantly.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/shell/extensions/extensionPreferences.js';

// nick -> label. Order is what shows in the combo. Grouped: two-sided first
// (most users want accel + decel), then one-sided decel, then overshoot/bounce.
const MODE_LABELS = [
    // --- Two-sided: accelerate in, decelerate out (recommended) ---
    ['ease-in-out-cubic', 'In-Out Cubic  ·  balanced S-curve (recommended)'],
    ['ease-in-out-quart', 'In-Out Quart  ·  stronger S-curve'],
    ['ease-in-out-quint', 'In-Out Quint  ·  dramatic S-curve'],
    ['ease-in-out-expo', 'In-Out Expo  ·  most dramatic, hard stop both ends'],
    // --- One-sided: only decelerate at the end ---
    ['ease-out-cubic', 'Out Cubic  ·  smooth decel'],
    ['ease-out-quart', 'Out Quart  ·  stronger decel'],
    ['ease-out-quint', 'Out Quint  ·  hard decel'],
    ['ease-out-expo', 'Out Expo  ·  sharpest decel'],
    // --- With overshoot/bounce ---
    ['ease-out-back', 'Out Back  ·  single overshoot'],
    ['ease-out-elastic', 'Out Elastic  ·  bouncy spring'],
];

export default class SpringEasePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.nonlinear-animation');

        const page = new Adw.PreferencesPage({
            title: 'Nonlinear Animation',
            icon_name: 'preferences-desktop-animation-symbolic',
        });

        // ---- Curve & speed ----
        const curveGroup = new Adw.PreferencesGroup({
            title: 'Curve & speed',
            description: 'Tune live — changes apply instantly, no relogin.',
        });

        // --- Easing curve (combo) ---
        const modeModel = new Gtk.StringList();
        const nicks = MODE_LABELS.map(([nick, label]) => {
            modeModel.append(label);
            return nick;
        });
        const modeRow = new Adw.ComboRow({
            title: 'Easing curve',
            subtitle: 'Two-sided (In-Out) curves also ease at the start, not just the end.',
            model: modeModel,
        });
        modeRow.set_selected(Math.max(0, nicks.indexOf(settings.get_string('mode'))));
        modeRow.connect('notify::selected', () => {
            settings.set_string('mode', nicks[modeRow.selected]);
        });
        curveGroup.add(modeRow);

        // --- Duration scale (double spin) ---
        const scaleRow = new Adw.SpinRow({
            title: 'Duration scale',
            subtitle: '1.0 = GNOME default speed · 1.8 ≈ macOS · 2.5 = slow/luxurious.',
            adjustment: Gtk.Adjustment.new(1.8, 0.5, 5.0, 0.1, 0.5, 2),
            digits: 1,
        });
        settings.bind('duration-scale', scaleRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        curveGroup.add(scaleRow);

        // --- Threshold (int spin) ---
        const thrRow = new Adw.SpinRow({
            title: 'Threshold (ms)',
            subtitle: 'Only animations ≥ this get eased (hovers ~100ms). Lower = more things eased.',
            adjustment: Gtk.Adjustment.new(100, 0, 2000, 10, 50, 0),
        });
        settings.bind('threshold-ms', thrRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        curveGroup.add(thrRow);

        page.add(curveGroup);

        // ---- Touchpad gestures ----
        const gestureGroup = new Adw.PreferencesGroup({
            title: 'Touchpad gestures',
            description: 'Gesture-driven opens already track your finger; keep their wrap-up native.',
        });

        const graceRow = new Adw.SpinRow({
            title: 'Gesture grace (ms)',
            subtitle: 'After a 3-finger swipe/pinch, animations play native for this long. 0 = ease everything.',
            adjustment: Gtk.Adjustment.new(800, 0, 3000, 50, 200, 0),
        });
        settings.bind('gesture-grace-ms', graceRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        gestureGroup.add(graceRow);

        const gestureScaleRow = new Adw.SpinRow({
            title: 'Gesture duration scale',
            subtitle: 'Stretches gesture commits (workspace switch, paging) — curve stays EASE_OUT_CUBIC so no jolt. 1.0 = native.',
            adjustment: Gtk.Adjustment.new(1.3, 1.0, 3.0, 0.1, 0.5, 2),
            digits: 2,
        });
        settings.bind('gesture-duration-scale', gestureScaleRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        gestureGroup.add(gestureScaleRow);

        page.add(gestureGroup);

        // ---- Master switch ----
        const switchGroup = new Adw.PreferencesGroup();
        const enableRow = new Adw.SwitchRow({
            title: 'Enabled',
            subtitle: 'Quick A/B compare; off = GNOME default easing.',
        });
        settings.bind('enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        switchGroup.add(enableRow);

        page.add(switchGroup);
        window.add(page);
    }
}
