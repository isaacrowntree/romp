/**
 * Contact sheets: lay image tiles out in pages (cols × rows), each with its
 * label (a timestamp), and save each page as a JPEG. Laid out in headless
 * Chromium (playwright), so no font or ffmpeg filter is needed.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface Tile {
  file: string;
  label: string;
}

export interface MontageOptions {
  cols?: number;
  rows?: number;
  /** each tile's width on the page, px (default 480) */
  tileWidth?: number;
  /** a heading on every page */
  title?: string;
  /** JPEG quality 0..100 (default 82) */
  quality?: number;
  /** file name prefix (default "sheet") */
  prefix?: string;
}

/** "1:05.3" from seconds. */
export function timecode(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Split tiles into pages of cols × rows. */
export function pages<T>(tiles: T[], cols = 4, rows = 3): T[][] {
  const n = Math.max(1, cols * rows);
  return Array.from({ length: Math.ceil(tiles.length / n) }, (_, i) => tiles.slice(i * n, (i + 1) * n));
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The page's HTML (tiles as data URLs). */
export function sheetHtml(tiles: { src: string; label: string }[], o: MontageOptions & { page?: string } = {}): string {
  const cols = o.cols ?? 4, w = o.tileWidth ?? 480;
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#111;color:#eee;font:600 15px/1.3 ui-monospace,Menlo,monospace;width:${cols * (w + 12) + 12}px}
h1{font-size:16px;margin:10px 12px 0;font-weight:600;color:#bbb}
.g{display:grid;grid-template-columns:repeat(${cols},${w}px);gap:12px;padding:12px}
figure{margin:0}img{display:block;width:${w}px;height:auto;background:#222}
figcaption{padding:4px 2px 0}
</style>${o.title || o.page ? `<h1>${esc([o.title, o.page].filter(Boolean).join(" · "))}</h1>` : ""}<div class="g">${tiles
    .map((t) => `<figure><img src="${t.src}"><figcaption>${esc(t.label)}</figcaption></figure>`)
    .join("")}</div>`;
}

/** Write the pages; returns their paths. */
export async function montage(tiles: Tile[], outDir: string, o: MontageOptions = {}): Promise<string[]> {
  const { chromium } = await import("playwright");
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const out: string[] = [];
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const all = pages(tiles, o.cols, o.rows);
    for (const [i, group] of all.entries()) {
      const html = sheetHtml(
        group.map((t) => ({ src: `data:image/${path.extname(t.file).slice(1).replace("jpg", "jpeg")};base64,${readFileSync(t.file).toString("base64")}`, label: t.label })),
        { ...o, page: `${i + 1}/${all.length}` },
      );
      await page.setContent(html, { waitUntil: "load" });
      const file = path.join(outDir, `${o.prefix ?? "sheet"}-${String(i + 1).padStart(3, "0")}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: o.quality ?? 82, fullPage: true });
      out.push(file);
    }
  } finally {
    await browser.close();
  }
  return out;
}
