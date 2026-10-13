# Blur my Shell — adaptive blur refresh patch (local, pending upstream PR)

BMS auto-updates wipe these edits (happened with v74). Re-apply with:

```sh
B=~/.local/share/gnome-shell/extensions/blur-my-shell@aunetx
cp upstream/paint_signals.js "$B"/conveniences/            # pristine, for reference
# If the installed tree is stock, apply the patch:
cd <clone of aunetx/blur-my-shell> && git apply 0001-adaptive-blur-refresh.patch
# For the installed tree directly, copy the patched files back out of git,
# then ALWAYS recompile the schema:
glib-compile-schemas "$B"/schemas/
```

Files touched (installed ← repo path):
- conveniences/paint_signals.js ← src/conveniences/paint_signals.js (adaptive interval + coverage freeze + off switch)
- conveniences/keys.js ← src/conveniences/keys.js (adaptive-refresh key)
- schemas/…gschema.xml ← schemas/…gschema.xml (boolean, default true)
- preferences/other.js ← src/preferences/other.js (bind)
- ui/other.ui ← resources/ui/other.ui (Performance group row)

`upstream/` holds pristine master copies fetched 2026-10-10 (verified: local v74
install == master except these edits). 2026-10-12: BMS auto-updated to v75 and
wiped the patch (third wipe); all five files were byte-identical in v75, patch
re-applied cleanly via the build-dir procedure below. Expect further wipes on
every EGO update — re-run it after each.

```sh
# re-apply after a BMS update (from this directory):
B=~/.local/share/gnome-shell/extensions/blur-my-shell@aunetx
rm -rf build && mkdir -p build/src/conveniences build/src/preferences \
    build/resources/ui build/schemas
cp $B/conveniences/paint_signals.js $B/conveniences/keys.js build/src/conveniences/
cp $B/preferences/other.js build/src/preferences/
cp $B/ui/other.ui build/resources/ui/
cp $B/schemas/org.gnome.shell.extensions.blur-my-shell.gschema.xml build/schemas/
cd build && patch -p1 --fuzz=0 < ../0001-adaptive-blur-refresh.patch \
    && cp src/conveniences/paint_signals.js src/conveniences/keys.js $B/conveniences/ \
    && cp src/preferences/other.js $B/preferences/ \
    && cp resources/ui/other.ui $B/ui/ \
    && cp schemas/*.xml $B/schemas/ \
    && glib-compile-schemas $B/schemas/
```
Then a relogin is required (module cache; disable/enable does NOT reload).

## V2.1 (2026-10-10): freeze redesign after the translucency incident

V2 froze surfaces hidden (`actor.visible = false`) whenever opaque-looking
windows covered them. VS Code / terminals have translucent pixels but
window-actor opacity 255, and no public API separates the two, so the
backdrop behind them was frozen AND hidden — blur vanished. V2.1:

- never touches actor visibility (a false freeze shows a stale blurred
  frame, never a missing blur)
- freezes only under ≥98% coverage by FULLSCREEN windows (they fill their
  monitor; translucent windows are almost never fullscreen, so their
  backdrops keep refreshing)
- skips hidden window actors (overview shows clones, real actors hidden)
- the thaw poll also unfreezes when adaptive-refresh is switched off

## Measurement ledger (shell CPU, instantaneous via /proc deltas, this machine)

- no plugins: ~9%
- wallpaper engine alone: 19%
- BMS stock (per-paint forcing), all dynamic + animated wallpaper: 52%
- adaptive interval (V1), same scenario: 28%
- adaptive, static wallpaper: 11–12%
- fullscreen windows stacked (V1, surfaces still refreshing): 44% → V2 freeze targets this
