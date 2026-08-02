// Minimal boot check: does the game reach a playable hangar without taking the
// renderer out? This is the regression that mattered — the generated art used
// to load inside the boot bar and cost ~130 MB of decoded texture before the
// player could move.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..", "..");
const types = {".html":"text/html",".js":"text/javascript",".glb":"model/gltf-binary",
  ".webp":"image/webp",".png":"image/png",".json":"application/json",".css":"text/css",
  ".webmanifest":"application/manifest+json"};
const asked = [];
const server = createServer(async (req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  try {
    const b = await readFile(path.join(root, u === "/" ? "index.html" : u));
    asked.push(u);
    res.writeHead(200, {"content-type": types[path.extname(u)] ?? "application/octet-stream"});
    res.end(b);
  } catch { res.writeHead(404).end(); }
});
await new Promise((d) => server.listen(0, d));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: "/home/codespace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--no-sandbox","--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
let crashed = false;
const errors = [];
page.on("crash", () => { crashed = true; });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${origin}/index.html?capture=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction("typeof window.__AIRBOURNE_CAPTURE__==='object'", null, { timeout: 60000 });
const t0 = Date.now();
// The snapshot is taken in the page, in the same evaluation that first sees the
// cover lift. Counting requests server-side instead is a race: the release and
// the class land in the same instant, so a poll that observes the class a few
// milliseconds later can see downloads that were always going to be after it.
const lifted = await page.waitForFunction(`(() => {
  if (!document.getElementById('boot').classList.contains('gone')) return false;
  if (!window.__bootAssets) {
    window.__bootAssets = performance.getEntriesByType('resource').map((e) => e.name);
  }
  return true;
})()`, null, { timeout: 120000 }).then(() => true).catch(() => false);
const bootMs = Date.now() - t0;

const generated = /(?:weapon-|cqc-|arena-|sky-base-platform|airbourne-arena-map)/;
const atLift = await page.evaluate(() => window.__bootAssets || []);
const duringBoot = atLift.filter((u) => u.endsWith(".glb") && generated.test(u));
const phase = crashed ? "crashed" : await page.evaluate(() => window.__AIRBOURNE_CAPTURE__.getPhase());
console.log(JSON.stringify({
  bootCoverLifted: lifted, bootMs, crashed, phase,
  generatedGlbRequestedDuringBoot: duringBoot.length,
  pageErrors: errors.slice(0, 3),
}, null, 2));
await browser.close(); server.close();
const ok = lifted && !crashed && phase === "hangar" && duringBoot.length === 0 && !errors.length;
console.log(ok ? "BOOT PASS" : "BOOT FAIL");
process.exit(ok ? 0 : 1);
