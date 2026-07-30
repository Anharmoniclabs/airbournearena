#!/usr/bin/env bash
# Assembles the shipped game from src/ into Airbourne-Arena/index.html.
#
# The game is deliberately NOT a set of ES modules. It is one shared function
# scope, and it has to stay loadable from a file:// URL — `type="module"` is
# blocked there by CORS, which would break "clone the repo and open the file".
# So the split is a source-layout split only: src/manifest.txt names the parts
# in order, this script concatenates them into the single <style> and the single
# IIFE in src/shell.html, and the result is byte-for-byte what a browser used to
# be handed directly. Nothing about scoping, hoisting or load order changes.
#
# index.html is generated but committed, for the same reason
# source/public/case-run.html is: the file has to be openable straight from a
# clone or a download, with no build step and no server. `--check` is what keeps
# a hand-edit of the generated file from being mistaken for a source change.
#
# Pure bash and cat, no dependencies — this runs in CI before anything is
# installed.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
game_root="$(cd "${script_dir}/../.." && pwd)"
src="${game_root}/src"
shell_file="${src}/shell.html"
manifest="${src}/manifest.txt"
target="${game_root}/index.html"

for required in "${shell_file}" "${manifest}"; do
  [[ -f "${required}" ]] || {
    echo "Missing build input: ${required}" >&2
    exit 66
  }
done

# Concatenate every part filed under [<section>] in the manifest, in order.
emit_section() {
  local want="$1" section="" path
  while IFS= read -r entry || [[ -n "${entry}" ]]; do
    case "${entry}" in
      "" | \#*) continue ;;
      \[*\])
        section="${entry#\[}"
        section="${section%\]}"
        continue
        ;;
    esac
    [[ "${section}" == "${want}" ]] || continue
    path="${src}/${entry}"
    [[ -f "${path}" ]] || {
      echo "manifest.txt lists a part that does not exist: ${entry}" >&2
      exit 66
    }
    cat "${path}"
  done <"${manifest}"
}

# Copy the shell through verbatim, replacing each /*@include <section>*/ line
# with that section's parts. The marker is a comment in both CSS and JS so the
# shell stays syntactically plausible wherever a marker sits.
assemble() {
  local dest="$1" name
  : >"${dest}"
  while IFS= read -r line; do
    case "${line}" in
      "/*@include "*"*/")
        name="${line#/\*@include }"
        name="${name%\*/}"
        emit_section "${name}" >>"${dest}"
        ;;
      *) printf '%s\n' "${line}" >>"${dest}" ;;
    esac
  done <"${shell_file}"
}

if [[ "${1:-}" == "--check" ]]; then
  scratch="$(mktemp)"
  trap 'rm -f "${scratch}"' EXIT
  assemble "${scratch}"
  if cmp -s "${scratch}" "${target}"; then
    echo "index.html is in sync with src/"
    exit 0
  fi
  echo "index.html has drifted from src/. Edit src/, then run: npm run build:game" >&2
  echo "--- what a rebuild would change (generated <<< committed) ---" >&2
  diff "${scratch}" "${target}" | head -40 >&2 || true
  exit 1
fi

assemble "${target}"
echo "Built index.html from src/ ($(wc -l <"${target}") lines)"
