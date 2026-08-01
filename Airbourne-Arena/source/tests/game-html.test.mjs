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

test("open world has a complete dock, launch, descent, landing, and exit loop", () => {
  for (const faction of ["vanguard", "tempest", "inferno"]) {
    assert.match(canonical, new RegExp(`assets/${faction}-ozone-base-v2\\.glb`));
    assert.match(canonical, new RegExp(`assets/${faction}-ozone-base-v2-lod1\\.glb`));
    assert.match(canonical, new RegExp(`assets/${faction}-ozone-base-v1\\.glb`));
    assert.match(canonical, new RegExp(`assets/${faction}-ozone-base-v1-lod1\\.glb`));
  }
  assert.match(canonical, /function startOpenWorld\(\)/);
  assert.match(canonical, /salvage\.landed=true;salvage\.surface='skybase'/);
  assert.match(canonical, /function skyDeckAt\(x,z\)/);
  assert.match(canonical, /function worldSurfaceAt\(x,z\)/);
  assert.match(canonical, /function stepWorldFlow\(dt\)/);
  assert.match(canonical, /LAUNCHED · INSERTION ROUTE LOCKED/);
  assert.match(canonical, /settleAircraft\(gh,deck\?'skybase':'ground'\)/);
  assert.match(canonical, /if\(e\.code==='KeyF'&&salvage\.surface==='skybase'\)\{openOperations\(\)/);
  assert.match(canonical, /hp:100,maxHp:100,alive:true/);
  assert.match(canonical, /if\(typeof applyLoadout==='function'\)applyLoadout\(\)/);
  assert.match(canonical, /player\.maxHp=Number\.isFinite\(player\.maxHp\)\?player\.maxHp:100/);
  assert.match(canonical, /player\.pos\.y=worldSurfaceAt\(player\.pos\.x,player\.pos\.z\)\+3\.2/);
  assert.match(canonical, /function calibrateSkyBase\(root,faction\)/);
  assert.match(canonical, /scene\.fog\.density=wx\.fog\*\(1-ozoneClear\*\.9\)/);
  assert.match(canonical, /salvage\.yaw-=e\.movementX\*gs/);
  assert.match(canonical, /salvage\.lookPitch=clamp\(salvage\.lookPitch-e\.movementY\*gs\*\.72/);
  assert.match(canonical, /exitForward=new THREE\.Vector3\(0,0,-1\)\.applyQuaternion\(player\.quat\)/);
  assert.match(canonical, /exitRight=new THREE\.Vector3\(1,0,0\)\.applyQuaternion\(player\.quat\)/);
  assert.match(canonical, /salvage\.x=player\.pos\.x-exitForward\.x\*8\+exitRight\.x\*7/);
  assert.match(canonical, /MOUSE LOOK · WASD MOVE · SHIFT RUN/);
});

test("lower-city free roam includes a complete filler ground-combat encounter", () => {
  assert.match(canonical, /function beginGroundEncounter\(\)/);
  assert.match(canonical, /function fireGroundWeapon\(\)/);
  assert.match(canonical, /function damageGroundPlayer\(amount\)/);
  assert.match(canonical, /salvage\.shield-=absorbed/);
  assert.match(canonical, /groundCombat\.kills>=groundCombat\.goal/);
  assert.match(canonical, /BLOCK SECURE · RETURN TO AIRCRAFT AND EXTRACT/);
  assert.match(canonical, /if\(keys\.Space\|\|mouseDown\|\|touchIn\.fire\|\|padIn\.fire\)fireGroundWeapon\(\)/);
  assert.match(canonical, /assets\/ground-sentry-drone-v1\.glb/);
  assert.match(canonical, /assets\/ground-sentry-drone-v1-lod1\.glb/);
  assert.match(canonical, /host\.userData\.legacy\.visible=false/);
});

test("sky-base operations route every game mode and every input class", () => {
  for (const id of ["opSalvage", "opGroundWar", "opArena", "opCampaign", "opClose"])
    assert.match(canonical, new RegExp(`id=["']${id}["']`));
  assert.match(canonical, /function openOperations\(\)/);
  assert.match(canonical, /armWorldActivity\('groundwar'\)/);
  assert.match(canonical, /function startArenaOperation\(\)/);
  assert.match(canonical, /stick\.active\?stick\.dx:0/);
  assert.match(canonical, /salvage\.on&&padTap\(gp,0\)/);
  assert.match(canonical, /else if\(salvage\.surface==='skybase'\)openOperations\(\)/);
});

test("sky-base launch inserts the aircraft into a dressed open world", () => {
  assert.match(canonical, /worldFlow\.transition=\{t:0,duration:7/);
  assert.match(canonical, /ATMOSPHERIC INSERTION · LOWER CITY AHEAD/);
  assert.match(canonical, /FLIGHT CONTROL RETURNED/);
  assert.match(canonical, /!\(worldFlow\.active&&worldFlow\.transition\)/);
  for (const district of ["CRASHYARD", "CIVIC COLLAPSE", "FLOODED WORKS"])
    assert.match(canonical, new RegExp(`name:'${district}'`));
  assert.match(canonical, /function stepWorldDistricts\(dt\)/);
  assert.match(canonical, /function nearestWorldDistrict\(x,z\)/);
  assert.match(canonical, /new THREE\.InstancedMesh\(new THREE\.BoxGeometry\(1,1,1\),districtMetal,debrisCount\)/);
  assert.match(canonical, /def\.name\+' extraction pad'/);
  for (const asset of [
    "assets/lower-city-districts-authored-v1.glb",
    "assets/lower-city-districts-authored-v1-lod1.glb",
    "assets/lower-city-districts-authored-v1-collision.glb",
  ]) assert.match(canonical, new RegExp(asset.replaceAll(".", "\\.")));
  for (const faction of ["vanguard", "tempest", "inferno"])
    assert.match(canonical, new RegExp(`${faction}:\\{x:`));
  assert.match(canonical, /function aircraftMayEnterCity\(fighter\)/);
  assert.match(canonical, /function districtObstacleHeightAt\(x,z\)/);
  assert.match(canonical, /worldDistrictFallback\.visible=false/);
  assert.equal(
    [...canonical.matchAll(/camera\.up\.set\(0,1,0\);camera\.lookAt\(/g)].length,
    2,
    "both on-foot cameras must reset up before calculating their view rotation",
  );
});

test("chase flight stays readable during hard banks on desktop and mobile", () => {
  // The device pixel ratio is still capped, and still capped harder at the
  // bottom end — but it now comes from the quality tier rather than a literal
  // LOW?1.25:2, because the tier is chosen by measured frame time instead of by
  // whether the screen happens to accept touch.
  assert.match(canonical, /renderer\.setPixelRatio\(Math\.min\(devicePixelRatio,GFX\.pixelCap\)\)/);
  assert.match(canonical, /name:'LOW'[^}]*pixelCap:1\.25/);
  assert.match(canonical, /name:'HIGH'[^}]*pixelCap:2/);
  assert.match(canonical, /LOW\?Math\.min\(2,renderer\.capabilities\.getMaxAnisotropy\(\)\)/);
  assert.match(canonical, /camFlatRight\.crossVectors\(_f,WORLD_UP\)/);
  assert.match(canonical, /\.addScaledVector\(WORLD_UP,camOff\.y\)/);
  assert.match(canonical, /st\.camMode===2\?1:\(LOW\?\.08:\.18\+turnPivot\*\.10\)/);
});

test("the island remains framed and readable during high-altitude night flight", () => {
  assert.match(canonical, /cameraAgl=Math\.max\(0,subject\.pos\.y-ground\(/);
  assert.match(canonical, /mapReveal=3\+smooth\(180,1100,cameraAgl\)\*\(LOW\?17:22\)/);
  assert.match(canonical, /camLookWant\.y-=mapReveal/);
  assert.match(canonical, /moonLight\.intensity=nightF\*\.52\*\(1-wx\.cover\*\.38\)/);
  assert.match(canonical, /hemi\.groundColor\.copy\(cGround\)/);
  assert.match(canonical, /hemi\.intensity=\.31\+dayF\*\.31\*shade\+st\.flash/);
});

test("a connected standard controller works in menus, the hangar, and flight", () => {
  assert.match(canonical, /addEventListener\('gamepadconnected'/);
  assert.match(canonical, /addEventListener\('gamepaddisconnected'/);
  assert.match(canonical, /function padMenuTick\(gp,scope\)/);
  assert.match(canonical, /function padHangarTick\(gp,dt\)/);
  assert.match(canonical, /hWalk\.active=!!\(lx\|\|ly\)/);
  assert.match(canonical, /walk\.yaw-=rx\*dt\*2\.7/);
  assert.match(canonical, /return !!\(b&&\(b\.pressed\|\|b\.value>\.18\)\)/);
  assert.match(canonical, /padIn\.fire=padHeld\(gp,7\)/);
  assert.match(canonical, /if\(padTap\(gp,9\)\)\{/);
});

test("the three-faction story fallback cannot recurse", () => {
  assert.match(
    canonical,
    /return PILOT\.faction\|\|\(PILOT\.team==='red'\?'inferno':'vanguard'\)/,
  );
  assert.doesNotMatch(canonical, /function factionKey\(\)\s*\{\s*return factionKey\(\)/);
});
