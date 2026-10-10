globalThis.RESULT = 'pending';
(() => {
    if (!globalThis.__paintHooked) {
        globalThis.__paintHooked = true;
        globalThis.__paints = 0;
        global.stage.connect('after-paint', () => {
            globalThis.__paints++;
        });
    }
    globalThis.RESULT = 'hooked';
})()
