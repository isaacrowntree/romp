/**
 * What a render depends on, as hashes: file contents (sha256), media by size
 * and modification time (cheap for big files), and directories walked.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SKIP = new Set(["node_modules", ".git", ".romp", "dist", "out", "build"]);

/** Every file under the paths (files or directories), absolute, sorted. */
export function listFiles(paths: string[], root = process.cwd()): string[] {
  const out = new Set<string>();
  const walk = (p: string) => {
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isFile()) return void out.add(p);
    if (!st.isDirectory()) return;
    for (const e of readdirSync(p)) if (!e.startsWith(".") && !SKIP.has(e)) walk(path.join(p, e));
  };
  for (const p of paths) walk(path.resolve(root, p));
  return [...out].sort();
}

/** sha256 over each file's path (relative to root) and contents. */
export function hashFiles(files: string[], root = process.cwd()): string {
  const h = createHash("sha256");
  for (const f of [...files].sort()) {
    h.update(path.relative(root, f));
    h.update("\0");
    h.update(readFileSync(f));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 24);
}

/** Size and modification time of each file: a cheap stamp for big media. */
export function stampFiles(files: string[], root = process.cwd()): string {
  const h = createHash("sha256");
  for (const f of [...files].sort()) {
    const st = statSync(f);
    h.update(`${path.relative(root, f)}\0${st.size}\0${Math.round(st.mtimeMs)}\0`);
  }
  return h.digest("hex").slice(0, 24);
}

/** sha256 of a buffer or string. */
export function sha(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 24);
}
