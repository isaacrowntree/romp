// Regenerates docs/hero.gif (and docs-src/og.png) from the built docs site's
// demo: a tiny static server, Playwright seeking the demo's own seek(t) frame
// by frame (the deterministic path), ffmpeg making a palette GIF.
// Run: `bun run gif` (needs ffmpeg on PATH; builds first).
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const docs = resolve("docs");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".gif": "image/gif" };
const server = createServer((req, res) => {
  const path = join(docs, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!path.startsWith(docs) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const FPS = 12, FROM = 0.5, TO = 7.3;
const dir = mkdtempSync(join(tmpdir(), "romp-gif-"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 980, height: 900 }, colorScheme: "light", deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.romp);
const frame = page.locator(".rd-frame");
let i = 0;
for (let t = FROM; t <= TO + 1e-9; t += 1 / FPS) {
  await page.evaluate((tt) => window.romp.seek(tt), t);
  await frame.screenshot({ path: join(dir, `f-${String(i++).padStart(4, "0")}.png`) });
}
// The social card: the settled pile, with the name and the pitch.
await page.evaluate(() => window.romp.seek(6.9));
await frame.screenshot({ path: join(dir, "pile.png") });
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const pile = readFileSync(join(dir, "pile.png")).toString("base64");
await og.setContent(`<body style="margin:0;width:1200px;height:630px;background:#f7f6fb;font-family:system-ui;display:grid;grid-template-columns:470px 1fr;align-items:center;gap:30px;padding:0 50px;box-sizing:border-box">
  <div><div style="font:800 96px/1 system-ui;letter-spacing:-.04em;color:#1c2230">r<span style="color:#5a3fc0">o</span>mp</div>
  <div style="font:600 30px/1.3 system-ui;color:#4f5466;margin-top:22px">Physics-baked character motion, a motion check and synthesised sound for videos made in code</div></div>
  <img src="data:image/png;base64,${pile}" style="width:100%;border-radius:22px;border:1px solid #e2e0ec"></body>`);
await og.screenshot({ path: resolve("docs-src/og.png") });
await browser.close();
server.close();

const pal = join(dir, "pal.png");
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(dir, "f-%04d.png"), "-vf", "scale=480:-1:flags=lanczos,palettegen=max_colors=64:stats_mode=diff", pal]);
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(dir, "f-%04d.png"), "-i", pal, "-lavfi", "scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "docs/hero.gif"]);
rmSync(dir, { recursive: true, force: true });
console.log("docs/hero.gif, docs-src/og.png");
