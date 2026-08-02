// Numeric parity between the browser game and the Unity port.
//
// The existing flight-golden fixture proves FlightModel.Step reproduces the
// aerodynamic equations under synthetic 60 Hz controls. That is a real result
// and it is also a narrow one: it says nothing about input scaling, the
// simulation cadence the runtime actually uses, the throttle the aircraft
// launches with, or the gun. Every one of those was wrong in the port while the
// golden test stayed green, and each of them changes how the aircraft feels far
// more than a fourth-decimal difference in lift would.
//
// So this reads the constants out of both sources and asserts they agree. It
// needs no Unity Editor, so it runs in CI next to everything else.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gameRoot = new URL("../../", import.meta.url);
const unityRoot = new URL("UnityProject/Assets/AirbourneArena/", gameRoot);

const read = (url) => readFile(url, "utf8");
const js = {
  bullets: await read(new URL("src/game/22-bullets.js", gameRoot)),
  gunnery: await read(new URL("src/game/27-gunnery.js", gameRoot)),
  state: await read(new URL("src/game/23-state.js", gameRoot)),
  input: await read(new URL("src/game/31-input.js", gameRoot)),
  pilot: await read(new URL("src/game/20-pilot.js", gameRoot)),
  loop: await read(new URL("src/game/49-loop.js", gameRoot)),
};
const cs = {
  gunnery: await read(new URL("Runtime/Flight/GunnerySolver.cs", unityRoot)),
  controller: await read(new URL("Runtime/Flight/PlayerFlightController.cs", unityRoot)),
  body: await read(new URL("Runtime/Flight/UnityFlightBody.cs", unityRoot)),
  guns: await read(new URL("Runtime/VerticalSlice/AircraftGuns.cs", unityRoot)),
  pool: await read(new URL("Runtime/VerticalSlice/RoundPool.cs", unityRoot)),
  camera: await read(new URL("Runtime/VerticalSlice/ChaseCamera.cs", unityRoot)),
};
const inputManager = await read(new URL("UnityProject/ProjectSettings/InputManager.asset", gameRoot));
const timeManager = await read(new URL("UnityProject/ProjectSettings/TimeManager.asset", gameRoot));

/* Several assertions below are of the form "this construct no longer appears".
   Those have to run against code alone: every one of these files explains in a
   comment what it stopped doing and why, and a naive search finds the
   explanation and reports the bug it documents. */
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/^[ \t]*\/\/\/.*$/gm, "");

/* Pull `name=value` out of a JS var block, and `Name = value` out of a C#
   const. Both sources declare these once, as literals, on purpose. */
const jsNum = (src, name) => {
  const m = src.match(new RegExp(`\\b${name}\\s*=\\s*(-?[\\d.]+)`));
  assert.ok(m, `could not find ${name} in the browser source`);
  return Number(m[1]);
};
const csNum = (src, name) => {
  const m = src.match(new RegExp(`\\b${name}\\s*=\\s*(-?[\\d.]+)f?\\s*;`));
  assert.ok(m, `could not find ${name} in the Unity source`);
  return Number(m[1]);
};

