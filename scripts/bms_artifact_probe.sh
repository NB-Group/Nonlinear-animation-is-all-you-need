#!/bin/bash
# Artifact/regression probe for the adaptive blur refresh patch.
# Runs the same deterministic damage scenario under both arms (adaptive off
# = stock every-3rd-paint, adaptive on = area-scaled interval + coverage
# freeze) and records: shell CPU, stage paint rate, and BMS error output.
# A lost frame would show as a paint-rate drop and a journal error burst.
cd "$(dirname "$0")"
B=~/.local/share/gnome-shell/extensions/blur-my-shell@aunetx
export GSETTINGS_SCHEMA_DIR=$B/schemas
S=$(pgrep -f 'gnome-shell --mode=user' | head -1)
DUR=${1:-30}

paints() {
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval \
        "(function(){let n=0;const h=global.stage.connect('after-paint',()=>n++);imports.gi.GLib.timeout_add(0,$1,()=>{global.stage.disconnect(h);globalThis.RESULT='p:'+n;return false;});return 'armed';})()" >/dev/null
}
read_p() { gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval "globalThis.RESULT" | sed 's/.*p:\([0-9]*\).*/\1/'; }

arm() {
    gsettings set org.gnome.shell.extensions.blur-my-shell adaptive-refresh "$1"
    sleep 4
    local before=$(journalctl --user --since "-1min" --no-pager 2>/dev/null | grep -c "Blur my Shell.*ERROR")
    local J1=$(awk '{print $14+$15}' /proc/$S/stat)
    paints $((DUR * 1000))
    sleep $((DUR + 2))
    local P=$(read_p)
    local J2=$(awk '{print $14+$15}' /proc/$S/stat)
    local after=$(journalctl --user --since "-1min" --no-pager 2>/dev/null | grep -c "Blur my Shell.*ERROR")
    awk -v a="$1" -v p="$P" -v d="$DUR" -v c="$((J2-J1))" -v e="$((after-before))" \
        'BEGIN{printf "%-4s paints=%-5s fps=%.1f cpu=%.1f%% bms_errors=%d\n", a, p, p/d, c/d, e}'
}

echo "adaptive-refresh artifact probe, ${DUR}s per arm, $(date +%H:%M:%S)"
echo "load:"; ps -eo pcpu,comm --sort=-pcpu | sed -n 2,5p
for r in 1 2; do arm false; arm true; done
gsettings set org.gnome.shell.extensions.blur-my-shell adaptive-refresh true
echo "done; adaptive left ON"