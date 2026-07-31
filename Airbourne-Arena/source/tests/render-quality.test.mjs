// Shadows, bloom and the compressed asset pipeline.
//
// The reason this file exists: the game shipped for months with castShadow set
// on aircraft, story props and world pieces, a comment reasoning about which
// batches were too large to cast — and renderer.shadowMap.enabled never set, so
// none of it did anything. That is a failure mode no visual review catches
// (a frame with no shadows looks like a frame with no shadows) and no unit test
// caught either, because each half was individually plausible.
//
// So these assert the halves are wired to each other, not that either exists.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const gameRoot = new URL("../../", import.meta.url);
const canonical = await readFile(new URL("index.html", gameRoot), "utf8");

test("something actually turns the shadow map on", () => {
  // The bug: four castShadow assignments and no renderer.shadowMap.enabled.
  assert.match(canonical, /renderer\.shadowMap\.enabled=/,
    "meshes set castShadow but nothing enables the renderer's shadow map");
  assert.match(canonical, /sunLight\.castShadow=/,
    "the shadow map is enabled but the sun never casts into it");
  assert.match(canonical, /renderer\.shadowMap\.type=THREE\.PCFSoftShadowMap/);
});

test("the sun's shadow frustum is small and follows the subject", () => {
  // A directional light framed on a five-kilometre arena spreads its map to a
  // few texels per aircraft and resolves nothing, so the frustum has to travel.
  assert.match(canonical, /function frameShadowCamera\(anchor\)/);
  assert.match(canonical, /sunLight\.target\.position\.copy\(_shadowAt\)/);
  assert.match(canonical, /sunLight\.target\.updateMatrixWorld\(\)/,
    "moving a directional light's target without updating its matrix leaves the shadow behind");
  // Texel quantisation is what stops the shadow edges crawling as you fly.
  assert.match(canonical, /Math\.round\(_shadowAt\.x\/texel\)\*texel/);
});

