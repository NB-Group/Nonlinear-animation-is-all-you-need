(async () => {
const GLib = imports.gi.GLib;
const Main = await import('resource:///org/gnome/shell/ui/main.js');

// main-loop stall detector: 5ms self-rescheduling timeout, record jitter
const deltas = [];
let last = Date.now();
const tick = () => {
    const now = Date.now();
    deltas.push(now - last);
    last = now;
    return GLib.SOURCE_CONTINUE;
};
GLib.timeout_add(GLib.PRIORITY_HIGH, 5, tick);

// hammer the quick settings menu (notification center)
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

const d = deltas.filter(x => x < 10000);  // trim the tail
d.sort((a, b) => a - b);
const n = d.length;
const q = p => d[Math.min(n - 1, Math.floor(p * n))];
globalThis.RESULT = JSON.stringify({
    samples: n,
    p50: q(0.5), p95: q(0.95), p99: q(0.99), max: d[n - 1],
    stallsOver1000ms: d.filter(x => x > 1000).length,
    stalls200to1000: d.filter(x => x > 200 && x <= 1000).length,
    worst10: d.slice(-10).reverse(),
});
})()
