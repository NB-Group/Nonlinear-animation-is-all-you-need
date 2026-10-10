#!/bin/bash
# Controlled A/B inside the NESTED devkit shell: BMS adaptive refresh
# (V2.1: area-scaled interval + fullscreen-coverage freeze) vs stock
# per-paint forcing. Single variable = the adaptive toggle, flipped per
# shell via the _nest_adaptive.js proxy (shared dconf stays false, the
# host session is never affected). Interleaved arms, /proc CPU deltas.
cd "$(dirname "$0")"
NB=$(cat /tmp/nla/nested-bus)
export DBUS_SESSION_BUS_ADDRESS=$NB
S=$(cat /tmp/nla/nested-pid)
WIN=${1:-15}
ROUNDS=${2:-2}

patch() {  # on|off|clear
    gdbus call --session --dest org.gnome.Shell --object-path \
        /org/gnome/Shell --method org.gnome.Shell.Eval \
        "globalThis.__ARG='$1'; $(cat _nest_adaptive.js)" >/dev/null
}
cpu_jiffies() { awk '{print $14+$15}' /proc/$S/stat; }

echo "nested A/B: shell=$S win=${WIN}s rounds=$ROUNDS $(date +%H:%M:%S)"
echo "arm round cpu% jiffies"
for i in $(seq 1 "$ROUNDS"); do
    for arm in off on; do
        patch $arm
        sleep 4                      # freeze/thaw settle
        J1=$(cpu_jiffies)
        sleep "$WIN"
        J2=$(cpu_jiffies)
        PCT=$(awk "BEGIN{printf \"%.1f\", ($J2-$J1)/$WIN}")
        echo "$arm r$i ${PCT} $((J2-J1))"
    done
done
patch clear
echo "done (adaptive restored to dconf value)"