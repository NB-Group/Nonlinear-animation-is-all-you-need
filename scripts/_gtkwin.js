#!/usr/bin/env gjs -m
// Test window for BMS applications-blur verification in the nested shell.
// Usage: gjs -m _gtkwin.js <appId> <alpha 0-100> <fullscreen 0|1> [label]
// Pixel-translucent like VS Code/terminals with background opacity: the
// buffer carries alpha while the window actor's opacity stays 255.
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import System from 'system';

const [appId, alphaArg, fsArg, label] = [ARGV[0] ?? 'org.nla.Testwin',
    ARGV[1] ?? '55', ARGV[2] ?? '0', ARGV[3] ?? 'TEST'];

const app = new Gtk.Application({application_id: appId, flags: 0});

app.connect('activate', () => {
    const win = new Gtk.ApplicationWindow({application: app,
        title: label, default_width: 640, default_height: 480});
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL,
        spacing: 12, margin_top: 40, margin_bottom: 40,
        margin_start: 40, margin_end: 40});
    box.append(new Gtk.Label({label,
        css_classes: ['title-1']}));
    box.append(new Gtk.Label({label: `alpha=${alphaArg}% fs=${fsArg}`,
        css_classes: ['dim-label']}));
    const btn = new Gtk.Button({label: 'ping'});
    btn.connect('clicked', () => btn.label = 'pong');
    box.append(btn);
    // Continuous animation: forces real repaints every frame, so blur
    // refresh cost is actually exercised (a static window would make both
    // the stock and adaptive paths free and the A/B meaningless).
    const sp = new Gtk.Spinner({spinning: true, halign: Gtk.Align.CENTER,
        height_request: 48, width_request: 48});
    box.append(sp);
    win.set_child(box);
    win.set_opacity(parseInt(alphaArg, 10) / 100);
    if (fsArg === '1')
        win.fullscreen();
    win.present();
});

app.run([]);
