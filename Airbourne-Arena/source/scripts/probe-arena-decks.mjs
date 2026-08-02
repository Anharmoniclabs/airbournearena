#!/usr/bin/env node
// Boots the built game in a real browser and drives the generated-art features
// far enough to prove they run: every new GLB downloads, the arsenal arms, a
// CQC deck deploys, and the frame loop survives being stepped on it.
//
// This deliberately takes no screenshot. Capture wedges on this container's
// SwiftShader path, and a wedged gate is worse than no gate — what actually
// catches breakage here is asset requests, console errors and reading state
// back out of the running game. Looking at it is the browser's job, and the
// Blender review renders are what stand in for that in review.
//
//   node scripts/probe-arena-decks.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const types = {
  ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary",
  ".webp": "image/webp", ".png": "image/png", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".css": "text/css",
};

const served = [];
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(gameRoot, url === "/" ? "index.html" : url);
  if (!file.startsWith(gameRoot)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    served.push(url);
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    served.push(`MISSING ${url}`);
    res.writeHead(404).end("not found");
  }
});
await new Promise((done) => server.listen(0, done));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.AIRBOURNE_CHROME
    || "/home/codespace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  // Software rendering has to hold every decoded texture in main memory, and
  // this container is frequently down to a few hundred megabytes free. A small
  // viewport and no shared-memory transport keep the renderer inside that;
  // nothing here is looked at, so resolution buys nothing.
  args: [
    "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox",
    "--disable-dev-shm-usage", "--disable-gpu-program-cache",
    "--js-flags=--max-old-space-size=512",
  ],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });

const errors = [];
page.on("crash", () => errors.push("renderer process crashed (usually out of memory)"));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" || /failed to load/i.test(m.text())) errors.push(`console: ${m.text()}`);
});

await page.goto(`${origin}/index.html?capture=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction("typeof window.__AIRBOURNE_CAPTURE__==='object'", null, { timeout: 60000 });
// Boot holds the world back until the asset manager settles; the game lifts its
// own cover, so waiting on that is waiting on the real readiness signal.
await page.waitForFunction("document.getElementById('boot').classList.contains('gone')",
  null, { timeout: 90000 }).catch(() => errors.push("boot cover never lifted"));

const report = await page.evaluate(async () => {
  const api = window.__AIRBOURNE_CAPTURE__;
  const arsenal = api.getArsenal();
  const match = api.getArenaMatch();
  const rig = api.getArenaInstallations();

  // The generated art is released only once the boot cover lifts, so nothing
  // below is ready the instant the page is. Waiting on the arsenal is waiting
  // on that release having actually happened.
  const began0 = Date.now();
  while (!arsenal.ready && Date.now() - began0 < 120000)
    await new Promise((r) => setTimeout(r, 250));
  // The masterplan and the airbases are reported, not waited for. They are the
  // slowest things in the release and none of the deck behaviour below depends
  // on them having arrived.

  const out = { inventory: {} };
  out.inventory.deferredReleaseMs = Date.now() - began0;
  out.inventory.weapons = api.getArenaArms().length;
  out.inventory.grenades = api.getArenaGrenades().length;
  out.inventory.decks = api.getCqcMaps().length;
  out.inventory.arsenalReady = arsenal.ready;
  out.inventory.masterplanLevels = rig.masterplan.levels.length;
  out.inventory.airbases = rig.airbases.length;
  out.inventory.airbaseLevels = rig.airbases.map((h) => h.levels.length);

  const began = Date.now();
  api.startArenaDeck("vanguard");
  // Poll rather than sleep a fixed amount: the deck, eight rigged pilots and
  // the arsenal all decode on one software-rendered thread here, and a fixed
  // wait either fails a healthy build or hides a slow one.
  while (!match.active && Date.now() - began < 90000)
    await new Promise((r) => setTimeout(r, 250));
  out.deployMs = Date.now() - began;
  out.stillLoading = match.loading;
  const salvage = api.getSalvage();
  out.matchActive = match.active;
  out.deckLoaded = !!match.mesh;
  out.botsSpawned = match.bots.length;
  out.botsReady = match.ready;
  out.surface = salvage.surface;

  if (match.active) {
    // Stand on the deck and confirm the raycast floor answers, then shoot.
    out.origin = { y: Math.round(match.origin.y) };
    // The deck is flat by design — see the note in 34e on why raycasting a
    // gltfpack-quantized mesh cannot work on this loader. What matters is that
    // the floor is the audited height for this map and not the model origin,
    // which is 70 m lower on Vanguard Sky and would drop the player through it.
    out.deckAboveOrigin =
      Math.round(api.arenaDeckAt(match.origin.x, match.origin.z) - match.origin.y);
    out.deckExpected = api.getCqcMaps().find((m) => m.id === "vanguard").deck;

    const before = arsenal.mag[arsenal.slot];
    api.fireArm();
    out.roundSpent = before - arsenal.mag[arsenal.slot];
    // Swapping and throwing both take the weapon out of action briefly, so each
    // needs the previous one to have finished — otherwise the second is
    // correctly refused and the probe reads that as a break.
    api.equipArm(3);
    for (let i = 0; i < 40; i++) api.tickGround(1 / 60);
    out.equipped = api.getArenaArms()[arsenal.slot].id;
    api.throwGrenade();
    out.grenadeLive = api.getArenaOrdnance().some((o) => o.live);
    for (let i = 0; i < 240; i++) api.tickGround(1 / 60);
    out.steppedOk = true;
    out.scoreAfter = { blue: match.score.blue, red: match.score.red };
    out.playerHp = Math.round(api.getPlayer().hp);
    api.leaveArenaDeck();
    out.leftCleanly = !match.active && !match.mesh && api.camera.fov === 70;
  }
  api.leaveArenaDeck();
  // With no match up the deck must stop claiming to be the world surface, or
  // every other mode inherits a floor 15 km in the air.
  out.deckIdleNull = api.arenaDeckAt(0, 0) === null;
  return out;
});

await browser.close();
server.close();

const wanted = [
  "arena-pilot-v1.glb", "weapon-pistol-v1.glb", "weapon-smg-v1.glb",
  "weapon-assault-v1.glb", "weapon-sniper-v1.glb", "weapon-rocket-v1.glb",
  "weapon-grenade-frag-v1.glb", "weapon-grenade-flash-v1.glb", "weapon-grenade-smoke-v1.glb",
  "cqc-vanguard-sky-v1.glb", "airbourne-arena-map-v1.glb", "sky-base-platform-v1.glb",
  "arena-tower-v1.glb", "arena-turret-v1.glb", "arena-crate-v1.glb", "arena-ammo-box-v1.glb",
];
const missing = wanted.filter((name) => !served.some((u) => u.endsWith(name)));
const notFound = served.filter((u) => u.startsWith("MISSING"));

console.log(JSON.stringify(report, null, 2));
console.log("\ngenerated assets fetched:", wanted.length - missing.length, "/", wanted.length);
if (missing.length) console.log("NEVER REQUESTED:", missing.join(", "));
if (notFound.length) console.log("404:", [...new Set(notFound)].join(", "));
if (errors.length) console.log("ERRORS:\n  " + [...new Set(errors)].join("\n  "));

const ok = report.matchActive && report.deckLoaded && report.roundSpent === 1
  && report.grenadeLive && report.equipped === "sniper"
  && report.deckAboveOrigin === report.deckExpected
  && report.deckIdleNull
  && report.steppedOk && report.leftCleanly && !missing.length && !notFound.length && !errors.length;
console.log(ok ? "\nPROBE PASS" : "\nPROBE FAIL");
process.exit(ok ? 0 : 1);
