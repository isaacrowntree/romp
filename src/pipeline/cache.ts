/**
 * A file cache keyed by content: `cachedFile(dir, key, ".wav", (tmp) => render(tmp))`
 * returns the cached file when the key has been made before, and makes it
 * (atomically: written to a temp name, then renamed) when it hasn't.
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

export async function cachedFile(dir: string, key: string, ext: string, make: (tmpPath: string) => Promise<void>): Promise<{ path: string; hit: boolean }> {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${key}${ext}`);
  if (existsSync(file)) return { path: file, hit: true };
  const tmp = path.join(dir, `.${key}.${process.pid}.tmp${ext}`);
  try {
    await make(tmp);
    renameSync(tmp, file);
  } finally {
    rmSync(tmp, { force: true });
  }
  return { path: file, hit: false };
}
