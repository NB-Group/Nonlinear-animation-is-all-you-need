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
install == master except these edits).

Requires relogin to load (GJS caches extension modules per session; BMS
disable/enable does NOT reload them).

## Measurement ledger (shell CPU, instantaneous via /proc deltas, this machine)

- no plugins: ~9%
- wallpaper engine alone: 19%
- BMS stock (per-paint forcing), all dynamic + animated wallpaper: 52%
- adaptive interval (V1), same scenario: 28%
- adaptive, static wallpaper: 11–12%
- fullscreen windows stacked (V1, surfaces still refreshing): 44% → V2 freeze targets this
