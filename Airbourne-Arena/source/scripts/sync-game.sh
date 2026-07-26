#!/usr/bin/env bash
# The game is one self-contained HTML file. It is served two ways — opened
# directly from the distribution root, and served at / by the Vite app — so a
# copy has to exist in public/. Every asset reference is relative, which
# resolves identically from both locations, so the copy is byte-for-byte and
# this script is the only thing allowed to write it.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
canonical="$(cd "${project_root}/.." && pwd)/index.html"
generated="${project_root}/public/case-run.html"

[[ -f "${canonical}" ]] || {
  echo "Canonical game file is missing: ${canonical}" >&2
  exit 66
}

if [[ "${1:-}" == "--check" ]]; then
  if cmp -s "${canonical}" "${generated}"; then
    echo "public/case-run.html is in sync with index.html"
    exit 0
  fi
  echo "public/case-run.html has drifted from index.html. Run: npm run sync:game" >&2
  exit 1
fi

cp "${canonical}" "${generated}"
echo "Synced public/case-run.html from index.html"
