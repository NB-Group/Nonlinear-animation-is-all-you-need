globalThis.RESULT = 'pending';
(() => {
    globalThis.RESULT = String(globalThis.__paints || 0);
})()
