#!/usr/bin/env bash
# Compile the Unity project and run the EditMode suite headlessly.
#
# This deliberately does not use `-runTests`. On a machine without an activated
# licence the editor loads the project, compiles every assembly, then stops at
# "No valid Unity Editor license found" before the runner starts — and exits 0
# anyway, so a CI step that trusts the exit code reports success for a suite
# that never ran. `-executeMethod` runs on the same loaded domain and is not
# gated, so HeadlessValidation drives the tests itself and reports honestly.
#
# UNITY_EDITOR overrides the editor path.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project="$(cd "$here/../../UnityProject" && pwd)"
editor="${UNITY_EDITOR:-/tmp/airbourne-unity-editor/Editor/Unity}"

if [ ! -x "$editor" ]; then
  echo "unity-verify: no editor at $editor" >&2
  echo "unity-verify: set UNITY_EDITOR to a Unity $(grep -oE '[0-9]+\.[0-9]+\.[0-9]+f[0-9]+' "$project/ProjectSettings/ProjectVersion.txt" | head -1) install" >&2
  exit 127
fi

log="$(mktemp -t unity-verify-XXXXXX.log)"
trap 'rm -f "$log"' EXIT

"$editor" -batchmode -nographics -disable-assembly-updater \
  -projectPath "$project" \
  -executeMethod AirbourneArena.EditorTools.HeadlessValidation.Run \
  -logFile "$log" || true

# The editor's own exit code is not trustworthy here, so the log is the report.
if grep -qE "error CS" "$log"; then
  echo "unity-verify: compilation failed" >&2
  grep -E "error CS" "$log" | sort -u >&2
  exit 1
fi

grep -E "^HEADLESS" "$log" || {
  echo "unity-verify: validation never ran — editor log tail:" >&2
  tail -25 "$log" >&2
  exit 1
}

grep -q "^HEADLESS: ALL PASS" "$log"
