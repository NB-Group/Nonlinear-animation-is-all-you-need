#!/bin/bash
# Interleaved A/B: BMS pipeline_default vs pipeline_performance.
# Metrics: perf cycles + CPU-time, normalized per paint.
B=~/.local/share/gnome-shell/extensions/blur-my-shell@aunetx
export GSETTINGS_SCHEMA_DIR=$B/schemas
cd /mnt/Code/Nonlinear-animation-is-all-you-need
S=$(pgrep -x gnome-shell | head -1)
SCHEMA=org.gnome.shell.extensions.blur-my-shell.panel
WIN=${1:-20}
ROUNDS=${2:-2}

# persistent paint counter in the shell
cat > scripts/_paints.js <<'JS'
globalThis.RESULT = 'pending';
(() => {
    if (!globalThis.__paintHooked) {
        globalThis.__paintHooked = true;
        globalThis.__paints = 0;
        global.stage.connect('after-paint', () => {
            globalThis.__paints++;
        });
    }
    globalThis.RESULT = 'hooked';
})()
JS
cat > scripts/_readpaints.js <<'JS'
globalThis.RESULT = 'pending';
(() => {
    globalThis.RESULT = String(globalThis.__paints || 0);
})()
JS
python3 scripts/shell-eval.py scripts/_paints.js 1 >/dev/null 2>&1

reads() {
    python3 scripts/shell-eval.py scripts/_readpaints.js 1 2>/dev/null | tail -1 | tr -d '"'
}
arm() {
    gsettings set $SCHEMA pipeline "$1" 2>/dev/null
    sleep 3
    local P1=$(reads)
    local C1=$(awk '{print $14+$15}' /proc/$S/stat)
    perf stat -p "$S" -e task-clock,cycles,instructions -- sleep "$WIN" \
        2>scripts/_perf.$1.$3.txt
    local P2=$(reads)
    local C2=$(awk '{print $14+$15}' /proc/$S/stat)
    local PAINTS=$((P2 - P1))
    local CT=$((C2 - C1))
    local CYC=$(grep -oP 'cycles,\s+\K[0-9,]+' scripts/_perf.$1.$3.txt |
        head -1 | tr -d ,)
    [ -z "$CYC" ] && CYC=$(awk '/cycles/ {gsub(",", ''); print $1}' \
        scripts/_perf.$1.$3.txt | head -1)
    local CPP=$(( CYC / (PAINTS > 0 ? PAINTS : 1) ))
    local TPF=$(( CT * 10 / (PAINTS > 0 ? PAINTS : 1) ))
    echo "$1 r$3: paints=$PAINTS cpu/paint=${TFP}ms(x10) cycles/paint=${CPP}"
}

echo "benchmark $(date +%H:%M:%S) win=${WIN}s rounds=${ROUNDS} (pipelines switch live)"
for i in $(seq 1 "$ROUNDS"); do
    arm pipeline_default "$i" d
    arm pipeline_performance "$i" p
done
