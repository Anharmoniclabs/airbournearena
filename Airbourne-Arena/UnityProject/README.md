# Airbourne Arena Unity WebGL

Unity 6 URP vertical-slice project. Open this directory directly in Unity Hub.

## Current slice

- The flight simulation is a plain C# translation of the three.js reference.
- The Unity adapter flips Z only when publishing state to a `Transform`.
- `FIRST FLIGHT` includes its five gates, three practice targets, guns, return
  objective, chase camera, and compact HUD.
- Navigation gates accept swept traversal in any order, matching the browser
  runtime. Projectile tracers inherit aircraft velocity and the HUD solves a
  lead point for the nearest practice target.
- Scene bootstrap accepts authored prefabs only. It stops with an explicit
  error if the Kestrel, world LOD1, drone, or gate art is not assigned.
- Rigidbody response is disabled; colliders are used only for trigger and
  gunnery queries.

## First editor setup

1. Run `../source/scripts/export-unity-assets.sh` to export the authored Kestrel
   and world source scenes into `Assets/Art/Generated`.
2. Choose **Airbourne Arena → Create or Refresh FIRST FLIGHT Scene**. This
   creates the authored prefab variants, code-native torus gate, lighting,
   chase camera, HUD, scene, and enabled build-scene entry deterministically.
4. Run Edit Mode tests. `FlightGoldenTests` must pass.
5. Choose **Airbourne Arena → Configure WebGL**, then build.
6. Choose **Validate Last WebGL Build**. The initial payload must remain below
   25 MiB.

Headless build after the scene is committed:

```sh
Unity -batchmode -quit -projectPath Airbourne-Arena/UnityProject \
  -executeMethod AirbourneArena.Editor.WebBuild.BuildFromCommandLine
```

Repository-side checks:

```sh
npm --prefix Airbourne-Arena/source run test:unity
npm --prefix Airbourne-Arena/source run unity:flight-check
dotnet run --project Airbourne-Arena/UnityProject/Tools/FlightParity/FlightParity.csproj \
  -- docs/data/flight-golden.json
```

The Editor/browser render, mission completion, 60 fps laptop, 30 fps recent
phone, and first-load gates remain pending until Unity is installed and the
authored prefabs have been reviewed in the actual WebGL player.
