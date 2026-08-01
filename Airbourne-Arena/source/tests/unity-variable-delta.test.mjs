// Parity under the cadence the game actually runs at.
//
// docs/data/flight-golden.json is a fixed 1/60 trace, and FlightGoldenTests
// replays it at 1/60. That proves the two implementations of the aerodynamic
// equations agree, which is worth having and is not the same as proving the two
// *games* agree — the runtime never steps at a fixed rate. The browser advances
// the aircraft once per requestAnimationFrame on whatever delta that frame took,
// clamped to .05, and the Unity port now does the same in Update.
//
// So this drives both through an identical, deliberately uneven delta sequence:
// the real stepFlight from 21-flight-model.js on one side, the compiled
// FlightModel on the other. If the integrators disagree about how to absorb a
// long frame, this is where it shows.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import vm from "node:vm";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "../../UnityProject/Tools/FlightParity/FlightParity.csproj");

/* The same deltas both sides see. Deterministic, uneven, and bounded by the
   browser's own .05 clamp — a spread from a 120 Hz monitor to a dropped frame,
   which is the range a real session moves through. */
function deltaSequence(count) {
  const out = [];
  let seed = 20260731;
  for (let i = 0; i < count; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const unit = seed / 0x100000000;
    // 1/120 .. .05
    out.push(1 / 120 + unit * (0.05 - 1 / 120));
  }
  return out;
}

/* The browser's own flight model, loaded the way scripts/flight-golden.mjs
   loads it — the real source in a vm, not a transcription. */
function browserModel() {
  const THREE = require("three");
  const flightPath = resolve(here, "../../src/game/21-flight-model.js");
  const source = require("node:fs").readFileSync(flightPath, "utf8")
    .split("/* ===================== turn governor")[0];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const context = {
    THREE, windVec: new THREE.Vector3(), cfg: {}, clamp,
    smooth: (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: flightPath });
  const mesh = new THREE.Object3D();
  const fighter = {
    mesh, quat: mesh.quaternion,
    pos: new THREE.Vector3(0, 800, 0), vel: new THREE.Vector3(0, 0, -135),
    alpha: 0, carrying: false, dmgEng: 0, dmgAil: 0,
    trimAgile: 1, trimThrust: 1, abRamp: 0,
  };
  return { context, fighter };
}

/* Identical to Schedule() in the parity tool and to input() in the golden
   generator. Controls are a function of accumulated time, so an uneven delta
   sequence changes when each phase is entered — which is exactly the coupling
   worth testing. */
function schedule(t) {
  if (t < 2) return { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, burner: false };
  if (t < 5) return { pitch: 0.38, roll: -0.42, yaw: 0.08, throttle: 1, burner: false };
  if (t < 8) return { pitch: -0.16, roll: 0.25, yaw: -0.04, throttle: 1, burner: true };
  return { pitch: 0.05, roll: 0, yaw: 0, throttle: 0.62, burner: false };
}

test("both models agree step for step under an uneven frame delta", async () => {
  const deltas = deltaSequence(600);

  const { context, fighter } = browserModel();
  const expected = [];
  let t = 0;
  for (let i = 0; i < deltas.length; i++) {
    context.stepFlight(fighter, schedule(t), deltas[i]);
    t += deltas[i];
    if ((i + 1) % 60 === 0) {
      expected.push([
        fighter.pos.x, fighter.pos.y, fighter.pos.z,
        fighter.vel.x, fighter.vel.y, fighter.vel.z,
        fighter.alpha, fighter.speed, fighter.gLoad,
      ]);
    }
  }

  const dir = await mkdtemp(join(tmpdir(), "jitter-"));
  const file = join(dir, "deltas.json");
  await writeFile(file, JSON.stringify(deltas));
  const { stdout } = await run("dotnet",
    ["run", "--project", project, "-c", "Release", "--", "--jitter", file],
    { cwd: dir, timeout: 180000 });
  const actual = JSON.parse(stdout.trim().split("\n").pop());

  assert.equal(actual.length, expected.length, "checkpoint count");
  const labels = ["px", "py", "pz", "vx", "vy", "vz", "alpha", "speed", "gLoad"];
  for (let s = 0; s < expected.length; s++) {
    for (let f = 0; f < labels.length; f++) {
      const diff = Math.abs(actual[s][f] - expected[s][f]);
      const scale = Math.max(1, Math.abs(expected[s][f]));
      assert.ok(diff / scale < 1e-9,
        `checkpoint ${s} ${labels[f]}: ${actual[s][f]} vs browser ${expected[s][f]}`);
    }
  }
});

test("the delta sequence is actually uneven and inside the clamp", () => {
  // A test that silently degenerated to a fixed rate would prove nothing while
  // continuing to pass.
  const deltas = deltaSequence(600);
  const min = Math.min(...deltas);
  const max = Math.max(...deltas);
  assert.ok(max - min > 0.03, `deltas span only ${(max - min).toFixed(4)}s`);
  assert.ok(max <= 0.05 + 1e-12, "a delta exceeded the browser's .05 clamp");
  assert.ok(min > 0, "a non-positive delta is not a frame");
});
