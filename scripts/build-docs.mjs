// Builds the docs site (GitHub Pages serves master:/docs at isaacrowntree.com/romp/).
//
//   docs-src/<page>.html   page bodies, each opening with a JSON comment:
//                          {"title", "description", "nav", "path"}
//   docs-src/style.css     the site's stylesheet
//   examples/demo/         the live demo (bundled to docs/demo.js)
//   CHANGELOG.md           → docs/changelog.html
//
// It wraps every page in the shared head, masthead and footer, stamps a
// content hash onto demo.js and style.css (Pages serves assets with a long
// browser cache, so a new build must be a new URL), writes the sitemap, and
// FAILS if the API reference names anything romp doesn't export (checked
// against dist/**/*.d.ts, so run after `tsc`). Runs as part of `bun run build`.
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "docs-src");
const out = join(root, "docs");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const SITE = "https://isaacrowntree.com/romp/";
const REPO = "https://github.com/isaacrowntree/romp";
mkdirSync(out, { recursive: true });

// ── 1. The demo bundle ─────────────────────────────────────────────────────
await build({
  entryPoints: [join(root, "examples/demo/demo.ts")],
  bundle: true,
  format: "esm",
  outfile: join(out, "demo.js"),
  minify: true,
  target: "es2020",
  legalComments: "none",
  logLevel: "warning",
});
copyFileSync(join(src, "style.css"), join(out, "style.css"));
const hash = (f) => createHash("sha256").update(readFileSync(join(out, f))).digest("hex").slice(0, 8);
const v = { "demo.js": hash("demo.js"), "style.css": hash("style.css") };

// ── 2. The API check: every name the reference documents must be exported ──
const exported = new Set();
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".d.ts")) {
      const t = readFileSync(p, "utf8");
      for (const m of t.matchAll(/export (?:declare )?(?:function|class|const|let|interface|type|enum) (\w+)/g)) exported.add(m[1]);
      for (const m of t.matchAll(/export \{([^}]+)\}/g)) for (const n of m[1].split(",")) exported.add(n.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop());
    }
  }
};
if (!existsSync(join(root, "dist"))) throw new Error("build-docs: run tsc first (dist/ is missing)");
walk(join(root, "dist"));
const api = readFileSync(join(src, "api.html"), "utf8");
const documented = [...api.matchAll(/data-export="(\w+)"/g)].map((m) => m[1]);
const missing = documented.filter((n) => !exported.has(n));
if (missing.length) {
  console.error(`build-docs: the API reference documents names romp doesn't export: ${missing.join(", ")}`);
  process.exit(1);
}

// ── 3. The changelog page, from CHANGELOG.md ──────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
function markdown(md) {
  const html = [];
  let list = false;
  let para = [];
  const flush = () => {
    if (para.length) html.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const endList = () => {
    if (list) html.push("</ul>");
    list = false;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (/^# /.test(line)) continue; // the page has its own h1
    const h = /^(#{2,3}) (.*)$/.exec(line);
    if (h) {
      flush();
      endList();
      const level = h[1].length;
      const id = h[2].toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
      html.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
    } else if (/^\s*- /.test(line)) {
      flush();
      if (!list) html.push("<ul>");
      list = true;
      html.push(`<li>${inline(line.replace(/^\s*- /, ""))}</li>`);
    } else if (/^\s{2,}\S/.test(line) && list) {
      html[html.length - 1] = html[html.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
    } else if (line === "") {
      flush();
      endList();
    } else {
      endList();
      para.push(line);
    }
  }
  flush();
  endList();
  return html.join("\n");
}
const changelog = `<!-- {"title": "Changelog — romp", "description": "What changed in each romp release.", "nav": "changelog", "path": "changelog.html"} -->
<section class="hero"><h1>Changelog</h1><p class="hero__lede">Every release, newest first. Versions follow SemVer.</p></section>
<div class="prose changelog">${markdown(readFileSync(join(root, "CHANGELOG.md"), "utf8"))}</div>`;

// ── 4. Pages ────────────────────────────────────────────────────────────────
const NAV = [
  ["home", "", "Home"],
  ["guides", "guides.html", "Guides"],
  ["api", "api.html", "API"],
  ["changelog", "changelog.html", "Changelog"],
];
function page(body) {
  const meta = JSON.parse(/<!--\s*(\{[\s\S]*?\})\s*-->/.exec(body)[1]);
  const content = body.replace(/<!--\s*\{[\s\S]*?\}\s*-->\s*/, "");
  const url = SITE + meta.path;
  const nav = NAV.map(([k, href, label]) => `<a href="./${href}"${k === meta.nav ? ' aria-current="page"' : ""}>${label}</a>`).join("\n          ");
  const demo = content.includes('id="romp-demo"')
    ? `\n<script type="module">
  import { mount } from "./demo.js?v=${v["demo.js"]}";
  window.romp = mount(document.getElementById("romp-demo"));
</script>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(meta.title)}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="romp" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(meta.title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:image" content="${SITE}og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="romp: a wordmark of springy letters, a knocked-over p and a pile of hatted characters" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#f7f6fb" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#13121b" media="(prefers-color-scheme: dark)" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@400..700&family=Atkinson+Hyperlegible+Next:ital,wght@0,400..800;1,400..800&display=swap" />
    <link rel="stylesheet" href="style.css?v=${v["style.css"]}" />
    <script type="application/ld+json">
      ${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareSourceCode",
        name: "romp",
        description: pkg.description,
        url: SITE,
        codeRepository: REPO,
        programmingLanguage: "TypeScript",
        license: "https://opensource.org/licenses/MIT",
        version: pkg.version,
        author: { "@type": "Person", name: "Isaac Rowntree", url: "https://isaacrowntree.com/" },
        keywords: (pkg.keywords ?? []).join(", "),
      })}
    </script>
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="masthead">
      <div class="shell masthead__inner">
        <a class="wordmark" href="./">r<span>o</span>mp</a>
        <nav aria-label="Sections">
          ${nav}
          <a href="${REPO}">GitHub</a>
        </nav>
      </div>
    </header>
    <main id="main"><div class="shell">
${content}
    </div></main>
    <footer class="foot"><div class="shell">romp ${pkg.version} · MIT · <a href="${REPO}">github.com/isaacrowntree/romp</a> · by <a href="https://isaacrowntree.com/">Isaac Rowntree</a></div></footer>${demo}
  </body>
</html>
`;
}
const pages = { "index.html": readFileSync(join(src, "index.html"), "utf8"), "guides.html": readFileSync(join(src, "guides.html"), "utf8"), "api.html": api, "changelog.html": changelog };
for (const [name, body] of Object.entries(pages)) writeFileSync(join(out, name), page(body));

// ── 5. Sitemap, robots, llms.txt ────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(pages)
    .map((p) => `  <url><loc>${SITE}${p === "index.html" ? "" : p}</loc><lastmod>${today}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`,
);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
copyFileSync(join(src, "llms.txt"), join(out, "llms.txt"));
for (const f of ["favicon.svg", "og.png"]) if (existsSync(join(src, f))) copyFileSync(join(src, f), join(out, f));
console.log(`docs: ${Object.keys(pages).join(", ")} · demo.js?v=${v["demo.js"]} · ${documented.length} API names checked`);
