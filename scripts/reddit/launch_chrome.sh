#!/bin/bash
# Launch the CDP Chrome used by the reddit scripts (port 9224).
# Profile lives in ~/.cache/reddit-cdp (survives /tmp wipes; the login
# cookie itself only survives until the next Chrome profile reset, so
# one manual login after a wipe is expected).
set -u
PROFILE="${REDDIT_CDP_PROFILE:-$HOME/.cache/reddit-cdp}"
PORT="${REDDIT_CDP_PORT:-9224}"
if curl -s --max-time 3 "http://127.0.0.1:$PORT/json/version" >/dev/null; then
    echo "cdp already up on :$PORT"; exit 0
fi
mkdir -p "$PROFILE"
DISPLAY="${DISPLAY:-:0}" setsid /usr/bin/google-chrome-stable \
    --user-data-dir="$PROFILE" \
    --remote-debugging-port="$PORT" \
    --no-first-run --window-position=3000,3000 \
    --proxy-server=http://127.0.0.1:7890 \
    about:blank >/tmp/reddit-cdp.log 2>&1 &
sleep 10
curl -s --max-time 5 "http://127.0.0.1:$PORT/json/version" | head -c 40
echo
