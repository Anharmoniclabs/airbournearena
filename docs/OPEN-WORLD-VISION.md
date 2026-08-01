# Airbourne Arena — Sky-to-Ground World Plan

## Player promise

The player begins at their faction's independent ozone-layer sky base, launches into continuous flight, descends through the weather layer to Starter Coast, lands, exits the aircraft, scavenges or accepts missions, and can return to the aircraft or base. Arena Core 4v4 and ground-combat modes are activities inside this world rather than separate unrelated games.

## Runtime architecture

The experience is a world stack with explicit handoffs:

1. **Ozone bases** — a near-origin high-altitude scene band containing the selected faction base at full detail and the other two at LOD distance.
2. **Descent corridor** — flight remains continuous while the renderer changes atmosphere, LOD priorities, and active mission entities.
3. **Starter Coast open world** — the existing authored island, city, roads, airfields, structures, and lower-city salvage loop.
4. **Activity instances** — Arena Core 4v4, campaign missions, races, convoy defense, salvage, and future ground combat activate only their entities and rules while sharing the same terrain and player profile.

The first implementation compresses the real ozone altitude into the engine's established 24 km flight envelope. A later origin-rebasing pass can widen horizontal travel without changing authored asset coordinates.

## Phase plan

### Current playable vertical slice

- Ozone deck spawn, on-foot operations access, aircraft boarding, and launch are implemented.
- Launch enters a seven-second atmospheric insertion route and returns full control above the lower city.
- Crashyard, Civic Collapse, and Flooded Works are named LOD districts with rigid landmarks, extraction pads, navigation beacons, instanced debris, and minimap markers.
- Surface landing, auto-land, pilot dismount, salvage, Ground War combat, return-to-aircraft, and extraction are implemented.
- The production Blender world remains the terrain and architecture source; district dressing is a separate performance-bounded procedural layer.

### Phase 0 — Visual and technical contract

- Approved concept: `Airbourne-Arena/source-assets/concepts/sky-bases-ozone-concept-v1.png`.
- Three distinct faction silhouettes and palettes.
- Blender source plus LOD0, LOD1, and collision GLBs.
- No image plane or billboard is used as base geometry.

### Phase 1 — Sky-base vertical slice

- Load all three authored bases through the existing r128 `GLTFLoader`.
- Start Open World from the briefing card.
- Spawn at the player's faction base and descend into Starter Coast.
- Keep the existing Arena Core launch unchanged.
- Add base landing volumes, deck contact, hangar entry, and launch rails next.

### Phase 2 — World streaming and mission director

- Split world content into always-on terrain/navigation, district render sets, and activity entity sets.
- Use distance-based `THREE.LOD` for hero assets and `THREE.InstancedMesh` for repeated props.
- Preload the next district during flight; unload mission-only enemies and effects after completion.
- Add an activity registry with `enter`, `step`, `complete`, `fail`, and `exit` lifecycle methods.

### Phase 3 — Open-world loop

- Sky base → launch → descend → choose landing zone → land → exit.
- Scavenge parts, health, and armor; secure parts at a faction base.
- Mission terminals and radio calls offer campaign, races, convoy defense, patrols, and Arena Core.
- Persistent inventory, faction reputation, aircraft damage, and secured parts.

### Phase 4 — Ground war mode

- Build on the existing real skinned pilot GLB and animation mixer.
- Add a grounded capsule controller, weapon handling, cover/interaction queries, enemy rigs, hit reactions, and network authority.
- Do not ship this as a primitive mannequin or reuse aircraft hit logic for infantry.

### Phase 5 — Multiplayer activities

- Keep Arena Core 4v4 as the first networked activity.
- Add explicit server-authoritative activity membership and replication budgets.
- Ground combat requires a separate infantry snapshot schema and anti-cheat validation before public matchmaking.

## Performance budgets

| Asset / system | Desktop | Mobile |
|---|---:|---:|
| Sky base LOD0 | ≤ 80k triangles, ≤ 12 draws | selected base only |
| Sky base LOD1 | ≤ 20k triangles, ≤ 6 draws | all distant bases |
| Base textures | ≤ 32 MB GPU | ≤ 12 MB GPU |
| Active world districts | 3 | 2 |
| Repeated props | instanced | instanced, reduced density |
| Target frame time | 16.7 ms | 33.3 ms |

The current authored bases are deliberately below these budgets, leaving room for a later detail pass and tiled faction materials.

## Acceptance gates

- Each base is identifiable in silhouette without color.
- The selected base deck reads at aircraft, hangar, and distant flight cameras.
- Launch-to-ground transition has no teleport, black frame, or missing terrain.
- Ground and sky-base collisions use simplified bodies separate from render meshes.
- Existing Arena Core, campaign, hangar, mobile controls, and Pages build remain functional.
- Desktop and mobile frames are visually inspected before publication.

## Primary technical references

- Three.js `GLTFLoader`: https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- Three.js `LOD`: https://threejs.org/docs/#api/en/objects/LOD
- Three.js `InstancedMesh`: https://threejs.org/docs/#api/en/objects/InstancedMesh
- Khronos glTF `EXT_mesh_gpu_instancing`: https://registry.khronos.org/glTF/extensions/EXT_mesh_gpu_instancing/
- Blender glTF 2.0 exporter: https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html
