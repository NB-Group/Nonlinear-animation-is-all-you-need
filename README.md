# Nonlinear animation is all you need

GNOME animates its overview, workspaces and windows at a more or less constant
velocity. Things in the real world don't move that way: they speed up, then slow
down. Stripping out that acceleration and deceleration is what makes GNOME's
motion feel off. It moves like a sliding door, not like something with mass.

This extension puts the accel/decel back. It wraps the same ease methods
gnome-shell already uses for its own animations (`Clutter.Actor.prototype.ease`,
`ease_property`, `easeAsync`, and `St.Adjustment.prototype.ease`), so anything
GNOME animates through them picks up the curve and speed you choose. Because it
hooks the prototypes instead of each call site, it keeps working when GNOME
renames things internally.

## What you get

- **A curve gallery.** Curated presets (including real springs with damped
  oscillator physics), each drawn as a live preview card. Click one, it applies
  instantly.
- **A visual curve editor.** Create your own curve by dragging control points.
  Double-click adds a point, right-click removes one, endpoints stay pinned.
  Values above 1 give you overshoot; a replay button previews the motion.
- **Interruption continuity.** When an animation is interrupted — flipping two
  app-grid pages quickly, closing the overview mid-animation — the new one
  keeps the old one's momentum instead of restarting from standstill, using a
  spring seeded with the measured velocity. The same trick Apple's animation
  stack uses.
- **Curve sharing.** Curves import and export as small JSON files. Trade them
  like themes. The format is documented below.
- **Touchpad gestures stay native.** Gesture-driven motion already tracks your
  finger; only its wrap-up is stretched slightly so the deceleration reads.
- **Translations.** English and Simplified Chinese ship in the box; others via
  one `.po` file (see below).

## Performance

The whole thing is math, not magic. Preset curves swap a single enum before the
native Clutter call — zero added per-frame work. Custom curves (splines and
springs) run one small callback per frame per animation: the spring is a
closed-form analytic solution (one `exp` plus a couple of trig calls, with
coefficients precomputed when the animation starts), the spline is a binary
search plus a handful of multiply/adds. Nothing is allocated on the frame path.

`Ultra` spring fidelity switches to per-frame physics integration (semi-implicit
Euler) — noticeably more CPU in exchange for a slightly more organic response.
Most people will never need it; it exists because the analytic solution and the
integrator disagree a hair on the sharpest transients.

## Settings

All settings are live: change one and the next animation already uses it, no
relogin. You do need to log out and back in once after installing (or after
editing `extension.js`), so the shell reloads the module.

- **Animation curve** — the gallery. Pick, create, import, export.
- **Animation speed** — duration multiplier. 1.0 = GNOME default, 1.8 ≈ macOS,
  higher is more luxurious.
- **Interruption continuity** — on by default. Interrupted animations carry
  their velocity.
- **Spring fidelity** — `Efficient` (analytic, default) or `Ultra`
  (frame integration).
- **Behavior** — master switch, and easing the magic-lamp minimize effect when
  compiz-alike-magic-lamp-effect is installed.
- **Advanced** — threshold below which short animations are left alone, and the
  touchpad-gesture exception window.

Power users can also drive everything via `gsettings`:

```sh
gsettings --schemadir schemas set org.gnome.shell.extensions.nonlinear-animation \
    selected-curve 'preset:spring-snappy'
```

## Curve file format

A `.nla-curve.json` file is a single curve or a bundle:

```json
{
  "format": "nonlinear-animation/curve",
  "v": 1,
  "curves": [
    { "name": "Snappy", "kind": "spline",
      "points": [[0, 0], [0.25, 0.75], [0.45, 1.04], [1, 1]] },
    { "name": "Old spring", "kind": "spring", "damping": 0.62, "omega": 8.5 },
    { "name": "CSS classic", "kind": "bezier", "p": [0.4, 0, 0.2, 1] }
  ]
}
```

Rules: spline points are `[x, y]` pairs, x strictly increasing in `[0, 1]`,
first point at x = 0 and last at x = 1; y may exceed `[0, 1]` (overshoot) up to
`[-0.5, 1.5]`, at most 24 points. Bezier curves (CSS-style `p1x, p1y, p2x,
p2y`) are converted to splines on import. Springs take `damping` (0.2–1.0) and
`omega` (1–40).

## Install

From extensions.gnome.org (recommended):
<https://extensions.gnome.org/extension/10649/nonlinear-animation-is-all-you-need/>

Manually, for development:

```sh
git clone https://github.com/NB-Group/Nonlinear-animation-is-all-you-need
ln -s "$PWD/Nonlinear-animation-is-all-you-need" \
    ~/.local/share/gnome-shell/extensions/nonlinear-animation@nbgroup
glib-compile-schemas ~/.local/share/gnome-shell/extensions/nonlinear-animation@nbgroup/schemas/
```

Then log out and back in (Wayland reloads extensions only at login).

## Compatibility

GNOME Shell 50. The wrapped API is stable across 46–50 in practice; only 50 is
declared until the newer code paths are tested on older shells.

## Known limits

- All hooking happens in JS: animations driven directly by mutter's C code
  (some workspace-transition internals) are untouched. WorkspaceAnimation's
  MonitorGroup is deliberately left alone — changing it flickered secondary
  monitors on fractional-scale setups.
- The first login after install has an 8-second grace period where nothing is
  eased, so the boot sequence stays predictable on multi-monitor setups.
- Custom curves don't apply to animations GNOME plays with `repeatCount` or
  `delay` (rare in shell chrome); those fall back to native curves.

## Translations

To add a language: copy `po/zh_CN.po` to `po/<lang>.po`, translate the strings,
add `<lang>` to `po/LINGUAS`, and open a PR. The build compiles `.po` files into
the zip automatically.

## Optional: easing the magic-lamp minimize effect

If you use [compiz-alike-magic-lamp-effect], this extension can curve its
minimize/unminimize timeline (EASE_OUT_CUBIC, 700 ms) so the window glides
into the dock instead of stopping dead. It's a no-op when magic-lamp isn't
installed. Turn it off in Preferences → Behavior if you prefer the raw effect.

[compiz-alike-magic-lamp-effect]: https://extensions.gnome.org/extension/3749/compiz-alike-magic-lamp-effect/

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
