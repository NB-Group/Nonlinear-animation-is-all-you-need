#!/bin/bash
# A/B for the adaptive blur refresh patch under CONTINUOUS damage.
# Arms alternate; the only variable is the adaptive-refresh toggle.
# Reports paint rate (fps) and shell CPU. A throttling change that dropped
# frames would show as fps collapsing in the adaptive arm.
cd "$(dirname "$0")/.."
B=~/.local/share/gnome-shell/extensions/blur-my-shell@aunetx
export GSETTINGS_SCHEMA_DIR=$B/schemas
S=$(pgrep -x gnome-shell | head -1)
DUR=${1:-20}

start_anim() { gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Eval "$(cat scripts/_bms_anim.js)" >/dev/null; }
stop_anim() { gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
    --method org.gnome.Shell.Eval "$(cat scripts/_bms_stop.js)" >/dev/null; }
arm() {
    gsettings set org.gnome.shell.extensions.blur-my-shell adaptive-refresh "$1"
    sleep 3
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval \
        "(function(){globalThis.__pc=0;if(!globalThis.__pch)globalThis.__pch=global.stage.connect('after-paint',()=>globalThis.__pc++);return 'ok';})()" >/dev/null
    local J1=$(awk '{print $14+$15}' /proc/$S/stat)
    sleep "$DUR"
    local J2=$(awk '{print $14+$15}' /proc/$S/stat)
    local P=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval "globalThis.__pc" | sed 's/.*, .\([0-9]*\).*/\1/')
    awk -v a="$1" -v p="$P" -v d="$DUR" -v c="$((J2-J1))" \
        'BEGIN{printf "adaptive=%-5s fps=%5.1f cpu=%5.1f%%\n", a, p/d, c/d}'
}

echo "continuous-damage A/B, ${DUR}s/arm $(date +%H:%M:%S)"
start_anim; sleep 2
for r in 1 2 3; do arm false; arm true; done
stop_anim
gsettings set org.gnome.shell.extensions.blur-my-shell adaptive-refresh true
echo done