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

By default it uses a symmetric curve that eases in and out, closer to how macOS
feels. Bounce and overshoot are available but off by default.

## Settings

All settings are live: change one and the next animation already uses it, no
relogin. You do need to log out and back in once after installing (or after
editing `extension.js`), so the shell reloads the module.

Open the extension's preferences to configure:

**Easing curve.** Symmetric `In-Out` curves accelerate at the start and
decelerate at the end, and are recommended; `In-Out Cubic` is the default. `Out`
curves only decelerate. `Out Back` adds a single overshoot, `Out Elastic` is a
bouncy spring.

**Duration scale.** Multiplies how long the eased animations take. 1.0 is
GNOME's speed, 1.8 is roughly macOS, 2.5 is deliberately slow.

**Threshold (ms).** Animations shorter than this are left alone, so quick hovers
stay snappy. Default 100.

**Touchpad gesture grace (ms).** A 3-finger swipe or pinch already follows your
finger, so for this many milliseconds after the gesture GNOME's native wrap-up
is used instead of your curve. Discrete triggers like the Super key still get
eased. Set to 0 to ease everything.

**Gesture duration scale.** For gesture-driven commits (workspace switch,
app-grid paging) the curve stays at GNOME's velocity-matched ease-out so
releasing your finger doesn't jolt; this only stretches the duration a little so
the deceleration reads. 1.0 is fully native.

**Enabled.** Master switch, for A/B comparison.

Equivalent via command line (point the schema dir at where it's installed):
```bash
S=~/.local/share/gnome-shell/extensions/nonlinear-animation@nbgroup/schemas
GSETTINGS_SCHEMA_DIR=$S gsettings set org.gnome.shell.extensions.nonlinear-animation mode 'ease-in-out-expo'
GSETTINGS_SCHEMA_DIR=$S gsettings set org.gnome.shell.extensions.nonlinear-animation duration-scale 1.8
GSETTINGS_SCHEMA_DIR=$S gsettings set org.gnome.shell.extensions.nonlinear-animation gesture-grace-ms 800
```

## Install

Drop the folder into `~/.local/share/gnome-shell/extensions/` and compile the
schema:
```sh
glib-compile-schemas nonlinear-animation@nbgroup/schemas/
```
Then log out and back in (Wayland can't restart the shell in place), and enable
it.

## Compatibility

GNOME Shell 50. The API it wraps (the Clutter ease prototypes, stage
captured-event, `Clutter.AnimationMode`) is stable from GNOME 46 through 50.

## Known limits

Only JS-layer animations are affected. A few compositor-internal transitions in
mutter (C code) are not, but the overview, workspace and window animations
people actually notice are all JS-layer and covered.

Per-ease overhead is a couple of cached GSettings reads, effectively nothing.

## License

AGPL-3.0-or-later.
