# Blender-to-runtime pipeline

## Contents

1. Scene conventions
2. Geometry
3. UV and materials
4. Rigging and animation
5. Export
6. Runtime review

## 1. Scene conventions

- Use meters unless the target engine explicitly requires another unit.
- Define forward/up axes and test them with a minimal export.
- Put pivots where gameplay rotates or attaches the asset.
- Name collections by purpose: `RENDER`, `COLLISION`, `SOCKETS`, `LOD`.
- Name materials by physical role, not temporary color.
- Keep generated objects under one script-owned collection.

## 2. Geometry

- Apply scale before bevel widths, physics, and export.
- Resolve duplicate vertices, zero-area faces, non-manifold boundaries, and inverted normals.
- Use smooth shading with controlled hard edges; do not hide broken topology with indiscriminate smoothing.
- Inspect evaluated modifier output and exported triangle counts.
- Build simplified collision independently from render detail.

Suggested naming:

- `asset__body__lod0`
- `asset__body__lod1`
- `asset__collision`
- `asset__socket_muzzle`

## 3. UV and materials

- Mark seams where real assemblies split or where discontinuity is least visible.
- Use checker textures to identify stretch before painting.
- Set a project texel-density target by camera distance and platform.
- Give long surfaces tiled/trim UVs; unique unwrap hero surfaces.
- Use Base Color, Metallic, Roughness, Normal, AO, and Emissive channels that the target exporter/runtime supports.
- Pack metallic/roughness/AO only according to the runtime’s documented channel convention.
- Use sRGB for color/emissive; use non-color data for normal, roughness, metallic, and AO.

## 4. Rigging and animation

- Freeze a stable rest pose before weighting.
- Keep joint names stable after animation begins.
- Normalize weights and inspect vertices with excessive influences.
- Test shoulders, elbows, hips, knees, and ankles at extreme useful poses.
- Keep clip ranges and names explicit.
- Decide in-place versus root-motion locomotion before animating.

## 5. Export

- Export selected objects/collection only.
- Convert unsupported procedural data to evaluated mesh output.
- Include normals and UVs; include tangents when normal maps require them.
- Export Actions/NLA clips intentionally and inspect the resulting clip list.
- Confirm images are embedded or deployed beside the glTF as intended.
- Prefer `.glb` for a single web-delivery artifact.

## 6. Runtime review

- Compare scale, orientation, silhouette, and material response to Blender.
- Inspect under bright and dark runtime lighting.
- Exercise LOD changes and animation transitions.
- Check console/network errors and missing textures.
- Record file size, meshes, primitives, triangles, materials, textures, skins, clips, and approximate texture memory.
- Reject the asset when engine output differs materially from the accepted Blender preview.
