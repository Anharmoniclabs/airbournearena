#!/usr/bin/env bash
# Packs the GLBs the game actually downloads with EXT_meshopt_compression.
#
# The models ship raw: no Draco, no meshopt, 6.8 MB for the world alone. Meshopt
# rather than Draco because the decoder is one 21 KB script attached in
# makeGltfLoader(), where Draco needs a wasm blob and a worker — and the game has
# to keep working when opened straight off disk from a file:// URL.
#
# Only files referenced by index.html are touched. The rest of assets/ is
# pipeline output and master art; compressing that would be damaging the source
# to save bytes no player ever transfers.
#
# Idempotent: a file that already declares EXT_meshopt_compression is skipped, so
# this can run after every asset regeneration.
#
#   bash scripts/compress-glb.sh          # report what would change
#   bash scripts/compress-glb.sh --write  # rewrite them
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_root="$(cd "${script_dir}/.." && pwd)"
game_root="$(cd "${source_root}/.." && pwd)"
assets="${game_root}/assets"
index="${game_root}/index.html"
write="${1:-}"

referenced() {
  grep -oE 'assets/[A-Za-z0-9._/-]+\.glb' "${index}" | sort -u | sed 's|^assets/||'
}

already_compressed() {
  # Read the GLB header's JSON chunk length and search exactly that chunk.
  #
  # This used to grep the first 4 KB, on the assumption that extensionsUsed sits
  # near the top. It does not: in the world model the marker lands at byte 7480
  # of a 29 KB JSON chunk, so every packed file was reported as unpacked and
  # would have been re-packed on every run.
  node -e '
    const fs=require("fs");
    const d=fs.readFileSync(process.argv[1]);
    if(d.length<20||d.readUInt32LE(0)!==0x46546C67){process.exit(1);}
    const jsonLen=d.readUInt32LE(12);
    const json=d.subarray(20,20+jsonLen).toString("utf8");
    let used=[];
    try{used=JSON.parse(json).extensionsUsed||[];}catch{process.exit(1);}
    process.exit(used.includes("EXT_meshopt_compression")?0:1);
  ' "$1"
}

total_before=0
total_after=0
changed=0

for name in $(referenced); do
  file="${assets}/${name}"
  [[ -f "${file}" ]] || { echo "  referenced but missing: ${name}" >&2; continue; }
  before=$(stat -c%s "${file}")
  total_before=$((total_before + before))

  if already_compressed "${file}"; then
    printf '  %6.2f MB  already packed   %s\n' "$(awk "BEGIN{print ${before}/1000000}")" "${name}"
    total_after=$((total_after + before))
    continue
  fi

  if [[ "${write}" != "--write" ]]; then
    printf '  %6.2f MB  would pack       %s\n' "$(awk "BEGIN{print ${before}/1000000}")" "${name}"
    total_after=$((total_after + before))
    continue
  fi

  tmp="$(mktemp --suffix=.glb)"
  # meshopt applies quantisation as well as encoding; the defaults are chosen
  # for real-time rendering and are well inside what this game's models need.
  npx --yes @gltf-transform/cli@4 meshopt "${file}" "${tmp}" >/dev/null 2>&1 || {
    echo "  FAILED to pack ${name} — left untouched" >&2
    rm -f "${tmp}"
    total_after=$((total_after + before))
    continue
  }
  after=$(stat -c%s "${tmp}")
  # Never let a "compression" pass make a file larger.
  if (( after >= before )); then
    printf '  %6.2f MB  no gain, kept    %s\n' "$(awk "BEGIN{print ${before}/1000000}")" "${name}"
    rm -f "${tmp}"
    total_after=$((total_after + before))
    continue
  fi
  mv "${tmp}" "${file}"
  total_after=$((total_after + after))
  changed=$((changed + 1))
  printf '  %6.2f MB -> %6.2f MB  %s\n' \
    "$(awk "BEGIN{print ${before}/1000000}")" "$(awk "BEGIN{print ${after}/1000000}")" "${name}"
done

echo
awk -v b="${total_before}" -v a="${total_after}" -v c="${changed}" -v w="${write}" 'BEGIN{
  printf "referenced GLB geometry: %.1f MB -> %.1f MB", b/1000000, a/1000000
  if (w == "--write") printf "  (%d rewritten, saved %.1f MB)\n", c, (b-a)/1000000
  else printf "  (dry run — pass --write)\n"
}'
