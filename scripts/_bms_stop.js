globalThis.RESULT = 'pending';
(() => {
    if (globalThis.__animId) { imports.gi.GLib.source_remove(globalThis.__animId); globalThis.__animId = 0; }
    if (globalThis.__animA) { globalThis.__animA.destroy(); globalThis.__animA = null; }
    globalThis.RESULT = 'stopped';
})()
