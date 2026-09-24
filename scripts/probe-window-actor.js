// Probe real Meta.WindowActors: do they expose the Animatable surface our
// continuity engine needs (find_property / set_final_state / get_transition)?
const actors = global.get_window_actors();
const out = {count: actors.length, samples: []};
for (const a of actors.slice(0, 3)) {
    const s = {
        meta: a.meta_window?.get_wm_class?.() ?? String(a.meta_window),
        mapped: a.is_mapped?.(),
        find_x: typeof a.find_property,
        pspec_x: null,
    };
    if (a.find_property) {
        const p = a.find_property('scale-x');
        s.pspec_x = p ? [p.name, p.value_type?.name] : 'null';
    }
    s.setfs = typeof a.set_final_state;
    s.gettr = typeof a.get_transition;
    s.ease_wrapped = a.ease?.toString?.().includes('planEase');
    out.samples.push(s);
}
globalThis.RESULT = JSON.stringify(out);
'ok'
