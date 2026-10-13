#!/bin/bash
# Host-grade A/B for BMS adaptive refresh (V2.1): the ONLY variable is the
# adaptive-refresh gsettings toggle, flipped live (the module reads it per
# paint). Arms interleaved ABBA to cancel drift. Same deterministic window
# trio (scripts/_gtkwin.js: translucent + opaque + fullscreen, all with
# spinners for continuous damage) in every arm. Run AFTER a relogin with
# BMS enabled (V2.1 module loaded); ambient apps should match between arms
# (ideally pause Word/games during the run for lower variance).
cd "$(dirname "$0")"
B=~/.local/share/gnome-shell/extensions/blur-my-shell@aunetx
export GSETTINGS_SCHEMA_DIR=$B/schemas
SCHEMA=org.gnome.shell.extensions.blur-my-shell
S=$(pgrep -f 'gnome-shell --mode=user' | head -1)
WIN=${1:-15}
ROUNDS=${2:-2}

echo "host A/B: shell=$S win=${WIN}s rounds=$ROUNDS $(date '+%F %H:%M:%S')"
echo "ambient:"; ps -eo pcpu,comm --sort=-pcpu | sed -n 2,6p
echo

set_trio() {  # spawn|kill the deterministic window trio
    if [ "$1" = spawn ]; then
        WAYLAND_DISPLAY=wayland-0 GDK_BACKEND=wayland \
            gjs -m _gtkwin.js org.nla.T1 55 0 "TRANSLUCENT-55" >/dev/null 2>&1 &
        sleep 2
        WAYLAND_DISPLAY=wayland-0 GDK_BACKEND=wayland \
            gjs -m _gtkwin.js org.nla.O1 100 0 "OPAQUE" >/dev/null 2>&1 &
        sleep 2
        WAYLAND_DISPLAY=wayland-0 GDK_BACKEND=wayland \
            gjs -m _gtkwin.js org.nla.F1 100 1 "FULLSCREEN" >/dev/null 2>&1 &
        sleep 5
    else
        for p in $(pgrep gjs); do
            tr '\0' ' ' < /proc/$p/cmdline | grep -q _gtkwin && kill $p
        done
        sleep 3
    fi
}
arm() {  # on|off
    gsettings set $SCHEMA adaptive-refresh "$1"
    sleep 4                                  # freeze/thaw settle
    local J1=$(awk '{print $14+$15}' /proc/$S/stat)
    sleep "$WIN"
    local J2=$(awk '{print $14+$15}' /proc/$S/stat)
    awk "BEGIN{printf \"$1\t%.1f%%\", ($J2-$J1)/$WIN}"
    echo
}

echo "scenario A: desktop-only (no test windows)"
for i in $(seq 1 "$ROUNDS"); do arm off; arm on; done

echo "scenario B: fullscreen-cover trio"
set_trio spawn
for i in $(seq 1 "$ROUNDS"); do arm off; arm on; done
set_trio kill

gsettings set $SCHEMA adaptive-refresh true
echo "done $(date '+%H:%M:%S') — adaptive left ON"