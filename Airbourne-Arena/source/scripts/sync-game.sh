#!/usr/bin/env bash
# The game is one self-contained HTML file. It is served two ways — opened
# directly from the distribution root, and served at / by the Vite app — so a
# copy has to exist in public/. Every asset reference is relative, which
# resolves identically from both locations, so the copy is byte-for-byte and
# this script is the only thing allowed to write it.
#
# The asset tree is mirrored for the same reason and by the same rule. It used
# to be maintained by hand, which meant art could land in one folder and not the
# other — the failure the Pages workflow warns about, and which has shipped a
# game with missing textures once already. Anything that rewrites assets (the
# texture and GLB compression passes, a Blender re-export) only has to touch the
# canonical tree; this brings the copy along.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
game_root="$(cd "${project_root}/.." && pwd)"
canonical="${game_root}/index.html"
generated="${project_root}/public/case-run.html"
canonical_assets="${game_root}/assets"
mirror_assets="${project_root}/public/assets"

[[ -f "${canonical}" ]] || {
  echo "Canonical game file is missing: ${canonical}" >&2
  exit 66
}
[[ -d "${canonical_assets}" ]] || {
  echo "Canonical asset directory is missing: ${canonical_assets}" >&2
  exit 66
}

# Files present in one tree and not the other, or present in both at different
# sizes. Size rather than checksum keeps this dependency-free and fast over a
# tree this large; a rewrite that preserves byte count exactly is not a thing
# any of the asset tooling does.
asset_drift() {
  local out=""
  local name
  for path in "${canonical_assets}"/*; do
    [[ -f "${path}" ]] || continue
    name="$(basename "${path}")"
    if [[ ! -f "${mirror_assets}/${name}" ]]; then
      out+="  missing from public/assets: ${name}"$'\n'
    elif [[ "$(stat -c%s "${path}")" != "$(stat -c%s "${mirror_assets}/${name}")" ]]; then
      out+="  differs: ${name}"$'\n'
    fi
  done
  for path in "${mirror_assets}"/*; do
    [[ -f "${path}" ]] || continue
    name="$(basename "${path}")"
    [[ -f "${canonical_assets}/${name}" ]] || out+="  stale in public/assets: ${name}"$'\n'
  done
  printf '%s' "${out}"
}

if [[ "${1:-}" == "--check" ]]; then
  status=0
  if cmp -s "${canonical}" "${generated}"; then
    echo "public/case-run.html is in sync with index.html"
  else
    echo "public/case-run.html has drifted from index.html. Run: npm run sync:game" >&2
    status=1
  fi
  drift="$(asset_drift)"
  if [[ -z "${drift}" ]]; then
    echo "public/assets is in sync with assets/"
  else
    echo "public/assets has drifted from assets/. Run: npm run sync:game" >&2
    printf '%s' "${drift}" >&2
    status=1
  fi
  exit "${status}"
fi

cp "${canonical}" "${generated}"
echo "Synced public/case-run.html from index.html"

mkdir -p "${mirror_assets}"
copied=0
for path in "${canonical_assets}"/*; do
  [[ -f "${path}" ]] || continue
  name="$(basename "${path}")"
  target="${mirror_assets}/${name}"
  if [[ ! -f "${target}" ]] || [[ "$(stat -c%s "${path}")" != "$(stat -c%s "${target}")" ]]; then
    cp "${path}" "${target}"
    copied=$((copied + 1))
  fi
done
# A file the canonical tree no longer has is dead weight in the artifact and,
# worse, a reference that resolves in one serving path and 404s in the other.
removed=0
for path in "${mirror_assets}"/*; do
  [[ -f "${path}" ]] || continue
  name="$(basename "${path}")"
  if [[ ! -f "${canonical_assets}/${name}" ]]; then
    rm -f "${path}"
    removed=$((removed + 1))
  fi
done
echo "Synced public/assets from assets/ (${copied} copied, ${removed} removed)"
