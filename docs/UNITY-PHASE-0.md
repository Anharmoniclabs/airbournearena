# Unity Phase 0 deliverables

Phase 0 is reproducible without Unity:

- `docs/data/missions.json` contains all 32 campaign missions as an
  engine-neutral operation tree. Vector nodes are already converted to Unity
  handedness.
- `Airbourne-Arena/source-assets/blender/starter-coast-asset-contract.json`
  contains the Unity runtime, LOD, delivery, and per-class texture budgets.
- `docs/UNITY-FLIGHT-MODEL.md` defines flight integration order and parity.
- `prepare-unity-textures.mjs` inventories and resizes browser source textures
  into Unity-importable PNG intermediates. Planning is the default; `--write`
  performs conversion.
- `docs/data/flight-golden.json` is the ten-second reference flight.

From `Airbourne-Arena/source`, refresh and verify the artifacts with:

```sh
npm run unity:missions
npm run unity:textures
npm run unity:flight-check
node --test tests/unity-phase-zero.test.mjs
```

Run `npm run unity:textures:write` only when preparing the Unity import tree.
It writes generated files under `Airbourne-Arena/unity-import/textures`; Unity
then applies platform GPU compression. Generated PNGs are deliberately not
part of the browser game's first-load artifact.
