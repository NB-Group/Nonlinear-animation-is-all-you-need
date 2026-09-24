#!/usr/bin/env python3
# Dev helper: run a JS file inside gnome-shell via org.gnome.Shell.Eval.
# Requires unsafe mode (the local unsafe-mode-auto@nbgroup extension keeps it on).
# Usage: scripts/shell-eval.py <file.js> [poll-result]
import dbus, sys, time

bus = dbus.SessionBus()
shell = bus.get_object('org.gnome.Shell', '/org/gnome/Shell')
ev = dbus.Interface(shell, 'org.gnome.Shell')
js = open(sys.argv[1]).read()
ok, res = ev.Eval(js)
print(f"ok={ok}")
print(res if res else '(empty)')
if len(sys.argv) > 2:
    time.sleep(float(sys.argv[2]))
    print(ev.Eval('globalThis.RESULT')[1])
