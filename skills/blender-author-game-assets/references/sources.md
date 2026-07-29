# Research sources and licensing

This skill paraphrases durable principles. It does not reproduce books or manuals.

## Current authoritative sources

- Blender Manual: <https://docs.blender.org/manual/en/latest/>
  - Scope: current UI concepts, mesh/UV/armature workflows, Principled BSDF, glTF exporter behavior.
  - License: CC BY-SA 4.0 as stated by the manual.
- Blender Python API: <https://docs.blender.org/api/current/>
  - Scope: `bpy`, `bmesh`, data blocks, operators, and automation behavior.
- Khronos glTF 2.0 registry: <https://registry.khronos.org/glTF/>
  - Scope: normative GLB/glTF structure, materials, skins, animation, extensions.
  - Specification source is published for remixing under CC BY 4.0.
- Khronos glTF Tutorial: <https://github.khronos.org/glTF-Tutorials/gltfTutorial/>
  - Scope: approachable explanations of buffers, meshes, animation, materials, and skinning.

## Open-book source

- Blender 3D: Noob to Pro, Wikibooks:
  <https://en.wikibooks.org/wiki/Blender_3D%3A_Noob_to_Pro>
  - License: CC BY-SA.
  - Used only for progressive teaching structure and exercise-based learning.
  - The book itself warns that much version-specific instruction is obsolete. Never use it as authority for current shortcuts, Blender Game Engine workflows, UI locations, or exporter behavior.

## Source-selection rule

For version-sensitive behavior, prefer the manual matching the installed Blender version. For GLB validity, prefer Khronos. Use community/open books for mental models and pedagogy only. Record the Blender version used to create every production asset.
