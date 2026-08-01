# Unity Phase 1 — vertical-slice acceptance contract

## Visible slice

The slice is `ch1_m1`, **FIRST FLIGHT**:

1. Launch the authored Kestrel at Breakwater.
2. Fly five navigation gates in the original campaign positions, converted to
   Unity handedness.
3. Destroy three practice drones with inherited-aircraft gunnery.
4. Return within 420 metres of Breakwater Field.

The gameplay camera is a third-person chase camera. The HUD must show objective,
speed, altitude, burner fuel, rounds fired, and a central aiming mark. The
Kestrel and Starter Coast LOD1 must preserve their authored silhouette and
metre scale at gameplay distance.

## Asset contract

| Asset | Class | Source | Runtime slice budget |
|---|---|---|---:|
| Kestrel Mk1 v3 | Rigid aircraft | `.blend` | Authored LOD0, ≤4 MiB textures |
| Starter Coast world v2 LOD1 | Rigid world | `.blend` | 32,044 triangles, ≤8 MiB terrain textures |
| Practice drone | Rigid aircraft | Story kit | Simplified collider separate from render mesh |
| Navigation gate | Rigid/VFX prop | Runtime prefab | Trigger collider separate from render mesh |

The reproducible FBX audit is stored in `docs/data/unity-fbx-audit.json`:
Kestrel 22,044 triangles, world LOD1 32,044 triangles, and practice drone 50
triangles. The gate is a 512-triangle code-native torus matching the browser
runtime’s 32×8 `TorusGeometry`; it is not replacement aircraft or world art.

Use `Airbourne-Arena/source/scripts/export-unity-assets.sh` to regenerate FBX
inputs under the Unity project, then choose **Create or Refresh FIRST FLIGHT
Scene** in Unity. Gameplay coordinate data uses `(x,y,z) -> (x,y,-z)`;
Blender’s FBX exporter owns mesh-axis conversion.

No primitive aircraft, billboard aircraft, or alpha-cut structural world mesh
is an acceptable fallback. A missing authored prefab blocks the scene bootstrap
with an explicit error.

## Performance and download gates

- Mid-range laptop: sustained 60 fps at 1920×1080.
- Recent phone browser: sustained 30 fps at its native viewport.
- Initial WebGL payload: no more than 25 MiB Brotli-compressed.
- URP, high managed stripping, data caching, no HDRP.
- Rigidbody response disabled for flight; colliders are hit/trigger queries
  only.

## Automated gates

From the repository root:

```sh
npm --prefix Airbourne-Arena/source run test:unity
npm --prefix Airbourne-Arena/source run unity:flight-check
dotnet run --project Airbourne-Arena/UnityProject/Tools/FlightParity/FlightParity.csproj \
  -- docs/data/flight-golden.json
```

In Unity, run Edit Mode tests and require `FlightGoldenTests` to pass. Then
complete `FIRST FLIGHT` in a development WebGL build and validate the build
payload from **Airbourne Arena → Validate Last WebGL Build**.

## Current gate state

Repository-side C# parity and authored Kestrel FBX export pass. Unity Editor is
not installed in the current workspace, so scene compilation, actual WebGL
render inspection, mission completion, frame-rate measurement, and compressed
payload measurement remain pending. They must not be marked complete based on
source inspection alone.
