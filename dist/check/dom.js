export function collectDom(root = document.body) {
    const frame = root.getBoundingClientRect();
    const out = {};
    root.querySelectorAll("[data-romp]").forEach((el, order) => {
        const name = el.dataset.romp;
        const r = el.getBoundingClientRect();
        let opacity = 1;
        let shown = r.width > 0 && r.height > 0;
        for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.display === "none" || cs.visibility === "hidden")
                shown = false;
            opacity *= parseFloat(cs.opacity || "1");
        }
        const x = r.left + r.width / 2 - frame.left, y = r.top + r.height / 2 - frame.top;
        const visW = Math.max(0, Math.min(r.right, frame.right) - Math.max(r.left, frame.left));
        const visH = Math.max(0, Math.min(r.bottom, frame.bottom) - Math.max(r.top, frame.top));
        const sample = {
            x,
            y,
            shown: shown && opacity > 0.01,
            onScreen: visW > 0 && visH > 0,
            area: shown ? visW * visH : 0,
            opacity: shown ? opacity : 0,
            impact: el.dataset.rompImpact === "1",
            seamless: el.dataset.rompSeamless === "1",
            box: { x0: r.left - frame.left, y0: r.top - frame.top, x1: r.right - frame.left, y1: r.bottom - frame.top },
            allowCrop: el.dataset.rompAllowCrop === "1",
            allowExit: el.dataset.rompAllowExit === "1",
        };
        const d = el.dataset;
        const role = d.rompRole;
        if (role === "text" || role === "focus" || role === "prop")
            sample.role = role;
        sample.z = d.rompZ != null ? +d.rompZ : order;
        if (d.rompAllow)
            sample.allow = d.rompAllow.split(",").map((k) => k.trim());
        if (role === "text") {
            const text = d.rompText ?? el.textContent ?? "";
            const total = d.rompCharsTotal != null ? +d.rompCharsTotal : [...text].length;
            sample.text = text;
            sample.chars = { shown: d.rompCharsShown != null ? +d.rompCharsShown : total, total };
            if (d.rompWords != null)
                sample.words = +d.rompWords;
            if (d.rompHeading === "1")
                sample.heading = true;
        }
        // Several elements with one name: keep the biggest (a character drawn twice for a keyline, say).
        if (!out[name] || sample.area > out[name].area)
            out[name] = sample;
    });
    return out;
}
//# sourceMappingURL=dom.js.map