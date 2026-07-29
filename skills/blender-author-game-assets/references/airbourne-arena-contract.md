# Airbourne Arena Blender contract

- Preserve story-bible canon and faction identity.
- Treat `Airbourne-Arena/source-assets/blender/` as Blender source and script storage.
- Keep runtime GLBs in both `Airbourne-Arena/assets/` and `Airbourne-Arena/source/public/assets/`.
- Treat `Airbourne-Arena/index.html` as canonical and synchronize `Airbourne-Arena/source/public/case-run.html`.
- Use real mesh silhouette for aircraft, buildings, roads, hangars, and terrain structures.
- Never use a billboard or primitive mannequin as a production character.
- Keep generated images as concept/texture inputs; they do not create geometry or rigs.
- Use separate collision bodies from visual mesh detail.
- Keep roads continuous and terrain-conforming; reserve building footprints around them.
- The runtime currently uses Three.js r128. Do not enable Draco, Meshopt, KTX2,
  or newer glTF material extensions until matching loaders/decoders are wired
  and verified in both canonical and deployed builds.
- Validate desktop hangar, desktop flight, mobile hangar, and mobile flight when supported.
- Run inline JavaScript parsing and Node tests before publishing.
- Preserve the last acceptable live deployment until all rendered gates pass.
