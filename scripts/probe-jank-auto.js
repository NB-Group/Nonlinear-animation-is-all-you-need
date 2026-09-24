(async () => {
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');

// frame monitor for 18s
const times = [];
let t0 = 0;
const tl = new Clutter.Timeline({duration: 18000});
tl.connect('new-frame', (t, ms) => {
    if (!t0) { t0 = ms; return; }
    times.push(ms - t0);
    t0 = ms;
});
tl.start();

// hammer the quick settings menu (notification list): open, dwell, close, repeat
const qs = Main.panel.statusArea.quickSettings;
for (let i = 0; i < 4; i++) {
    qs.menu.open();
    await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
        r();
        return GLib.SOURCE_REMOVE;
    }));
    qs.menu.close();
    await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 900, () => {
        r();
        return GLib.SOURCE_REMOVE;
    }));
}

await new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
const ts = times.slice(1);
ts.sort((a, b) => a - b);
const n = ts.length;
const q = p => ts[Math.min(n - 1, Math.floor(p * n))];
let hz = 60;
try {
    const mon = global.display.get_monitor(0);
    hz = mon?.get_mode?.()?.get_refresh_rate?.() ?? 60;
} catch {
    hz = 60;
}
const expected = 1000 / hz;
globalThis.RESULT = JSON.stringify({
    samples: n, hz: Math.round(hz),
    mean: +(ts.reduce((a, b) => a + b, 0) / n).toFixed(1),
    p50: q(0.5), p95: q(0.95), p99: q(0.99), max: ts[n - 1],
    stallsOver500ms: ts.filter(d => d > 500).length,
    stalls200to500: ts.filter(d => d > 200 && d <= 500).length,
    slowFrames: ts.filter(d => d > expected * 1.6 && d <= 200).length,
    worst10: ts.slice(-10).reverse(),
});
})()
