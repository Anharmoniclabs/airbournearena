---
name: blender-author-game-assets
description: Author, repair, optimize, export, and validate production game assets with Blender and Python. Use for Blender .blend source files, GLB/glTF meshes, hard-surface aircraft and vehicles, modular buildings, terrain kits, UVs, PBR materials, LODs, collision meshes, armatures, skin weights, animation clips, baking, procedural bpy/bmesh authoring, or Blender-to-WebGL/Three.js asset pipelines.
---

# Blender Game Asset Authoring

Produce a source `.blend`, an optimized runtime `.glb`, and evidence that the runtime asset works. Treat Blender renders as authoring previews; the engine render is the final truth.

## Start with an asset contract

Record:

- asset class: rigid prop, modular architecture, terrain, vehicle, or skinned character
- visual target, silhouette, real-world dimensions, camera distance, and story/faction identity
- engine axes, units, origin, pivots, collision needs, and animation names
- desktop/mobile triangle, material, texture-memory, draw-call, and file-size budgets
- required source, runtime, audit, and rendered-review artifacts

Read [references/asset-curriculum.md](references/asset-curriculum.md) when teaching or planning a learning path. Read [references/blender-runtime-pipeline.md](references/blender-runtime-pipeline.md) before authoring or exporting. Read [references/airbourne-arena-contract.md](references/airbourne-arena-contract.md) for this repository.

## Choose the correct production path

### Rigid props, buildings, and aircraft

1. Block out at final scale and inspect silhouette from gameplay cameras.
2. Apply transforms before bevel, weighted-normal, UV, and export work.
3. Build primary and secondary forms in geometry. Use textures for surface detail, not structural silhouette.
4. Keep render meshes, collision meshes, sockets, and LODs separate and predictably named.
5. Mark intentional hard edges and UV seams. Unwrap by material/surface logic.
6. Establish texel density before packing. Do not stretch a square image across a runway or facade.
7. Use glTF-compatible Principled BSDF materials.
8. Triangulate deliberately or inspect exporter triangulation before accepting topology.

### Skinned characters

1. Require a coherent mesh, armature, bind pose, normalized weights, UVs, materials, and named clips.
2. Build topology for shoulder, elbow, wrist, hip, knee, ankle, neck, and face deformation.
3. Use automatic weights only as a starting point; inspect extreme poses and repair weights manually.
4. Keep no more than four meaningful joint influences per vertex for common web runtimes.
5. Export Idle, Walk, Run, starts, stops, turns, and interactions as Actions/NLA clips.
6. Reject sliding feet, collapsed joints, T-poses, detached parts, and clips whose speed disagrees with controller velocity.

Never claim that diffusion imagery creates topology, depth, rigging, weights, or animation. Use generated imagery as concept art, decals, or texture input on a complete UV-mapped mesh.

## Automate reproducibly

- Prefer deterministic `bpy`/`bmesh` scripts for repeated modular geometry, naming, material slots, collections, and exports.
- Make scripts idempotent: clear or target their own collection, use stable names, and avoid selection-dependent operators where data API access exists.
- Save the `.blend` before export.
- Run Blender headlessly with an explicit version and script:

```bash
blender --background asset.blend --python build_or_export.py
```

- Use `scripts/audit_gltf.py` after every GLB/glTF export.
- When Blender is available, run `scripts/blender_scene_preflight.py` inside Blender before export.

## Export GLB

Export only the intended collection/objects. Include UVs, normals, tangents when normal maps require them, materials, skins, and named animations as applicable. Convert curves and procedural objects to supported evaluated meshes. Avoid unsupported shader graphs and material animation.

Use GLB for a single deployable artifact. Remember that glTF triangulates quads/ngons and may split vertices at UV seams, hard normals, and material boundaries; budget the exported asset, not Blender’s displayed vertex count.

## Validate in layers

1. Run Blender scene preflight.
2. Export GLB and run:

```bash
python3 scripts/audit_gltf.py path/to/asset.glb
```

3. Verify expected meshes, materials, textures, skins, and animation clip names.
4. Inspect front, rear, profile, three-quarter, close, and gameplay-distance renders.
5. Load through the actual engine loader and inspect console errors.
6. Test desktop and mobile viewport classes.
7. Measure runtime triangles, draw calls, GPU texture memory, frame time, and download size.

Reject technically valid exports with broken silhouettes, missing color, stretched UVs, inverted normals, z-fighting, floating structures, implausible scale, or animation defects.

## Preserve and publish

Keep the last acceptable live asset until the replacement passes. Commit `.blend`, authoring scripts, textures with provenance, runtime GLB, and audit evidence when the repository policy expects them. Publish only after inspecting the deployed engine render.

## Research discipline

Use current official Blender documentation and the Khronos glTF specification for version-sensitive facts. Use openly licensed books only for durable concepts and teaching progression; do not copy their prose or inherit deprecated shortcuts. Consult [references/sources.md](references/sources.md) for source scope and licenses.
