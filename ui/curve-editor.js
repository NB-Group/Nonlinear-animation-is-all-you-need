// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Interactive curve editor dialog for "Nonlinear animation is all you need".
//
// Interactions (kept deliberately small):
//   drag a point          move it (x stays strictly between its neighbors,
//                          endpoints are pinned — interruption continuity
//                          relies on a normalized [0,1] domain)
//   double-click empty    add a point at that x
//   right-click a point   remove it (down to endpoints-only = linear)
//   ▶ button              replay the curve with a moving dot
//
// The y range extends beyond [0, 1] (highlighted band) so overshoot shapes
// can be drawn.

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

// Translation helper. Inside the extension's prefs process this resolves to
// gettext bound to the extension's domain; standalone (tests) it falls back
// to the identity so the module stays loadable outside the shell.
let _;
try {
    ({gettext: _} = await import(
        'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'));
} catch {
    _ = s => s;
}

import {makeSpline} from '../easing.js';
import {CANVAS_Y_RANGE, drawCurve} from './curve-canvas.js';

const POINT_RADIUS = 9;
const Y_CLAMP = [-0.5, 1.5];
const POINT_COLOR = [0.21, 0.52, 0.90];

export const CurveEditorDialog = GObject.registerClass({
    GTypeName: 'NonlinearAnimationCurveEditor',
}, class CurveEditorDialog extends Adw.Dialog {
    _init({initial = null, onSave}) {
        super._init({
            content_width: 540,
            content_height: 640,
            follows_content_size: false,
        });

        this._onSave = onSave;
        this._points = initial
            ? initial.points.map(p => [p[0], p[1]])
            : [[0, 0], [0.42, 0.08], [0.58, 0.92], [1, 1]];
        this._dragIndex = -1;
        this._hoverIndex = -1;
        this._previewPlaying = false;
        this._previewProgress = undefined;

        const toolbar = new Adw.ToolbarView();
        const header = new Adw.HeaderBar();
        toolbar.add_top_bar(header);

        const cancel = new Gtk.Button({label: _('Cancel')});
        cancel.connect('clicked', () => this.close());
        const save = new Gtk.Button({label: _('Save'), css_classes: ['suggested-action']});
        save.connect('clicked', () => this._save());
        header.pack_start(cancel);
        header.pack_end(save);

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 6, margin_bottom: 12, margin_start: 12, margin_end: 12,
        });

        const nameGroup = new Adw.PreferencesGroup();
        this._nameRow = new Adw.EntryRow({title: _('Curve name')});
        this._nameRow.text = initial?.name ?? '';
        nameGroup.add(this._nameRow);
        box.append(nameGroup);

        this._canvas = new Gtk.DrawingArea({height_request: 300, hexpand: true});
        this._canvas.set_draw_func((a, cr, w, h) => this._draw(cr, w, h));
        box.append(this._canvas);

        const hint = new Gtk.Label({
            label: _('Drag points to shape the curve. Double-click to add a point, right-click to remove one.'),
            wrap: true, xalign: 0.5,
            css_classes: ['caption', 'dim-label'],
        });
        box.append(hint);

        const previewBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL, spacing: 12,
        });
        const playBtn = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic', valign: Gtk.Align.CENTER,
        });
        playBtn.connect('clicked', () => this._startPreview());
        previewBox.append(playBtn);
        this._preview = new Gtk.DrawingArea({height_request: 56, hexpand: true});
        this._preview.set_draw_func((a, cr, w, h) => this._drawPreview(cr, w, h));
        previewBox.append(this._preview);
        box.append(previewBox);

        this._error = new Gtk.Label({wrap: true, xalign: 0.5, css_classes: ['error']});
        this._error.hide();
        box.append(this._error);

        toolbar.set_content(box);
        this.set_child(toolbar);

        const click = new Gtk.GestureClick({button: 0});
        click.connect('pressed', (g, n, x, y) => this._onPressed(g, n, x, y));
        this._canvas.add_controller(click);

        const drag = new Gtk.GestureDrag();
        drag.connect('drag-begin', (g, x, y) => this._onDragBegin(g, x, y));
        drag.connect('drag-update', (g, dx, dy) => this._onDragUpdate(g, dx, dy));
        this._canvas.add_controller(drag);

        const motion = new Gtk.EventControllerMotion();
        motion.connect('motion', (m, x, y) => this._onMotion(x, y));
        motion.connect('leave', () => {
            this._hoverIndex = -1;
            this._canvas.queue_draw();
        });
        this._canvas.add_controller(motion);
    }

    // --- coordinate mapping ------------------------------------------------

    _geom(w, h) {
        const [yMin, yMax] = CANVAS_Y_RANGE;
        const pad = 14;
        return {
            px: t => pad + t * (w - 2 * pad),
            py: v => pad + (yMax - v) / (yMax - yMin) * (h - 2 * pad),
            ix: x => (x - pad) / (w - 2 * pad),
            iy: y => yMax - (y - pad) / (h - 2 * pad) * (yMax - yMin),
        };
    }

    _pointAt(x, y, w, h) {
        const g = this._geom(w, h);
        let best = -1, bestD = POINT_RADIUS * POINT_RADIUS * 2.5;
        for (let i = 0; i < this._points.length; i++) {
            const dx = g.px(this._points[i][0]) - x;
            const dy = g.py(this._points[i][1]) - y;
            const d = dx * dx + dy * dy;
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        return best;
    }

    // --- interactions ------------------------------------------------------

    _onPressed(gesture, nPress, x, y) {
        const {width, height} = this._canvas.get_allocation();
        const hit = this._pointAt(x, y, width, height);
        if (nPress === 2) {
            const g = this._geom(width, height);
            const nx = g.ix(x), ny = g.iy(y);
            let at = this._points.length;
            for (let i = 0; i < this._points.length; i++) {
                if (this._points[i][0] > nx) {
                    at = i;
                    break;
                }
            }
            if (at === 0 || at === this._points.length)
                return;  // outside the editable span
            this._points.splice(at, 0, [
                Math.min(Math.max(nx, 0.001), 0.999),
                Math.min(Math.max(ny, Y_CLAMP[0]), Y_CLAMP[1]),
            ]);
            this._canvas.queue_draw();
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        } else if (gesture.get_current_button() === 3 && hit > 0 &&
                   hit < this._points.length - 1) {
            this._points.splice(hit, 1);
            this._canvas.queue_draw();
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
        }
    }

    _onDragBegin(gesture, x, y) {
        const {width, height} = this._canvas.get_allocation();
        const hit = this._pointAt(x, y, width, height);
        // endpoints (0,0) and (1,1) are pinned
        this._dragIndex = hit > 0 && hit < this._points.length - 1 ? hit : -1;
        if (this._dragIndex >= 0)
            gesture.set_state(Gtk.EventSequenceState.CLAIMED);
    }

    _onDragUpdate(gesture, dx, dy) {
        if (this._dragIndex < 0)
            return;
        // get_start_point() returns [valid, x, y]
        const [, sx, sy] = gesture.get_start_point();
        const {width, height} = this._canvas.get_allocation();
        const g = this._geom(width, height);
        const i = this._dragIndex;
        const lo = i === 0 ? 0 : this._points[i - 1][0] + 0.01;
        const hi = i === this._points.length - 1 ? 1 : this._points[i + 1][0] - 0.01;
        const nx = Math.min(Math.max(g.ix(sx + dx), lo), Math.max(lo, hi));
        const ny = Math.min(Math.max(g.iy(sy + dy), Y_CLAMP[0]), Y_CLAMP[1]);
        if (!Number.isFinite(nx) || !Number.isFinite(ny))
            return;  // guard: one NaN would blank the whole curve
        this._points[i] = [nx, ny];
        this._canvas.queue_draw();
    }

    _onMotion(x, y) {
        const {width, height} = this._canvas.get_allocation();
        const hit = this._pointAt(x, y, width, height);
        if (hit !== this._hoverIndex) {
            this._hoverIndex = hit;
            this._canvas.queue_draw();
        }
    }

    // --- painting ----------------------------------------------------------

    _draw(cr, w, h) {
        const g = this._geom(w, h);
        drawCurve(cr, w, h, {kind: 'spline', points: this._points},
            {padding: 14, samples: 96});

        for (let i = 0; i < this._points.length; i++) {
            const [x, y] = this._points[i];
            const pinned = i === 0 || i === this._points.length - 1;
            const [r0, g0, b0] = POINT_COLOR;
            cr.setSourceRGBA(r0, g0, b0, pinned ? 0.55 : 1.0);
            const r = i === this._hoverIndex || i === this._dragIndex
                ? POINT_RADIUS + 1.5 : POINT_RADIUS - 1.5;
            cr.arc(g.px(x), g.py(y), r, 0, 2 * Math.PI);
            cr.fill();
            cr.setSourceRGBA(1, 1, 1, 0.9);
            cr.arc(g.px(x), g.py(y), r - 4, 0, 2 * Math.PI);
            cr.fill();
        }
    }

    _drawPreview(cr, w, h) {
        cr.setSourceRGBA(0.5, 0.5, 0.5, 0.35);
        cr.setLineWidth(2);
        const mid = h / 2;
        cr.moveTo(10, mid);
        cr.lineTo(w - 10, mid);
        cr.stroke();

        if (this._previewProgress === undefined)
            return;
        const spline = makeSpline(this._points);
        const p = spline.eval(Math.min(1, this._previewProgress));
        // map the visible value range [-0.25, 1.25] onto the strip
        const x = 10 + (Math.min(Math.max(p, -0.25), 1.25) + 0.25) / 1.5 * (w - 20);
        const [r0, g0, b0] = POINT_COLOR;
        cr.setSourceRGBA(r0, g0, b0, 1);
        cr.arc(x, mid, 8, 0, 2 * Math.PI);
        cr.fill();
    }

    _startPreview() {
        if (this._previewPlaying)
            return;
        this._previewPlaying = true;
        this._previewProgress = 0;
        const start = GLib.get_monotonic_time();
        this._preview.add_tick_callback(() => {
            const t = (GLib.get_monotonic_time() - start) / 1200;  // 1.2s replay
            this._previewProgress = t;
            this._preview.queue_draw();
            if (t >= 1.3) {
                this._previewPlaying = false;
                this._previewProgress = undefined;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    // --- save --------------------------------------------------------------

    _save() {
        const name = this._nameRow.text.trim();
        if (!name) {
            this._showError(_('Give the curve a name first.'));
            return;
        }
        const pts = this._points.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]);
        // pin endpoint values exactly — x pinning is enforced during drag,
        // but y on the first/last point must also be exactly 0/1
        pts[0][1] = 0;
        pts[pts.length - 1][1] = 1;
        const err = validatePointsLocal(pts);
        if (err) {
            this._showError(err);
            return;
        }
        this._onSave({name, kind: 'spline', points: pts});
        this.close();
    }

    _showError(msg) {
        this._error.label = msg;
        this._error.show();
    }
});

function validatePointsLocal(points) {
    let prevX = -Infinity;
    for (const p of points) {
        if (p[0] <= prevX)
            return _('Points must stay ordered left to right.');
        if (p[1] < -0.5 || p[1] > 1.5)
            return _('Keep points between -0.5 and 1.5 vertically.');
        prevX = p[0];
    }
    return null;
}
