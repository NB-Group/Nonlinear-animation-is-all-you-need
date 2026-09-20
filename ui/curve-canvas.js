// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Shared curve painting for "Nonlinear animation is all you need" — used by
// the gallery thumbnails and the curve editor in prefs. Pure GTK4/cairo, no
// Clutter, so the preview and the real shell animation share the exact same
// evaluators from easing.js.

import Gtk from 'gi://Gtk';
import {compileCurve} from '../easing.js';

export const CANVAS_Y_RANGE = [-0.25, 1.25];

const BLUE = [0.21, 0.52, 0.90];      // GNOME blue, readable on light & dark
const GRID = [0.5, 0.5, 0.5, 0.25];
const BAND = [0.5, 0.5, 0.5, 0.09];

// Paint `curve` into a cairo context of the given size. opts:
//   yRange   [min, max] value range to display
//   samples  polyline resolution
//   padding  inner padding in px
export function drawCurve(cr, width, height, curve, opts = {}) {
    const [yMin, yMax] = opts.yRange ?? CANVAS_Y_RANGE;
    const samples = opts.samples ?? 64;
    const pad = opts.padding ?? 8;
    const w = width - 2 * pad;
    const h = height - 2 * pad;

    const px = t => pad + t * w;
    const py = v => pad + (yMax - v) / (yMax - yMin) * h;

    // highlight the 0..1 band (the "legal" progress range)
    cr.setSourceRGBA(...BAND);
    cr.rectangle(px(0), py(1), w, py(0) - py(1));
    cr.fill();

    // baseline + target line
    cr.setSourceRGBA(...GRID);
    cr.setLineWidth(1);
    cr.moveTo(px(0), py(0));
    cr.lineTo(px(1), py(0));
    cr.moveTo(px(0), py(1));
    cr.lineTo(px(1), py(1));
    cr.stroke();

    // the curve itself
    const compiled = compileCurve(curve);
    cr.setSourceRGBA(...BLUE, 1);
    cr.setLineWidth(3);
    cr.moveTo(px(0), py(compiled.eval(0)));
    for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        cr.lineTo(px(t), py(compiled.eval(t)));
    }
    cr.stroke();
}

// A gallery tile canvas: fixed aspect, no interaction.
export function makeThumb(curve, width = 120, height = 80) {
    const area = new Gtk.DrawingArea({width_request: width, height_request: height});
    area.set_draw_func((a, cr, w, h) => drawCurve(cr, w, h, curve));
    return area;
}
