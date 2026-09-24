// Frame-interval monitor for 20s: classifies stalls (single long pause =
// main thread blocked by JS/GC; sustained long frames = GPU-bound).
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
if (globalThis.JANK?.stop)
    globalThis.JANK.stop();
const J = globalThis.JANK = {times: [], t0: 0};
const tl = new Clutter.Timeline({duration: 20000});
J.timeline = tl;
tl.connect('new-frame', (t, ms) => {
    if (!J.t0) { J.t0 = ms; return; }
    J.times.push(ms - J.t0);
    J.t0 = ms;
});
tl.connect('stopped', () => {
    const ts = J.times.slice(1);
    ts.sort((a, b) => a - b);
    const n = ts.length;
    const q = p => ts[Math.min(n - 1, Math.floor(p * n))];
    const mon = global.display.get_monitor(0);
    const hz = mon?.get_mode?.()?.get_refresh_rate?.() ?? 60;
    const expected = 1000 / hz;
    const big = ts.filter(d => d > 500).length;
    const med = ts.filter(d => d > expected * 1.6 && d <= 500).length;
    globalThis.RESULT = JSON.stringify({
        samples: n, hz: Math.round(hz),
        mean: +(ts.reduce((a, b) => a + b, 0) / n).toFixed(1),
        p50: q(0.5), p95: q(0.95), p99: q(0.99), max: ts[n - 1],
        stallsOver500ms: big, slowFrames: med,
    });
});
J.stop = () => tl.stop();
tl.start();
'monitoring-20s-go-open-notification-center'
