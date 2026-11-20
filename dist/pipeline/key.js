/**
 * Stable keys for caches: the same value always gives the same key, in any
 * runtime (no Node APIs). Objects are keyed by sorted keys, functions by their
 * source, typed arrays by their contents, so a schedule with closures keys by
 * what it would play.
 */
/** A deterministic string for any value (functions by source; cycles marked). */
export function stableKey(value) {
    const seen = new WeakSet();
    const walk = (v) => {
        if (v === null)
            return "null";
        switch (typeof v) {
            case "undefined":
                return "u";
            case "number":
                return Number.isNaN(v) ? "NaN" : Object.is(v, -0) ? "-0" : `n${v}`;
            case "bigint":
                return `b${v}`;
            case "boolean":
                return v ? "T" : "F";
            case "string":
                return JSON.stringify(v);
            case "symbol":
                return `y${String(v.description)}`;
            case "function":
                return `f${JSON.stringify(Function.prototype.toString.call(v))}`;
        }
        const o = v;
        if (seen.has(o))
            return "~cycle";
        seen.add(o);
        if (ArrayBuffer.isView(o))
            return `t${o.constructor.name}[${Array.from(o).join(",")}]`;
        if (Array.isArray(o))
            return `[${o.map(walk).join(",")}]`;
        if (o instanceof Map)
            return `M{${[...o.entries()].map(([k, x]) => `${walk(k)}:${walk(x)}`).sort().join(",")}}`;
        if (o instanceof Set)
            return `S{${[...o].map(walk).sort().join(",")}}`;
        if (o instanceof Date)
            return `D${o.toISOString()}`;
        return `{${Object.keys(o)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${walk(o[k])}`)
            .join(",")}}`;
    };
    return walk(value);
}
/** cyrb53: a fast 53-bit string hash. */
function cyrb53(s, seed) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
/** A 106-bit hex hash of a string (two seeded cyrb53s). Not cryptographic: for cache keys. */
export function hashString(s) {
    return cyrb53(s, 1).toString(16).padStart(14, "0") + cyrb53(s, 2).toString(16).padStart(14, "0");
}
/** The cache key of any values: `hashString(stableKey(parts))`. */
export function keyOf(...parts) {
    return hashString(stableKey(parts));
}
//# sourceMappingURL=key.js.map