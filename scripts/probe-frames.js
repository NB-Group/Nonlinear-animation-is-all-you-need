(async () => {
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');

// a tiny painted actor on stage: a transition on it keeps the frame clock
// alive so new-frame ticks measure real frame output
const probe = new St.Widget({style: 'background:#ffffff; opacity:255;',
    x: 0, y: 0, width: 2, height: 2});
Main.layoutManager.addChrome(probe);
// drive the frame clock with a real actor transition (imperceptible)
probe.opacity = 255;
probe.ease({opacity: 253, duration: 20000, repeatCount: 2});
const tl = probe.get_transition('opacity');
const frames = [];
let t0 = 0;
tl.connect('new-frame', (t, ms) => {
    if (!t0) { t0 = ms; return; }
    frames.push(ms - t0);
    t0 = ms;
});

// main loop stalls in parallel
const deltas = [];
let last = Date.now();
GLib.timeout_add(GLib.PRIORITY_HIGH, 5, () => {
    const now = Date.now();
    deltas.push(now - last);
    last = now;
    return GLib.SOURCE_CONTINUE;
});

const qs = Main.panel.statusArea.quickSettings;
const wait = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
for (let i = 0; i < 3; i++) {
    qs.menu.open();
    await wait(1600);
    qs.menu.close();
    await wait(900);
}

const f = frames.slice(1);
f.sort((a, b) => a - b);
const d = deltas.filter(x => x < 10000).sort((a, b) => a - b);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
Main.layoutManager.removeChrome(probe);
globalThis.RESULT = JSON.stringify({
    frames: {
        n: f.length, p50: q(f, 0.5), p95: q(f, 0.95), p99: q(f, 0.99),
        max: f[f.length - 1], over100ms: f.filter(x => x > 100).length,
    },
    mainLoop: {
        n: d.length, p50: q(d, 0.5), p99: q(d, 0.99), max: d[d.length - 1],
        over500ms: d.filter(x => x > 500).length,
    },
});
})()
