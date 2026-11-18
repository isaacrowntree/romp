// Regenerates docs/hero.gif from the demo page: Playwright seeks the same
// seek(t) frame by frame (the deterministic, offline path), ffmpeg makes a
// palette GIF. Run: `bun run gif` (needs ffmpeg on PATH).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const FPS = 15, SECONDS = 4.4;
const dir = mkdtempSync(join(tmpdir(), "romp-gif-"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
await page.goto(`file://${resolve("docs/index.html")}`);
const canvas = page.locator("#stage");
for (let i = 0; i <= SECONDS * FPS; i++) {
  await page.evaluate((t) => window.rompSeek(t), i / FPS);
  await canvas.screenshot({ path: join(dir, `f-${String(i).padStart(4, "0")}.png`) });
}
await browser.close();
const pal = join(dir, "pal.png");
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(dir, "f-%04d.png"), "-vf", "scale=480:-1:flags=lanczos,palettegen=max_colors=96", pal]);
execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(dir, "f-%04d.png"), "-i", pal, "-lavfi", "scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4", "docs/hero.gif"]);
rmSync(dir, { recursive: true, force: true });
console.log("docs/hero.gif");
