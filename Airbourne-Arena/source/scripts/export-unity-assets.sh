#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
blender_root="$project_root/source-assets/blender"
unity_art="$project_root/UnityProject/Assets/Art/Generated"
runtime_assets="$project_root/assets"

mkdir -p "$unity_art"
blender --background --factory-startup \
  --python-exit-code 1 \
  --python "$blender_root/import_runtime_glb.py" -- \
  --input "$runtime_assets/breakwater-hangar-detail-authored-v1.glb" \
  --output "$blender_root/breakwater-hangar-unity-v1.blend"
blender --background --factory-startup \
  --python-exit-code 1 \
  --python "$blender_root/import_runtime_glb.py" -- \
  --input "$runtime_assets/starter-coast-pilot-rig-v1.glb" \
  --output "$blender_root/starter-coast-pilot-unity-v1.blend"
blender --background "$blender_root/vanguard-interceptor-v4.blend" \
  --python-exit-code 1 \
  --python "$blender_root/export_unity_fbx.py" -- \
  --output "$unity_art/vanguard-interceptor-v4.fbx" \
  --name-contains lod0
blender --background "$blender_root/vanguard-interceptor-v4.blend" \
  --python-exit-code 1 \
  --python "$blender_root/export_unity_fbx.py" -- \
  --output "$unity_art/vanguard-interceptor-v4-lod1.fbx" \
  --name-contains lod1
blender --background "$blender_root/starter-coast-world-authored-v2.blend" \
  --python-exit-code 1 \
  --python "$blender_root/export_unity_fbx.py" -- \
  --output "$unity_art/starter-coast-world-authored-v2.fbx" \
  --name-contains Starter_Coast_LOD0
blender --background "$blender_root/starter-coast-world-authored-v2.blend" \
  --python-exit-code 1 \
  --python "$blender_root/export_unity_fbx.py" -- \
  --output "$unity_art/starter-coast-world-authored-v2-lod1.fbx" \
  --name-contains Starter_Coast_LOD1
blender --background "$blender_root/starter-coast-world-authored-v2.blend" \
  --python-exit-code 1 \
  --python "$blender_root/export_unity_fbx.py" -- \
  --output "$unity_art/blackwing-drone.fbx" \
  --name-contains blackwing_drone
blender --background "$blender_root/breakwater-hangar-unity-v1.blend" \
  --python-exit-code 1 \
  --python "$blender_root/export_unity_fbx.py" -- \
  --output "$unity_art/breakwater-hangar-detail-authored-v1.fbx"
blender --background "$blender_root/starter-coast-pilot-unity-v1.blend" \
  --python-exit-code 1 \
  --python "$blender_root/export_unity_fbx.py" -- \
  --output "$unity_art/starter-coast-pilot-rig-v1.fbx"
for clip in Idle Walk Run; do
  blender --background "$blender_root/starter-coast-pilot-unity-v1.blend" \
    --python-exit-code 1 \
    --python "$blender_root/export_unity_fbx.py" -- \
    --output "$unity_art/starter-coast-pilot-${clip,,}.fbx" \
    --action "$clip"
done

blender --background --factory-startup \
  --python-exit-code 1 \
  --python "$blender_root/audit_unity_fbx.py" -- \
  --report "$project_root/../docs/data/unity-fbx-audit.json" \
  "$unity_art/vanguard-interceptor-v4.fbx" \
  "$unity_art/vanguard-interceptor-v4-lod1.fbx" \
  "$unity_art/starter-coast-world-authored-v2.fbx" \
  "$unity_art/starter-coast-world-authored-v2-lod1.fbx" \
  "$unity_art/blackwing-drone.fbx" \
  "$unity_art/breakwater-hangar-detail-authored-v1.fbx" \
  "$unity_art/starter-coast-pilot-rig-v1.fbx" \
  "$unity_art/starter-coast-pilot-idle.fbx" \
  "$unity_art/starter-coast-pilot-walk.fbx" \
  "$unity_art/starter-coast-pilot-run.fbx"
