// Numeric parity for the lead solver.
//
// unity-flight-parity.test.mjs checks the two sources agree on constants and
// structure, which catches a transcription slip. It cannot catch a mistake in
// the arithmetic between them — a sign, an operand order, a fallback taken at
// the wrong moment. So this runs the browser's own interceptTime and
// interceptAim, extracted from 27-gunnery.js and evaluated against a minimal
// THREE.Vector3, over the same inputs as the compiled C#, and compares.
//
// Both sides compute in double precision — JavaScript numbers are doubles, and
// GunnerySolver is written against FlightVector for exactly this reason — so
// the tolerance can be tight enough to be worth something.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import vm from "node:vm";

const run = promisify(execFile);
const gameRoot = new URL("../../", import.meta.url);
const project = new URL("UnityProject/Tools/FlightParity/FlightParity.csproj", gameRoot).pathname;

/* A Vector3 with only the operations the two extracted functions use. Keeping
   it minimal is deliberate: anything it does not implement would throw rather
   than quietly return a wrong answer. */
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  divideScalar(n) { this.x /= n; this.y /= n; this.z /= n; return this; }
  multiplyScalar(n) { this.x *= n; this.y *= n; this.z *= n; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
  normalize() { const l = this.length(); return l > 0 ? this.divideScalar(l) : this; }
}

/* Lift the four functions out of the shipped source rather than restating them
   here. A transcription would drift, and a test that drifts with the thing it
   is testing proves nothing. */
const gunnerySource = await readFile(new URL("src/game/27-gunnery.js", gameRoot), "utf8");
function extract(name) {
  const start = gunnerySource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `27-gunnery.js no longer defines ${name}`);
  let depth = 0, i = gunnerySource.indexOf("{", start);
  const open = i;
  for (; i < gunnerySource.length; i++) {
    if (gunnerySource[i] === "{") depth++;
    else if (gunnerySource[i] === "}" && --depth === 0) break;
  }
  return gunnerySource.slice(start, i + 1);
}

const bullets = await readFile(new URL("src/game/22-bullets.js", gameRoot), "utf8");
const MUZZLE = Number(bullets.match(/MUZZLE=(\d+)/)[1]);

const sandbox = {
  Math, MUZZLE,
  _iR: new Vector3(), _iW: new Vector3(), _tv2: new Vector3(),
  isFinite,
};
vm.createContext(sandbox);
vm.runInContext(
  [extract("targetVelocity"), extract("targetPoint"),
   extract("interceptTime"), extract("interceptAim")].join("\n"),
  sandbox,
);

const CASES = [
  // head-on closing
  { sp: [0, 600, 0], sv: [0, 0, -185], tp: [0, 600, -900], tv: [0, 0, 190] },
  // crossing, the case a lead pip exists for
  { sp: [0, 600, 0], sv: [0, 0, -185], tp: [400, 640, -700], tv: [-160, 0, 40] },
  // target running away faster than the rounds close is the fallback branch
  { sp: [0, 600, 0], sv: [0, 0, -185], tp: [0, 600, -1200], tv: [0, 0, -1400] },
  // near-stationary, hover-speed engagement
  { sp: [-120, 300, 80], sv: [4, -2, -12], tp: [60, 340, -260], tv: [2, 1, -3] },
  // long range, high deflection
  { sp: [0, 900, 0], sv: [40, 5, -240], tp: [-1500, 700, -1000], tv: [220, -30, 90] },
  // climbing away
  { sp: [10, 500, 10], sv: [0, 60, -200], tp: [30, 1200, -600], tv: [0, 120, -150] },
];

test("the lead solver agrees with the browser to double precision", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gunnery-"));
  const casesFile = join(dir, "cases.json");
  await writeFile(casesFile, JSON.stringify(CASES));

  const { stdout } = await run("dotnet",
    ["run", "--project", project, "-c", "Release", "--", "--gunnery", casesFile],
    { cwd: dir, timeout: 180000 });
  const csharp = JSON.parse(stdout.trim().split("\n").pop());

  assert.equal(csharp.length, CASES.length);
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const shooter = { pos: new Vector3(...c.sp), vel: new Vector3(...c.sv) };
    const target = { pos: new Vector3(...c.tp), vel: new Vector3(...c.tv) };
    const t = sandbox.interceptTime(shooter, target);
    const aim = sandbox.interceptAim(shooter, target, t, new Vector3());

    assert.ok(Math.abs(t - csharp[i].t) < 1e-9,
      `case ${i}: flight time ${csharp[i].t} vs browser ${t}`);
    for (const [axis, expected] of [["x", aim.x], ["y", aim.y], ["z", aim.z]]) {
      const got = csharp[i].aim["xyz".indexOf(axis)];
      assert.ok(Math.abs(got - expected) < 1e-9,
        `case ${i}: aim.${axis} ${got} vs browser ${expected}`);
    }
  }
});

test("the no-solution fallback is taken by both, not just one", () => {
  // Case 2 is a target opening faster than the rounds close. Both sides must
  // fall back to range/MUZZLE; a solver that returns a bogus positive root
  // there would put the lead pip somewhere absurd instead of straight ahead.
  const c = CASES[2];
  const shooter = { pos: new Vector3(...c.sp), vel: new Vector3(...c.sv) };
  const target = { pos: new Vector3(...c.tp), vel: new Vector3(...c.tv) };
  const range = Math.hypot(...c.tp.map((v, i) => v - c.sp[i]));
  assert.ok(Math.abs(sandbox.interceptTime(shooter, target) - range / MUZZLE) < 1e-12);
});
