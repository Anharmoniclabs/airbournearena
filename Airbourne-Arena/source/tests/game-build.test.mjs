// index.html is generated from ../src/ and committed. These checks are what
// stop a hand-edit of the generated file from looking like a source change:
// the edit would ship once and then be silently reverted by the next rebuild.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const srcDir = new URL("../../src/", import.meta.url);
const buildScript = new URL("../scripts/build-game.sh", import.meta.url);

test("index.html is in sync with src/", async () => {
  // build-game.sh --check reassembles into a temp file and compares. Failing
  // here means either the generated file was edited directly, or a src/ change
  // was committed without running the build.
  const { stdout } = await run("bash", [buildScript.pathname, "--check"]);
  assert.match(stdout, /in sync/);
});

test("the manifest lists every part, and every part exactly once", async () => {
  // A part that exists but is not in the manifest is dead code that reads as
  // live; a part listed twice would be concatenated twice into one scope.
  const manifest = await readFile(new URL("manifest.txt", srcDir), "utf8");
  const listed = manifest
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("["));

  assert.deepEqual(
    listed.filter((entry, i) => listed.indexOf(entry) !== i),
    [],
    "manifest.txt lists the same part more than once",
  );

  const onDisk = [];
  for (const dir of ["styles", "game"]) {
    for (const name of await readdir(new URL(`${dir}/`, srcDir))) {
      onDisk.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(
    onDisk.filter((path) => !listed.includes(path)).sort(),
    [],
    "these part files exist but are not in manifest.txt, so they are not built in",
  );
});

test("the parts stay a source split, not a module graph", async () => {
  // The parts are concatenated into one shared function scope, so import/export
  // syntax would be a syntax error at load. Anyone reaching for it wants the
  // Phase 2 esbuild path, which is a different change than adding a keyword.
  for (const dir of ["styles", "game"]) {
    for (const name of await readdir(new URL(`${dir}/`, srcDir))) {
      if (!name.endsWith(".js")) continue;
      const body = await readFile(new URL(`${dir}/${name}`, srcDir), "utf8");
      assert.doesNotMatch(
        body,
        /^\s*(?:import|export)\s/m,
        `${dir}/${name} uses module syntax; the parts share one scope`,
      );
    }
  }
});
