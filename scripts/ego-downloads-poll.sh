#!/bin/bash
# Poll the extensions.gnome.org download counter for our extension and
# append a row to data/downloads.csv. Run by ego-downloads.timer every
# 5 minutes (Persistent, so reboots catch up with one row, not gaps).
set -u
REPO=/mnt/Code/Nonlinear-animation-is-all-you-need
OUT="$REPO/data/downloads.csv"
UUID='nonlinear-animation@nbgroup'
API="https://extensions.gnome.org/extension-info/?uuid=$UUID"

mkdir -p "$REPO/data"
[ -f "$OUT" ] || echo 'timestamp,downloads,version,stars' >> "$OUT"

# EGO is reachable directly from this machine; the proxy is the fallback.
json=$(curl -s --max-time 20 "$API") ||
json=$(curl -s --max-time 20 -x http://127.0.0.1:7890 "$API")
[ -z "$json" ] && exit 0  # network hiccup: skip, next tick retries

python3 - "$json" "$OUT" << 'EOF'
import csv, json, sys
try:
    d = json.loads(sys.argv[1])
except json.JSONDecodeError:
    sys.exit(0)
row = [
    __import__('datetime').datetime.now().isoformat(timespec='seconds'),
    d.get('downloads', ''),
    max((v.get('version', 0) for v in
        (d.get('shell_version_map') or {}).values()), default=''),
]
with open(sys.argv[2], 'a') as f:
    f.write(','.join(map(str, row)) + '\n')
EOF
