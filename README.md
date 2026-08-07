# Nonlinear animation is all you need

*Nonlinear animation is all you need.* — GNOME ships quick, mostly-linear-feeling
window/workspace/overview transitions; this extension wraps the prototype ease
methods gnome-shell itself adds (`Clutter.Actor.prototype.ease`, `ease_property`,
`easeAsync`, `St.Adjustment.prototype.ease`) and recurves **every** animation
routed through them, so the desktop feels closer to macOS — without forcing
bounce on anyone. It does not patch individual UI calls, so it survives GNOME
version bumps.

GNOME ships quick, mostly-linear-feeling transitions. This extension wraps the
prototype ease methods gnome-shell itself adds (`Clutter.Actor.prototype.ease`,
`ease_property`, `easeAsync`, `St.Adjustment.prototype.ease`), so **every**
animation routed through them gets the curve and speed you pick. It does not
patch individual UI calls, so it survives GNOME version bumps.

## Settings (all live — no relogin to tune)

Open the extension's preferences (Extensions app / Refine → Spring Easing → ⚙️):

- **Easing curve**
  - *Two-sided (In-Out): accelerate in + decelerate out — recommended.*
    `In-Out Cubic` (default, balanced), `Quart`, `Quint`, `Expo` (most dramatic).
  - *One-sided (Out): only decelerate at the end.*
    `Out Cubic`, `Quart`, `Quint`, `Expo`.
  - *With overshoot/bounce:* `Out Back` (single overshoot), `Out Elastic` (springy).
- **Duration scale** — multiplies animation length. `1.0` = GNOME default;
  `1.8` ≈ macOS; `2.5` = slow/luxurious.
- **Threshold (ms)** — only animations at or above this duration are eased, so
  short hovers stay snappy. Default 100ms.
- **Touchpad gesture grace (ms)** — gesture-driven opens (3-finger swipe /
  pinch) already track your finger, so their wrap-up is left at GNOME's native
  speed for this many milliseconds after a gesture. Discrete triggers (Super
  key, clicks) are still eased. Set `0` to ease everything.
- **Enabled** — master switch for quick A/B comparison.

**Everything applies instantly** — drag a control and the next animation
reflects it. The extension reads GSettings on every ease call, which is a cached
lookup, not IPC.

Command-line equivalent:
```bash
S=~/.local/share/gnome-shell/extensions/spring-ease@nbgroup/schemas
GSETTINGS_SCHEMA_DIR=$S gsettings set org.gnome.shell.extensions.spring-ease mode 'ease-in-out-expo'
GSETTINGS_SCHEMA_DIR=$S gsettings set org.gnome.shell.extensions.spring-ease duration-scale 1.8
GSETTINGS_SCHEMA_DIR=$S gsettings set org.gnome.shell.extensions.spring-ease gesture-grace-ms 800
```

## Install

Copy into `~/.local/share/gnome-shell/extensions/`, compile the schema, enable:
```sh
glib-compile-schemas spring-ease@nbgroup/schemas/
```

GJS modules load once at shell startup, so the **first enable** (or any edit to
`extension.js`) needs a shell restart — on Wayland, log out and back in. After
that, tuning settings never requires a relogin.

## Compatibility

GNOME Shell 50. The wrapped API (Clutter ease prototypes, stage captured-event,
`Clutter.AnimationMode`) is stable across GNOME 46–50.

## Known limits

- Only JS-layer animations are affected; a few compositor-internal (mutter C)
  transitions are not. Overview, workspace and window animations are all
  JS-layer and covered.
- Per-ease overhead is a few cached GSettings reads — negligible.

## License

GPL-3.0-or-later
