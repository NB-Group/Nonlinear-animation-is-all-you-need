# Release checklist

The extension has real users; nothing ships on vibes. Every step below
is cheap compared with one user's frozen shell.

## Before uploading to extensions.gnome.org

The upload itself is ALWAYS manual (the maintainer clicks it). Before
that click, all five gates must pass:

1. CI green, including on the release tag (`gh run list`, the Release
   workflow builds and attaches the zip; it never touches EGO).
2. The review baseline in `scripts/code-review-baseline.txt` covers the
   current HEAD. If commits exist past the last reviewed line, run a
   全量代码审查 round first (fresh-context agent, whole files, contract
   checklist, verified findings only).
3. Zip reconciliation: every file in `nonlinear-animation@nbgroup.zip`
   byte-matches the working tree, and `unzip -l` shows only whitelisted
   files (no scripts/, no hidden files, no gschemas.compiled).
4. Live-shell smoke: `./build.sh --install`, then a nested devkit shell
   passes `scripts/_nest_validate.js` (extension ACTIVE at the expected
   version, paints flowing, one workspace switch through switchData,
   shell alive after). Launch rules and traps: see the nested-shell
   notes in the project memory.
5. Version coherence: `metadata.json` version, the EGO upload form, and
   the planned tag all agree.

## After EGO approves

- Tag `vN.0` at the commit whose build was uploaded (N = the EGO
  version). The Release workflow attaches the zip automatically. Never
  move or reuse a published tag.
- Close the GitHub issues the version fixes, with a line that names the
  version and the action to take (update, plus anything the user must
  re-pick).
- Record the release in `scripts/code-review-baseline.txt` and memory.

## Incident protocol (a user reports breakage)

1. Reproduce on evidence first: `journalctl --user` around the report
   time, grepping `nla-debug` (our deduped diagnostics) and GLib
   invalid-value warnings. Waywallen stack spam is chronic noise on the
   maintainer's machine; filter it out.
2. Fix with a behavioral test assertion alongside (planSmoke or
   easingTest), not a bare patch.
3. Ship as a small patch version; keep upload diffs small, review
   queues are slow and small diffs review fast.
4. Never let the extension crash the shell: GNOME auto-blacklists the
   extension in disabled-extensions after a crash and the user sees "no
   animations at all" until the next login.

## Standing rules

- Nested-shell runs: any extension moved out of ~/.local for the run is
  restored in the SAME session; a reboot in between means the user's
  extension is gone.
- No force-pushing published tags; no automated EGO submission; EGO
  credentials do not live in CI secrets.
- Presets added to the gallery must be numerically distinct at thumbnail
  resolution (sample with compileCurve first; in-out-quint was identical
  to in-out-expo and got cut).
