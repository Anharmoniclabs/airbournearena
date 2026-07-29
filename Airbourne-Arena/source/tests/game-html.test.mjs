import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const canonicalUrl = new URL("../../index.html", import.meta.url);
const servedUrl = new URL("../public/case-run.html", import.meta.url);

const canonical = await readFile(canonicalUrl, "utf8");
const served = await readFile(servedUrl, "utf8");

test("the served copy has not drifted from the canonical game file", () => {
  assert.equal(
    served,
    canonical,
    "public/case-run.html is stale. Run `npm run sync:game`.",
  );
});

test("every asset reference is relative so both copies resolve", () => {
  // An absolute /assets/... path breaks when index.html is opened from disk;
  // a bare assets/... path resolves from the distribution root and from /.
  const absolute = [...canonical.matchAll(/(?:src|href)=["']\/(?!\/)([^"']*)["']/g)];
  assert.deepEqual(
    absolute.map((m) => m[0]),
    [],
    "found absolute asset paths that only work when served from /",
  );
});

test("every referenced asset exists in both asset directories", async () => {
  // The game ships from two roots and each needs a complete asset set. New art
  // has landed in public/assets only before now, which leaves the standalone
  // index.html rendering with missing textures and nothing to catch it.
  const refs = [...new Set([...canonical.matchAll(/assets\/[\w./-]+/g)].map((m) => m[0]))];
  assert.ok(refs.length > 0, "expected the game to reference some assets");

  const roots = {
    "<root>/assets": new URL("../../", import.meta.url),
    "source/public/assets": new URL("../public/", import.meta.url),
  };
  const missing = [];
  for (const [label, base] of Object.entries(roots)) {
    for (const ref of refs) {
      try {
        await readFile(new URL(ref, base));
      } catch {
        missing.push(`${label}/${ref.replace("assets/", "")}`);
      }
    }
  }
  assert.deepEqual(missing, [], `missing assets:\n  ${missing.join("\n  ")}`);
});

test("branding is consistent", () => {
  assert.match(canonical, /<title>AIRBOURNE ARENA/);
  assert.equal(
    /SKYWARD/i.test(canonical),
    false,
    "leftover SKYWARD branding",
  );
});

test("magnetic aim is earned, bounded, and supports ground targets", () => {
  assert.match(canonical, /SOFT_LOCK_DWELL\s*=\s*\.24/);
  assert.match(canonical, /SOFT_LOCK_GRACE\s*=\s*\.48/);
  assert.match(canonical, /GUIDE_TIME\s*=\s*\.62/);
  assert.match(canonical, /GUIDE_TRACK_CONE\s*=\s*\.9455/);
  assert.match(canonical, /function targetPoint\(target,out\)/);
  assert.match(canonical, /if\(!target\.vel&&target\.height\)out\.y\+=target\.height\*\.52/);
  assert.match(canonical, /if\(sc\.alive&&sc\.team!==player\.team\)out\.push\(sc\)/);
  assert.match(canonical, /if\(site\.alive&&site\.hostile&&!site\.hold\)out\.push\(site\)/);
  assert.match(canonical, /guide:guide,guideT:guide\?GUIDE_TIME:0/);
  assert.match(canonical, /b\.guideT-=dt/);
});

test("the Blender world and campaign story kit are runtime assets", () => {
  assert.match(canonical, /starter-coast-world-authored-v2\.glb/);
  assert.match(canonical, /starter-coast-world-authored-v2-lod1\.glb/);
  assert.match(canonical, /starter-coast-story-kit-authored-v2\.glb/);
  assert.match(canonical, /function islandMask\(x,z\)/);
  assert.match(canonical, /SEABED_LEVEL=-32/);
  assert.match(canonical, /function terrainBaseHeight\(x,z\)/);
  assert.match(canonical, /var CONSTRUCTION_PADS=\[/);
  assert.match(canonical, /terrain\.visible=false;proceduralRoads\.visible=false;proceduralCity\.visible=false/);
  assert.match(canonical, /t\.repeat\.set\(1,1\)/);
  for (const template of [
    "Nav_Mast",
    "Warden_Node",
    "Defence_Platform",
    "Carrier_Engine",
    "Drone_Bay",
    "Command_Relay",
    "Warden_Core",
    "Cargo_Transport",
    "Blackwing_Fighter",
    "Blackwing_Drone",
    "Warden_Carrier",
    "Wreck_Field",
    "Foundry",
  ]) {
    assert.match(canonical, new RegExp(`['"]${template}['"]`));
  }
});

test("the three-faction story fallback cannot recurse", () => {
  assert.match(
    canonical,
    /return PILOT\.faction\|\|\(PILOT\.team==='red'\?'inferno':'vanguard'\)/,
  );
  assert.doesNotMatch(canonical, /function factionKey\(\)\s*\{\s*return factionKey\(\)/);
});
