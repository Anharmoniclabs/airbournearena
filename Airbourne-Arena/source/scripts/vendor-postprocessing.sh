#!/usr/bin/env bash
# Rebuilds assets/postprocessing-r128.js from the installed three.js.
#
# The game loads plain <script> tags and has to stay openable from a file:// URL,
# so it needs the UMD builds under three/examples/js that attach to the THREE
# global — not the ES modules under examples/jsm. Those UMD files are shipped
# with three r128 but are not published as a bundle, hence this.
#
# Order is load-bearing: Pass defines the base class the others extend, and a
# shader has to exist before the pass that names it.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_root="$(cd "${script_dir}/.." && pwd)"
game_root="$(cd "${source_root}/.." && pwd)"
examples="${source_root}/node_modules/three/examples/js"
target="${game_root}/assets/postprocessing-r128.js"

parts=(
  shaders/CopyShader.js
  shaders/LuminosityHighPassShader.js
  postprocessing/Pass.js
  postprocessing/ShaderPass.js
  postprocessing/MaskPass.js
  postprocessing/RenderPass.js
  postprocessing/EffectComposer.js
  postprocessing/UnrealBloomPass.js
)

for part in "${parts[@]}"; do
  [[ -f "${examples}/${part}" ]] || {
    echo "missing three.js example: ${part}" >&2
    echo "run npm install first, and check the three version still ships examples/js" >&2
    exit 66
  }
done

{
  echo "/* Post-processing chain for the bloom pass, vendored from three.js r128"
  echo "   examples/js (the UMD builds that attach to the THREE global, not the ES"
  echo "   modules — the game is one concatenated IIFE loaded from a plain script"
  echo "   tag and has to stay openable from file://)."
  echo ""
  echo "   Order matters: Pass defines the base every pass extends, and the shaders"
  echo "   have to exist before the passes that name them. Regenerate with"
  echo "   source/scripts/vendor-postprocessing.sh */"
  for part in "${parts[@]}"; do
    echo ""
    echo "/* ---------- ${part} ---------- */"
    cat "${examples}/${part}"
  done
} >"${target}"

node --check "${target}"
echo "Vendored $(wc -c <"${target}") bytes to assets/postprocessing-r128.js"
