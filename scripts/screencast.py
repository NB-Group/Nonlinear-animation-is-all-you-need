#!/usr/bin/env python3
"""Compositor-level screencast via org.gnome.Shell.Screencast.

The D-Bus screencast API needs a persistent sender: a one-shot gdbus call
dies with 'Sender has vanished' and produces an empty file, so keep a main
loop until SIGINT/SIGTERM, then stop the recording.

Usage: screencast.py OUTPUT.webm [framerate]
"""

import signal
import sys

import gi
gi.require_version('Gio', '2.0')
gi.require_version('GLib', '2.0')
from gi.repository import Gio, GLib

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/screencast.webm'
framerate = int(sys.argv[2]) if len(sys.argv) > 2 else 60

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
proxy = Gio.DBusProxy.new_sync(bus, Gio.DBusProxyFlags.NONE, None,
                               'org.gnome.Shell', '/org/gnome/Shell/Screencast',
                               'org.gnome.Shell.Screencast', None)

options = GLib.Variant('a{sv}', {
    'framerate': GLib.Variant('i', framerate),
    'draw-cursor': GLib.Variant('b', False),
})
params = GLib.Variant.new_tuple(GLib.Variant.new_string(out), options)
res = proxy.call_sync('Screencast', params,
                      Gio.DBusCallFlags.NONE, -1, None)
ok, path = res.unpack()[:2] if len(res.unpack()) >= 2 else (res.unpack()[0], '?')
print(f'started ok={ok} -> {path}', flush=True)
if not ok:
    sys.exit(1)

loop = GLib.MainLoop()


def stop(*_):
    proxy.call_sync('StopScreencast', None, Gio.DBusCallFlags.NONE, -1, None)
    print('stopped', flush=True)
    loop.quit()


signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)
loop.run()