test("the gun fires the same rounds at the same rate for the same damage", () => {
  // Was 520 / 12 / 12-per-second in the port, against 780 / 14 / .085s here.
  assert.equal(csNum(cs.gunnery, "MuzzleVelocity"), jsNum(js.bullets, "MUZZLE"));
  assert.equal(csNum(cs.gunnery, "RoundDamage"), jsNum(js.bullets, "BULLET_DMG"));
  assert.equal(csNum(cs.gunnery, "HitRadius"), jsNum(js.bullets, "HIT_RADIUS"));
  // f.cannonCd = .085 / (f.gunRate || 1) — 11.76 rounds a second, not 12.
  assert.match(js.bullets, /cannonCd=\.085\//);
  assert.equal(csNum(cs.gunnery, "ShotInterval"), 0.085);
});

test("the magnetic aim and guidance constants match", () => {
  // Without these a shot that scores in the browser misses in Unity, which
  // reads as the aircraft being wrong rather than the gun being absent.
  for (const [csName, jsName] of [
    ["AssistCone", "ASSIST_CONE"],
    ["AssistPull", "ASSIST_PULL"],
    ["GuideFireCone", "GUIDE_FIRE_CONE"],
    ["GuideTime", "GUIDE_TIME"],
    ["GuideTurn", "GUIDE_TURN"],
    ["GuideTrackCone", "GUIDE_TRACK_CONE"],
  ]) {
    assert.equal(csNum(cs.gunnery, csName), jsNum(js.bullets, jsName), `${csName} vs ${jsName}`);
  }
});

test("rounds live as long and spread as tightly as the canonical ones", () => {
  assert.match(js.bullets, /b\.life=1\.6/);
  assert.equal(csNum(cs.gunnery, "RoundLife"), 1.6);
  assert.match(js.bullets, /f\.isPlayer\?\.0032:/);
  assert.equal(csNum(cs.gunnery, "PlayerSpread"), 0.0032);
  assert.match(js.bullets, /addScaledVector\(fwd,6\.4\)/);
  assert.equal(csNum(cs.gunnery, "MuzzleOffset"), 6.4);
  assert.equal(csNum(cs.gunnery, "MaxRounds"), jsNum(js.bullets, "B_MAX"));
});

test("the aircraft launches with throttle headroom", () => {
  // The port started at 1, so W did nothing at all — the aircraft was already
  // at military power and only the burner could add anything. That single line
  // is most of why the accelerator felt dead.
  assert.match(js.pilot, /f\.throttle=\.85/);
  assert.match(cs.controller, /double throttle = \.85/);
});

test("mouse deltas are scaled once, by the same gain", () => {
  // The browser multiplies raw movementX by cfg.sens/100000. Unity's mouse axes
  // apply their InputManager sensitivity even through GetAxisRaw, so leaving
  // that at Unity's 0.1 default scaled every delta a second time and made
  // steering a tenth as responsive.
  assert.match(js.state, /cfg\.sens\/100000/);
  assert.match(cs.controller, /sensitivity \/ 100000f/);

  const mouseAxes = [...inputManager.matchAll(/m_Name: Mouse [XY][\s\S]{0,220}?sensitivity: ([\d.]+)/g)];
  assert.equal(mouseAxes.length, 2, "expected a Mouse X and a Mouse Y axis");
  for (const axis of mouseAxes) {
    assert.equal(Number(axis[1]), 1,
      "a mouse axis sensitivity other than 1 scales the delta before the gain is applied");
  }
});

test("only the accumulated aim is clamped, never a single frame's delta", () => {
  // The browser bounds where the reticle can sit (AIM_R) and never limits how
  // fast it gets there. Clamping the per-frame delta throttles exactly the fast
  // flick used to bring the nose round.
  assert.match(js.state, /AIM_R=0?\.55/);
  assert.match(cs.controller, /aim\.magnitude > AimRadius/);
  assert.doesNotMatch(codeOnly(cs.controller), /ClampMagnitude\(delta/,
    "the per-frame delta clamp is not a thing the canonical game does");
});

test("mouse gain narrows with the gunsight, on both sides", () => {
  // zoomGain() = 1 - zoom.k * 0.62. Dropping it made a zoomed Unity pass
  // twitchier than an unzoomed one instead of steadier.
  assert.match(js.state, /1-zoom\.k\*0?\.62/);
  assert.match(cs.controller, /1 - zoomK \* \.62f/);
  assert.match(cs.controller, /ZoomGain\(zoomK\)/);
  // And the zoom itself has to approach the same way: exponential, rate 7.
  assert.match(js.loop, /zoom\.k\+=\(\(zoom\.on\?1:0\)-zoom\.k\)\*Math\.min\(1,dt\*7\)/);
  assert.match(cs.camera, /zoom \+= \(\(zoomHeld \? 1 : 0\) - zoom\) \* Mathf\.Min\(1, Time\.deltaTime \* 7\)/);
});

test("the aircraft is stepped once per rendered frame, on a clamped delta", () => {
  // The browser runs input, flight, camera and render inside one rAF on a
  // variable delta clamped to .05. Stepping in FixedUpdate at 50 Hz instead put
  // a variable amount of staleness between a mouse movement and the frame that
  // showed its result, and integrated at a rate the model was never tuned at.
  assert.match(js.loop, /if\(dt>\.05\)dt=\.05/);
  assert.match(cs.body, /MaxFrameDelta = \.05f/);
  assert.match(cs.body, /void Update\(\)/);
  assert.doesNotMatch(codeOnly(cs.body), /void FixedUpdate\(\)/,
    "the airframe is integrated by hand on a kinematic transform; FixedUpdate only adds latency");
  // MovePosition queues a move for the physics step and is only correct from
  // FixedUpdate.
  assert.doesNotMatch(codeOnly(cs.body), /MovePosition|MoveRotation/);
});

test("the physics clock matches the simulation rate the model was tuned at", () => {
  // Unity's 50 Hz default is not the 60 Hz the golden fixture was recorded at.
  const count = Number(timeManager.match(/m_Count: (\d+)/)[1]);
  const numerator = Number(timeManager.match(/m_Numerator: (\d+)/)[1]);
  const denominator = Number(timeManager.match(/m_Denominator: (\d+)/)[1]);
  const step = count / (numerator / denominator);
  assert.ok(Math.abs(1 / step - 60) < 0.01,
    `fixed timestep is ${(1 / step).toFixed(2)} Hz, expected 60 Hz`);
});

test("tracers are pooled rather than allocated per shot", () => {
  // The slice built a GameObject, a LineRenderer and a Material — via
  // Shader.Find — for every round, then destroyed all three on impact. At
  // 11.76 rounds a second that is a WebGL garbage collection hitch for as long
  // as the trigger is held.
  assert.match(js.bullets, /new Float32Array\(B_MAX\*6\)/);
  assert.match(js.bullets, /THREE\.LineSegments/);
  assert.match(cs.pool, /rounds = new Round\[GunnerySolver\.MaxRounds\]/);
  assert.doesNotMatch(codeOnly(cs.guns), /new GameObject/,
    "a GameObject per shot is the allocation pattern this replaced");
  // One Shader.Find, in the pool's own material builder — not per round.
  assert.equal((codeOnly(cs.pool).match(/Shader\.Find/g) || []).length, 1);
});

test("the lead solver is the canonical quadratic, not a straight shot", () => {
  // Same fallback too: a target opening faster than the rounds close has no
  // intercept, and returning nothing there silently disables the lead pip.
  assert.match(js.gunnery, /var a=MUZZLE\*MUZZLE-_iW\.lengthSq\(\)/);
  assert.match(cs.gunnery, /MuzzleVelocity \* MuzzleVelocity - w\.LengthSquared/);
  assert.match(js.gunnery, /if\(a<=1e-6\)return range\/MUZZLE/);
  assert.match(cs.gunnery, /if \(a <= 1e-6\) return range \/ MuzzleVelocity/);
  assert.match(js.gunnery, /Math\.min\(t,4\)/);
  assert.match(cs.gunnery, /Math\.Min\(t, 4\)/);
});

test("hit detection is a segment test, matching the browser", () => {
  // The port used Physics.SphereCast with a .32 radius: a different radius, and
  // a query that needs colliders on the right layer and stops at the first one
  // it touches. The browser does closest-approach arithmetic against the target
  // centre and needs neither.
  assert.match(js.bullets, /HIT_RADIUS=14/);
  assert.match(cs.gunnery, /SegmentHitsSphere/);
  assert.doesNotMatch(codeOnly(cs.pool), /SphereCast/);
  assert.doesNotMatch(codeOnly(cs.guns), /SphereCast/);
});
