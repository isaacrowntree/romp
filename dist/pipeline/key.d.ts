/**
 * Stable keys for caches: the same value always gives the same key, in any
 * runtime (no Node APIs). Objects are keyed by sorted keys, functions by their
 * source, typed arrays by their contents, so a schedule with closures keys by
 * what it would play.
 */
/** A deterministic string for any value (functions by source; cycles marked). */
export declare function stableKey(value: unknown): string;
/** A 106-bit hex hash of a string (two seeded cyrb53s). Not cryptographic: for cache keys. */
export declare function hashString(s: string): string;
/** The cache key of any values: `hashString(stableKey(parts))`. */
export declare function keyOf(...parts: unknown[]): string;
