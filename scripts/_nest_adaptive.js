globalThis.RESULT = 'pending';
(() => {
    // Flip adaptive-refresh for THIS shell only, without touching the shared
    // dconf value (the host session still runs the older module). The BMS
    // Settings class defines ADAPTIVE_REFRESH non-configurable, so shadow the
    // whole _settings reference with a Proxy instead. Only paint_signals.js
    // reads global.blur_my_shell._settings, so the blast radius is the toggle.
    const mode = globalThis.__ARG ?? 'on';
    const ext = global.blur_my_shell;
    if (!ext?._settings) {
        globalThis.RESULT = 'no-settings';
        return;
    }
    if (!ext.__realSettings)
        ext.__realSettings = ext._settings;
    const real = ext.__realSettings;
    if (mode === 'clear') {
        ext._settings = real;
        delete ext.__realSettings;
        globalThis.RESULT = 'restored, dconf=' + real.ADAPTIVE_REFRESH;
        return;
    }
    ext._settings = new Proxy(real, {
        get(t, k) {
            if (k === 'ADAPTIVE_REFRESH')
                return mode === 'on';
            const v = Reflect.get(t, k, t);
            return typeof v === 'function' ? v.bind(t) : v;
        },
    });
    globalThis.RESULT = 'patched=' + mode +
        ' read=' + ext._settings.ADAPTIVE_REFRESH;
})()
