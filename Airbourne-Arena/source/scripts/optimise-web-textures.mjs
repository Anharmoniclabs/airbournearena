/* Downsizes the shipped textures to a browser budget.
 *
 * The diffusion pipeline authors at 4096 because that is the right size for a
 * source asset and for the Unity target. It is not the right size for a free
 * browser game: thirteen 4K surface maps is over twenty megabytes of first
 * load, and at gameplay distance almost none of that detail survives the
 * mipmap chain.
 *
 * This caps referenced textures at MAX_EDGE and snaps non-power-of-two sizes
 * down to the nearest power of two, which the GPU prefers and which stops the
 * odd 1254px diffusion output from costing a full mip level to no benefit.
 *
 * Idempotent: a texture already at or under budget is left alone, so this can
 * run after every asset regeneration. Formats and filenames are preserved, so
 * nothing referencing them — the game, the asset contract, the Unity texture
 * manifests — needs to change.
 *
 *   node scripts/optimise-web-textures.mjs           # report only
 *   node scripts/optimise-web-textures.mjs --write   # actually resize
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const write = process.argv.includes("--write");
const assets = new URL("../../assets/", import.meta.url).pathname;
const indexHtml = new URL("../../index.html", import.meta.url).pathname;

/* 2048 is the smallest size at which the terrain and airframe surfaces still
   read at a low pass. Below that the tiling starts to show. */
const MAX_EDGE = 2048;
const WEBP_QUALITY = 82;

const html = fs.readFileSync(indexHtml, "utf8");
const referenced = new Set([...html.matchAll(/assets\/([A-Za-z0-9._/-]+)/g)].map((m) => m[1]));

const floorPow2 = (n) => 2 ** Math.floor(Math.log2(n));
const isPow2 = (n) => (n & (n - 1)) === 0;

/* Returns the size to resample to, or null to leave the file alone.
 *
 * Aspect ratio is always preserved. An earlier version of this forced every
 * texture to a square, which would have visibly stretched the briefing art, the
 * touch control pill and the 2731x4096 character portraits — the kind of bug
 * that is invisible in a size report and obvious on screen. */
function targetSize(w, h, file) {
  /* The PWA icons are referenced from the web manifest at declared pixel sizes.
     Shrinking one makes the manifest a lie. */
  if (/^airbourne-icon/.test(file)) return null;

  const edge = Math.max(w, h);
  if (edge > MAX_EDGE) {
    const k = MAX_EDGE / edge;
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }
  /* Square and non-power-of-two — the 1254px diffusion output — costs a mip
     level for nothing. Only worth snapping on textures large enough to matter. */
  if (w === h && !isPow2(w) && w > 512) return { w: floorPow2(w), h: floorPow2(w) };
  return null;
}

let before = 0, after = 0, changed = 0, skipped = 0;
const plan = [];

for (const file of fs.readdirSync(assets).sort()) {
  if (!/\.(webp|png)$/.test(file)) continue;
  /* Only what the game actually downloads. The rest of assets/ is pipeline
     input and source-of-truth art, and shrinking that would be destroying the
     master to save bytes nobody transfers. */
  if (!referenced.has(file)) continue;
  const full = path.join(assets, file);
  const size = fs.statSync(full).size;
  before += size;

  let meta;
  try { meta = await sharp(full).metadata(); } catch { after += size; continue; }
  const target = targetSize(meta.width, meta.height, file);
  if (!target) { after += size; skipped += 1; continue; }

  plan.push({ file, from: `${meta.width}x${meta.height}`, to: `${target.w}x${target.h}`, size });

  if (!write) { after += size; continue; }

  const pipeline = sharp(full).resize(target.w, target.h, { fit: "fill", kernel: "lanczos3" });
  const out = file.endsWith(".webp")
    ? await pipeline.webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer()
    /* PNG stays PNG: the filename is referenced by the game, the asset contract
       and two Unity manifests, and a format change would desync all of them for
       a saving the resize already mostly delivers. */
    : await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();

  /* Never let an "optimisation" make a file bigger. */
  if (out.byteLength >= size) { after += size; skipped += 1; continue; }
  fs.writeFileSync(full, out);
  after += out.byteLength;
  changed += 1;
}

for (const p of plan) {
  console.log(`  ${(p.size / 1e6).toFixed(2)}MB  ${p.from.padEnd(11)} -> ${p.to.padEnd(11)} ${p.file}`);
}
console.log(`\n${plan.length} over budget, ${skipped} already fine`);
console.log(`referenced textures: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB` +
  (write ? `  (${changed} rewritten, saved ${((before - after) / 1e6).toFixed(1)} MB)` : "  (dry run — pass --write)"));
