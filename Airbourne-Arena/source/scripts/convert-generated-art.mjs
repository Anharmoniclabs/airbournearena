#!/usr/bin/env node
// Turns the AI Toolkit art drop into the runtime GLBs the game downloads.
//
// The drop arrives as two zips at the repo root — Assets.zip (the Unity
// project, which is where the integrated FBX + texture folders live) and
// GeneratedAssets.zip (the raw generator output, which we do not need). Both
// are gitignored and together are over 300 MB, so nothing here is committed
// except the converted GLBs, which are a few megabytes in total.
//
// Every decision that turns a generated FBX into a game asset — real-world
// size, orientation, material role name, texture budget — lives in
// source-assets/generated-art-manifest.json, not here. This script only walks
// it and shells out to Blender.
//
//   node scripts/convert-generated-art.mjs             # convert everything
//   node scripts/convert-generated-art.mjs --only weapon   # substring filter
//   node scripts/convert-generated-art.mjs --review        # also render proofs
import { execFile } from "node:child_process";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const sourceRoot = path.resolve(import.meta.dirname, "../..");
const repoRoot = path.resolve(sourceRoot, "..");
const blenderDir = path.join(sourceRoot, "source-assets", "blender");
const manifestPath = path.join(sourceRoot, "source-assets", "generated-art-manifest.json");
const assetsDir = path.join(sourceRoot, "assets");
const renderDir = path.join(repoRoot, "docs", "renders", "generated");
// Where Assets.zip gets unpacked. Gitignored: it is 146 MB of Unity project,
// of which we want twenty FBX files.
const artSource = process.env.GENERATED_ART_ROOT
  ? path.resolve(process.env.GENERATED_ART_ROOT)
  : path.join(repoRoot, ".art-source");

const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;
const review = process.argv.includes("--review");

const exists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

async function ensureArtSource() {
  const generated = path.join(artSource, "Assets", "Art", "Generated");
  if (await exists(generated)) return generated;

  const zip = path.join(repoRoot, "Assets.zip");
  if (!(await exists(zip))) {
    throw new Error(
      `No art source. Expected ${generated}, or Assets.zip at the repo root to unpack into it.\n` +
        `Set GENERATED_ART_ROOT to point at an already-unpacked drop.`,
    );
  }
  console.log("unpacking Assets.zip (the art drop is not committed)…");
  await mkdir(artSource, { recursive: true });
  // Only the integrated art folder is needed; the rest of the Unity project is
  // another 140 MB of scenes, packages and editor scripts.
  await run("unzip", ["-q", "-o", zip, "Assets/Art/Generated/*", "-d", artSource], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!(await exists(generated))) {
    throw new Error(`Assets.zip did not contain Assets/Art/Generated`);
  }
  return generated;
}

async function blender(script, args) {
  const { stdout, stderr } = await run(
    "blender",
    [
      "--background",
      "--factory-startup",
      "--python-exit-code",
      "1",
      "--python",
      path.join(blenderDir, script),
      "--",
      ...args,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  // Blender is loud and writes progress to stdout; surface only the line the
  // script itself printed, plus anything that looks like a real failure.
  const output = `${stdout}\n${stderr}`;
  const reported = output.match(/^(?:converted|reviewed) .*$/m);
  const failed = output.match(/^(?:Error|RuntimeError|.*Traceback).*$/m);
  if (failed && !reported) throw new Error(`${script}: ${failed[0]}\n${output.slice(-1500)}`);
  return reported ? reported[0] : "";
}

async function convert(asset, generatedRoot) {
  const input = path.join(generatedRoot, asset.sourceFolder, "selected.fbx");
  if (!(await exists(input))) {
    throw new Error(`${asset.output}: missing source ${path.relative(repoRoot, input)}`);
  }

  const variants = [{ output: asset.output, textureSize: asset.textureSize, decimate: 0 }];
  if (asset.lod) {
    variants.push({
      output: asset.output.replace(/\.glb$/, "-lod1.glb"),
      textureSize: asset.lod.textureSize ?? asset.textureSize,
      decimate: asset.lod.ratio,
    });
  }

  const lines = [];
  for (const variant of variants) {
    const output = path.join(assetsDir, variant.output);
    const reported = await blender("convert_generated_fbx.py", [
      "--input", input,
      "--output", output,
      "--material", asset.material,
      "--target-size", String(asset.targetSize),
      "--texture-size", String(variant.textureSize),
      "--rotate", asset.rotate ?? "0,0,0",
      "--origin", asset.origin ?? "floor",
      ...(variant.decimate > 0 ? ["--decimate", String(variant.decimate)] : []),
    ]);
    const { size } = await stat(output);
    lines.push(`  ${variant.output.padEnd(34)} ${(size / 1024).toFixed(0).padStart(6)} KB  ${reported.replace(/^converted \S+ /, "")}`);
  }

  if (review) {
    lines.push(
      `  ${await blender("render_generated_review.py", [
        "--input", path.join(assetsDir, asset.output),
        "--output", path.join(renderDir, asset.output.replace(/\.glb$/, ".png")),
      ])}`,
    );
  }
  return lines;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const generatedRoot = await ensureArtSource();
await mkdir(assetsDir, { recursive: true });

const queue = manifest.assets.filter((asset) => !only || asset.output.includes(only) || asset.sourceFolder.includes(only));
if (!queue.length) throw new Error(`--only ${only} matched nothing in the manifest`);

console.log(`converting ${queue.length} asset${queue.length === 1 ? "" : "s"}…\n`);
const failures = [];
for (const asset of queue) {
  console.log(asset.output);
  try {
    for (const line of await convert(asset, generatedRoot)) console.log(line);
  } catch (error) {
    failures.push(asset.output);
    console.log(`  FAILED ${error.message.split("\n")[0]}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} asset(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(`\nconverted ${queue.length} asset(s) into ${path.relative(repoRoot, assetsDir)}`);
