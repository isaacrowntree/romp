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
            allowCrop: el.dataset.rompAllowCrop == null ? false : el.dataset.rompAllowCrop === "1" ? true : +el.dataset.rompAllowCrop,
            allowExit: el.dataset.rompAllowExit === "1",
        };
        const d = el.dataset;
        const role = d.rompRole;
        if (role === "text" || role === "focus" || role === "prop" || role === "screen")
            sample.role = role;
        if (d.rompNativeWidth != null)
            sample.native = { width: +d.rompNativeWidth };
        if (d.rompMinTextPx != null)
            sample.minTextPx = +d.rompMinTextPx;
        if (d.rompAnchor)
            sample.anchor = d.rompAnchor;
        if (d.rompGround != null)
            sample.ground = +d.rompGround;
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
/**
 * Drawing surfaces the check can't see into: every `<svg>` (outermost),
 * `<canvas>`, `<img>` and `<video>` under `root` that isn't tracked, holds
 * nothing tracked, sits inside nothing tracked, comes after a shown tracked
 * text in the document (so it's drawn over it, unless z-index says otherwise)
 * and overlaps that text's box. Props drawn there can cross a title unseen:
 * track them. `romp check --strict` warns about each one.
 */
export function untrackedOver(root) {
    const frame = root.getBoundingClientRect();
    const shownIn = (el) => {
        for (let n = el; n && n !== root.parentElement; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity || "1") <= 0.01)
                return false;
        }
        return true;
    };
    const texts = [...root.querySelectorAll('[data-romp][data-romp-role="text"]')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ el, r }) => r.width > 0 && r.height > 0 && shownIn(el));
    if (!texts.length)
        return [];
    const out = [];
    root.querySelectorAll("svg, canvas, img, video").forEach((el) => {
        if (el.tagName.toLowerCase() === "svg" && el.parentElement?.closest("svg"))
            return;
        if (el.closest("[data-romp]") || el.querySelector("[data-romp]"))
            return;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || !shownIn(el))
            return;
        const hit = texts.find((t) => t.el.compareDocumentPosition(el) & 4 /* FOLLOWING */ && Math.min(r.right, t.r.right) > Math.max(r.left, t.r.left) && Math.min(r.bottom, t.r.bottom) > Math.max(r.top, t.r.top));
        if (!hit)
            return;
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : "";
        const c = (el.getAttribute("class") ?? "").trim();
        const cls = c ? `.${c.split(/\s+/)[0]}` : "";
        const src = tag === "img" ? ` ${(el.getAttribute("src") ?? "").split("/").pop()?.slice(0, 40)}` : "";
        out.push({ what: `<${tag}${id}${cls}>${src}`, size: `${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left - frame.left)},${Math.round(r.top - frame.top)}`, text: hit.el.dataset.romp });
    });
    return out;
}
//# sourceMappingURL=dom.js.map