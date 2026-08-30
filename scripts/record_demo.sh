#!/usr/bin/env bash
# record_demo.sh — capture one demo take of the overview/workspace motion.
#
# Usage: record_demo.sh native|nonlinear [outfile]
#
# The extension's `enabled` key is read on every animation, so toggling it
# via gsettings applies instantly, no relogin. gpu-screen-recorder does
# compositor-level capture at 60 fps.
#
# While the red indicator is recording: press Super 3-4 times (overview
# open/close), switch workspaces a couple times, then back to this terminal
# and Ctrl+C.

set -euo pipefail

KIND="${1:?usage: record_demo.sh native|nonlinear [outfile]}"
SCHEMA=org.gnome.shell.extensions.nonlinear-animation
OUT="${2:-/tmp/demo_${KIND}.mkv}"

case "$KIND" in
    native)     gsettings set "$SCHEMA" enabled false ;;
    nonlinear)  gsettings set "$SCHEMA" enabled true ;;
    *) echo "bad kind: $KIND" >&2; exit 1 ;;
esac

echo "== extension ${KIND} (enabled=$(gsettings get "$SCHEMA" enabled)) =="
echo "== recording to $OUT — do 3-4 overview open/close + workspace switches,"
echo "==   then Ctrl+C here =="
gpu-screen-recorder -w screen -f 60 -q very_high -o "$OUT"
echo "== saved $OUT =="
