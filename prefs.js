// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Preferences for "Nonlinear animation is all you need". Everything here is
// live — the extension reads GSettings on every animation, so changes apply
// instantly.
//
// Layout: a curve gallery (pick a preset, craft your own, import/export),
// one speed slider, motion options (interruption continuity, spring
// fidelity), behavior switches, and an Advanced section for the tuning keys
// power users can feel.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as Curves from './curves.js';
import {makeThumb} from './ui/curve-canvas.js';
import {CurveEditorDialog} from './ui/curve-editor.js';

const CARD_CSS = `
.curve-card {
    border-radius: 12px;
    padding: 10px 12px 8px;
}
.curve-card.selected {
    outline: 2px solid @accent_color;
    outline-offset: 2px;
    background: alpha(@accent_color, 0.08);
}
.curve-card:hover {
    background: alpha(currentColor, 0.05);
}
`;

export default class SpringEasePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const provider = new Gtk.CssProvider();
        provider.load_from_data(CARD_CSS, -1);
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(),
            provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        const page = new Adw.PreferencesPage({
            title: _('Nonlinear Animation'),
            icon_name: 'preferences-desktop-animation-symbolic',
        });

        // ---- Curve gallery ----
        this._gallery = new Adw.PreferencesGroup({
            title: _('Animation curve'),
            description: _('Pick a curve — it applies instantly. Create your own, or share curves as files.'),
        });
        page.add(this._gallery);

        this._window = window;
        this._settings = settings;
        this._rebuildGallery();

        // Gio.Settings in the prefs process has no connectObject (that's a
        // shell-process patch); track ids and clean up with the window.
        this._settingSignalIds = [
            settings.connect('changed::user-curves', () => this._rebuildGallery()),
            settings.connect('changed::selected-curve', () => this._markSelected()),
        ];
        window.connect('destroy', () => {
            for (const id of this._settingSignalIds)
                settings.disconnect(id);
        });

        // ---- Speed ----
        const speedGroup = new Adw.PreferencesGroup({
            title: _('Speed'),
            description: _('How long eased animations take to play. 1.0 = GNOME default, 1.8 ≈ macOS.'),
        });
        const scaleRow = new Adw.ActionRow({title: _('Animation speed')});
        const scale = new Gtk.Scale({
            adjustment: Gtk.Adjustment.new(1.8, 0.5, 5.0, 0.05, 0.5, 0),
            draw_value: true,
            digits: 2,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });
        scale.set_format_value_func((_s, v) => `×${v.toFixed(2)}`);
        scale.add_mark(1.0, Gtk.PositionType.BOTTOM, null);
        scale.add_mark(1.8, Gtk.PositionType.BOTTOM, null);
        scale.add_mark(3.0, Gtk.PositionType.BOTTOM, null);
        scaleRow.add_suffix(scale);
        scaleRow.activatable_widget = scale;
        settings.bind('duration-scale', scale.adjustment, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        speedGroup.add(scaleRow);
        page.add(speedGroup);

        // ---- Motion ----
        const motionGroup = new Adw.PreferencesGroup({
            title: _('Motion'),
        });

        const continuityRow = new Adw.SwitchRow({
            title: _('Interruption continuity'),
            subtitle: _('Interrupted animations keep their momentum instead of restarting from standstill (e.g. flipping two app-grid pages quickly).'),
        });
        settings.bind('continuity', continuityRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        motionGroup.add(continuityRow);

        const solverRow = new Adw.ComboRow({
            title: _('Spring fidelity'),
            subtitle: _('How spring curves are solved.'),
        });
        const solverModel = new Gtk.StringList();
        solverModel.append(_('Efficient (analytic)'));
        solverModel.append(_('Ultra (frame integration) — higher fidelity, more CPU'));
        solverRow.model = solverModel;
        solverRow.selected = settings.get_string('spring-solver') === 'numeric' ? 1 : 0;
        solverRow.connect('notify::selected', () => {
            settings.set_string('spring-solver', solverRow.selected === 1 ? 'numeric' : 'analytic');
        });
        motionGroup.add(solverRow);
        page.add(motionGroup);

        // ---- Behavior ----
        const switchGroup = new Adw.PreferencesGroup({title: _('Behavior')});
        const enableRow = new Adw.SwitchRow({
            title: _('Enabled'),
            subtitle: _('Quick A/B compare; off = GNOME default easing.'),
        });
        settings.bind('enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        switchGroup.add(enableRow);

        const magicLampRow = new Adw.SwitchRow({
            title: _('Ease magic-lamp minimize'),
            subtitle: _('If compiz-alike-magic-lamp-effect is installed, decelerate its minimize/unminimize into the dock. No-op otherwise.'),
        });
        settings.bind('magic-lamp-easing', magicLampRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        switchGroup.add(magicLampRow);
        page.add(switchGroup);

        // ---- Advanced ----
        const advGroup = new Adw.PreferencesGroup();
        const expander = new Adw.ExpanderRow({
            title: _('Advanced'),
            subtitle: _('Threshold and touchpad-gesture exceptions — rarely touched.'),
        });
        advGroup.add(expander);

        const thrRow = new Adw.SpinRow({
            title: _('Threshold (ms)'),
            subtitle: _('Only animations ≥ this get eased (hovers ~100ms). Lower = more things eased.'),
            adjustment: Gtk.Adjustment.new(100, 0, 2000, 10, 50, 0),
        });
        settings.bind('threshold-ms', thrRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        expander.add_row(thrRow);

        const graceRow = new Adw.SpinRow({
            title: _('Gesture grace (ms)'),
            subtitle: _('After a 3-finger swipe/pinch, animations play native for this long. 0 = ease everything.'),
            adjustment: Gtk.Adjustment.new(800, 0, 3000, 50, 200, 0),
        });
        settings.bind('gesture-grace-ms', graceRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        expander.add_row(graceRow);

        const gestureScaleRow = new Adw.SpinRow({
            title: _('Gesture duration scale'),
            subtitle: _('Stretches gesture commits (workspace switch, paging) — curve stays velocity-matched so no jolt. 1.0 = native.'),
            adjustment: Gtk.Adjustment.new(1.3, 1.0, 3.0, 0.1, 0.5, 2),
            digits: 2,
        });
        settings.bind('gesture-duration-scale', gestureScaleRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        expander.add_row(gestureScaleRow);
        page.add(advGroup);

        window.add(page);
    }

    // --- gallery ------------------------------------------------------------

    _userCurves() {
        return Curves.parseUserCurves(this._settings.get_strv('user-curves'));
    }

    _selectedId() {
        return this._settings.get_string('selected-curve');
    }

    _rebuildGallery() {
        if (this._flow)
            this._gallery.remove(this._flow);
        this._flow = null;

        // Selection visuals are ours: the theme's FlowBox selection background
        // would sit under the blue curve thumbnails and hide them.
        const flow = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE,
            homogeneous: true,
            column_spacing: 12,
            row_spacing: 12,
            min_children_per_line: 3,
            max_children_per_line: 5,
            activate_on_single_click: true,
        });
        flow.connect('child-activated', (_f, child) => {
            this._settings.set_string('selected-curve', child.curve_id);
        });

        const curves = [...Curves.BUILTIN_CURVES, ...this._userCurves()];
        for (const c of curves) {
            const card = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                css_classes: ['curve-card'],
            });
            card.append(makeThumb(c));
            card.append(new Gtk.Label({
                label: c.builtin ? _(c.name) : c.name,
                ellipsize: 3,  // PANGO_ELLIPSIZE_END
                css_classes: ['caption'],
            }));
            const child = new Gtk.FlowBoxChild({child: card, focusable: true});
            child.curve_id = c.id;
            flow.insert(child, -1);
        }
        this._flow = flow;
        this._gallery.add(flow);

        // action buttons under the gallery
        if (this._actionRow)
            this._gallery.remove(this._actionRow);
        const actionRow = this._actionRow = new Adw.ActionRow();
        const newBtn = new Gtk.Button({
            label: _('New curve'),
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
        });
        newBtn.connect('clicked', () => this._openEditor(null));
        const importBtn = new Gtk.Button({
            label: _('Import'),
            icon_name: 'document-open-symbolic',
            valign: Gtk.Align.CENTER,
        });
        importBtn.connect('clicked', () => this._importCurves());
        const exportBtn = new Gtk.Button({
            label: _('Export'),
            icon_name: 'document-save-symbolic',
            valign: Gtk.Align.CENTER,
        });
        exportBtn.connect('clicked', () => this._exportCurves());
        const deleteBtn = this._deleteBtn = new Gtk.Button({
            label: _('Delete'),
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        deleteBtn.connect('clicked', () => this._deleteSelected());
        actionRow.add_prefix(newBtn);
        actionRow.add_suffix(importBtn);
        actionRow.add_suffix(exportBtn);
        actionRow.add_suffix(deleteBtn);
        this._gallery.add(actionRow);

        this._markSelected();
    }

    _markSelected() {
        if (!this._flow)
            return;
        const selected = this._selectedId();
        let child = this._flow.get_first_child();
        while (child) {
            child.get_child().css_classes = child.curve_id === selected
                ? ['curve-card', 'selected']
                : ['curve-card'];
            child = child.get_next_sibling();
        }
        const isUser = selected.startsWith('user:');
        this._deleteBtn.visible = isUser;
        this._deleteBtn.sensitive = isUser;
    }

    // --- editor / import / export ------------------------------------------

    _openEditor(initial) {
        const dialog = new CurveEditorDialog({
            initial,
            onSave: curve => {
                const curves = this._userCurves();
                if (initial) {
                    const i = curves.findIndex(c => c.id === initial.id);
                    if (i >= 0) {
                        curves[i] = {...curves[i], ...curve};
                        this._saveUserCurves(curves);
                        return;
                    }
                }
                if (curves.length >= Curves.MAX_USER_CURVES) {
                    this._alert(_('Library full'),
                        _('At most %d user curves can be stored.').format(Curves.MAX_USER_CURVES));
                    return;
                }
                curve.id = `user:${this._genId()}`;
                curves.push(curve);
                this._saveUserCurves(curves);
                this._settings.set_string('selected-curve', curve.id);
            },
        });
        dialog.present(this._window);
    }

    _genId() {
        return [...Array(8)]
            .map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    }

    _saveUserCurves(curves) {
        this._settings.set_strv('user-curves', curves.map(Curves.serializeUserCurve));
    }

    _importCurves() {
        const dialog = new Gtk.FileDialog({
            title: _('Import curves'),
            filters: this._curveFileFilter(),
        });
        dialog.open(this._window, null, (d, res) => {
            let file;
            try {
                file = d.open_finish(res);
            } catch {
                return;  // cancelled
            }
            file.load_contents_async(null, (f, loadRes) => {
                let contents;
                try {
                    [, contents] = f.load_contents_finish(loadRes);
                } catch {
                    this._alert(_('Import failed'), _('Could not read the file.'));
                    return;
                }
                const text = new TextDecoder().decode(contents);
                const parsed = Curves.parseImportFile(text);
                if (parsed.error) {
                    this._alert(_('Import failed'), parsed.error);
                    return;
                }
                const curves = this._userCurves();
                if (curves.length + parsed.curves.length > Curves.MAX_USER_CURVES) {
                    this._alert(_('Import failed'),
                        _('At most %d user curves can be stored.').format(Curves.MAX_USER_CURVES));
                    return;
                }
                const existing = new Set(curves.map(c => c.name));
                for (const c of parsed.curves) {
                    if (existing.has(c.name)) {
                        let n = 2;
                        while (existing.has(`${c.name} (${n})`))
                            n++;
                        c.name = `${c.name} (${n})`;
                    }
                    existing.add(c.name);
                    c.id = `user:${this._genId()}`;
                    curves.push(c);
                }
                this._saveUserCurves(curves);
            });
        });
    }

    _exportCurves() {
        const selected = this._selectedId();
        const curves = [...Curves.BUILTIN_CURVES, ...this._userCurves()];
        const c = curves.find(x => x.id === selected) ?? curves[0];
        const name = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'curve';

        const dialog = new Gtk.FileDialog({
            title: _('Export curve'),
            initial_name: `${name}.nla-curve.json`,
        });
        dialog.save(this._window, null, (d, res) => {
            let file;
            try {
                file = d.save_finish(res);
            } catch {
                return;  // cancelled
            }
            const bytes = new TextEncoder().encode(Curves.exportBundle([c]));
            file.replace_contents_async(bytes, null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null, null);
        });
    }

    _deleteSelected() {
        const selected = this._selectedId();
        if (!selected.startsWith('user:'))
            return;
        const curves = this._userCurves();
        const c = curves.find(x => x.id === selected);
        this._confirm(_('Delete “%s”?').format(c?.name ?? selected), () => {
            this._saveUserCurves(curves.filter(x => x.id !== selected));
            this._settings.set_string('selected-curve', Curves.defaultCurveId());
        });
    }

    _curveFileFilter() {
        const filters = new Gio.ListStore();
        const filter = new Gtk.FileFilter({
            name: _('Nonlinear animation curves'),
        });
        filter.add_pattern('*.nla-curve.json');
        filter.add_pattern('*.nla-curves.json');
        filter.add_mime_type('application/json');
        filters.append(filter);
        return filters;
    }

    _alert(heading, body) {
        const dialog = new Adw.AlertDialog({heading, body: body ?? ''});
        dialog.add_response('ok', _('OK'));
        dialog.present(this._window);
    }

    _confirm(heading, onYes) {
        const dialog = new Adw.AlertDialog({
            heading,
            body: _('This cannot be undone.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.choose(this._window, null, (d, res) => {
            try {
                if (d.choose_finish(res) === 'delete')
                    onYes();
            } catch {
                // cancelled
            }
        });
    }
}
