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