test("turning shadows off releases the map instead of rendering it unused", () => {
  // castShadow false with the map still allocated pays the depth pass and gets
  // nothing, which is the worst of both.
  assert.match(canonical, /if\(!sunLight\.castShadow\)\{[\s\S]{0,200}?shadow\.map\.dispose\(\)/);
});

test("every render goes through renderFrame so bloom cannot be bypassed", () => {
  // Two scenes are drawn — flight and hangar — and a direct renderer.render on
  // either would silently skip the composer for that screen.
  assert.match(canonical, /renderFrame\(scene,camera\)/);
  assert.match(canonical, /renderFrame\(hangarScene,hangarCam\)/);
  const directRenders = canonical.match(/renderer\.render\(/g) || [];
  assert.equal(directRenders.length, 1,
    "renderer.render should appear once, as renderFrame's no-bloom fallback");
});

test("bloom degrades to a plain render if the vendored library is missing", () => {
  // postprocessing-r128.js is a separate script tag. Losing it must cost the
  // glow, not the game.
  assert.match(canonical, /typeof THREE\.EffectComposer!=='function'/);
  assert.match(canonical, /<script src="assets\/postprocessing-r128\.js">/);
});

test("bloom keeps sunlit aircraft readable", () => {
  const strengths = [...canonical.matchAll(/bloomStrength:([0-9.]+)/g)]
    .map((match) => Number(match[1]));
  assert.ok(strengths.length >= 3, "expected one bloom budget per quality tier");
  assert.ok(Math.max(...strengths) <= 0.25,
    "full-scene bloom above 0.25 blows the aircraft beacon into a white halo");
  const pass = canonical.match(
    /new THREE\.UnrealBloomPass\([\s\S]{0,160}?GFX\.bloomStrength,([0-9.]+),([0-9.]+)\)/,
  );
  assert.ok(pass, "could not read the bloom radius and threshold");
  assert.ok(Number(pass[1]) <= 0.5, "bloom radius must stay attached to small emitters");
  assert.ok(Number(pass[2]) >= 0.9, "sunlit white surfaces must stay below bloom");

  const beacon = canonical.match(/bea\.scale\.setScalar\(f\.carrying\?([0-9.]+):([0-9.]+)\)/);
  assert.ok(beacon, "could not read the carrier and normal beacon sizes");
  assert.ok(Number(beacon[1]) <= 36, "the carrier beacon must not cover the aircraft");
  assert.ok(Number(beacon[2]) <= 18, "the normal team beacon must preserve the silhouette");
});

test("the bloom composer is resized with the canvas", () => {
  // Render targets left at the old size survive a resize as a stretched,
  // half-resolution glow over a correctly sized frame.
  assert.match(canonical, /function resizeRenderTargets\(w,h\)/);
  assert.match(canonical, /resizeRenderTargets\(w,h\)/);
});

test("the quality tier is measured, not guessed from the pointer type", () => {
  // It used to be `LOW = IS_TOUCH`, which gave a touchscreen laptop phone
  // settings and an ancient desktop the full scene.
  assert.match(canonical, /function watchFrameRate\(dt\)/);
  assert.match(canonical, /watchFrameRate\(dt\)/);
  assert.match(canonical, /GFX_TIERS=\[/);
  // Never climbs back: oscillating between tiers reads worse than sitting one
  // below the ceiling.
  assert.doesNotMatch(canonical, /setGfxTier\(gfxTier\+1/);
});

test("every GLB loader gets the meshopt decoder", async () => {
  // The models are meshopt-packed. A loader without the decoder fails on them
  // with an extension error rather than falling back, so there must be exactly
  // one place that can be forgotten.
  assert.match(canonical, /function makeGltfLoader\(\)/);
  assert.match(canonical, /loader\.setMeshoptDecoder\(MeshoptDecoder\)/);
  assert.match(canonical, /<script src="assets\/meshopt_decoder-r128\.js">/);

  const gameDir = new URL("src/game/", gameRoot);
  const offenders = [];
  for (const name of await readdir(gameDir)) {
    if (!name.endsWith(".js") || name.startsWith("08-assets")) continue;
    const body = await readFile(new URL(name, gameDir), "utf8");
    if (/new THREE\.GLTFLoader\(/.test(body)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    "these build a GLTFLoader directly and so will not decode a packed GLB");
});

test("the shipped GLBs are actually packed", async () => {
  // Guards against a Blender re-export quietly replacing a compressed model
  // with a raw one, which would not fail anything else — it would just make the
  // download twice the size again.
  const assets = new URL("assets/", gameRoot);
  const referenced = [...canonical.matchAll(/assets\/([A-Za-z0-9._/-]+\.glb)/g)].map((m) => m[1]);
  assert.ok(referenced.length >= 5, "expected the game to reference several GLBs");
  const raw = [];
  for (const name of new Set(referenced)) {
    // Parse the GLB header's JSON chunk rather than grepping a fixed window:
    // in the world model the extension marker lands at byte 7480 of a 29 KB
    // JSON chunk, so a "first few kilobytes" check reports every packed file
    // as unpacked.
    const buf = await readFile(new URL(name, assets));
    assert.equal(buf.readUInt32LE(0), 0x46546c67, `${name} is not a GLB`);
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
    if (!(json.extensionsUsed || []).includes("EXT_meshopt_compression")) raw.push(name);
  }
  assert.deepEqual(raw, [], "run: npm run assets:glb:write");
});

test("no shipped texture exceeds the browser budget", async () => {
  // The diffusion pipeline authors at 4096, which is right for a source asset
  // and for Unity, and far too big for a free browser game's first load.
  const { default: sharp } = await import("sharp");
  const assets = new URL("assets/", gameRoot);
  const referenced = new Set(
    [...canonical.matchAll(/assets\/([A-Za-z0-9._/-]+\.(?:webp|png))/g)].map((m) => m[1]),
  );
  const over = [];
  for (const name of referenced) {
    if (/^airbourne-icon/.test(name)) continue; // declared sizes in the web manifest
    const meta = await sharp(new URL(name, assets).pathname).metadata();
    if (Math.max(meta.width, meta.height) > 2048) over.push(`${name} ${meta.width}x${meta.height}`);
  }
  assert.deepEqual(over, [], "run: npm run assets:textures:write");
});
