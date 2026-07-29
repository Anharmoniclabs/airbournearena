# Asset-authoring curriculum

## Contents

1. Foundations
2. Hard-surface production
3. Architecture and terrain
4. Materials and UVs
5. Characters and animation
6. Runtime delivery
7. Mastery exercises

## 1. Foundations

Teach transforms, coordinate spaces, object/data separation, origins, parenting, collections, modifiers, edit/object/pose modes, normals, manifold geometry, and real-world scale. Require learners to diagnose an intentionally broken mesh before creating a polished one.

Exit test: produce a dimensionally accurate prop with applied transforms, intentional shading, clean naming, and a reproducible export.

## 2. Hard-surface production

Teach silhouette-first blockout, reference planes, orthographic/profile checks, bevel width as physical scale, weighted normals, booleans followed by topology cleanup, panel separation, and modular subassemblies. Distinguish geometry detail from normal/decal detail.

Aircraft exercise: build fuselage, lifting surfaces, control surfaces, canopy, intakes, exhausts, landing gear, and faction panels as purposeful components. Review from the actual chase camera, not only a beauty angle.

## 3. Architecture and terrain

Teach modular grids, floor heights, doors as human-scale references, facade bays, roof/parapet/HVAC kits, trim sheets, instancing, LODs, terrain grading, road splines/ribbons, intersections, foundations, and collision proxies.

District exercise: author one operations building, factory, barracks, bunker, and service kit; assemble a connected road plan; reject roads through lots, floating foundations, repeated baked buildings, and texture stretch.

## 4. Materials and UVs

Teach seam placement, projection choice, island orientation, stretch inspection, texel-density targets, padding, mirrored/stacked islands, trim sheets, decals, tangent-space normals, color space, and metal/rough PBR.

Use a checker map before art. A high-resolution texture cannot repair a bad unwrap.

## 5. Characters and animation

Teach deformation topology, armature hierarchy, local bone axes, bind/rest pose, weight normalization, influence limits, corrective work, Actions, NLA, in-place locomotion, root motion, transition clips, and extreme-pose testing.

Character exercise: export Idle, Walk, Run, TurnLeft, TurnRight, Start, and Stop; verify planted feet and joint volumes in the engine.

## 6. Runtime delivery

Teach evaluated geometry, triangulation cost, seam-induced vertex splits, material/draw-call cost, texture memory, mipmaps, GLB structure, compression tradeoffs, loader compatibility, and runtime lighting differences.

Require both a Blender preview and a same-camera engine capture.

## 7. Mastery exercises

- Repair a stretched facade without changing its visible dimensions.
- Convert a blocky aircraft into a coherent silhouette while holding a triangle budget.
- Replace scattered buildings with a modular district and collision proxies.
- Diagnose a GLB whose material, scale, or animations differ from Blender.
- Build an idempotent `bpy` generator, run it twice, and prove identical outputs.
