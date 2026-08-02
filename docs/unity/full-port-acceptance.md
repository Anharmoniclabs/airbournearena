# Airbourne Arena Unity port acceptance contract

Status: implementation in progress. The canonical source is
`Airbourne-Arena/index.html` assembled from `Airbourne-Arena/src/manifest.txt`.
The existing Unity vertical slice is not a substitute specification.

## Non-negotiable parity

| Area | Canonical HTML source | Unity owner | Acceptance evidence |
|---|---|---|---|
| Flight physics | `21-flight-model.js` | `FlightModel` | Golden 10-second state trace matches position, velocity, speed, alpha and G load |
| Pilot control law | `21-flight-model.js`, `49-loop.js` | `FlightControlSolver`, `PlayerFlightController` | Keyboard banks and pulls into an altitude-holding turn; mouse/gamepad steer toward the reticle; Q/E barrel rolls |
| Camera | `49-loop.js::camWork` | `ChaseCamera` | Three C-key modes, bank pivot, world-up chase height, altitude map reveal and smooth FOV |
| Input | `28-gamepad.js`, `31-input.js` | input adapters | Keyboard, pointer-lock mouse, uncaptured mouse, standard gamepad and touch all drive the same pilot intent |
| Aircraft | `20-pilot.js` | aircraft prefab/LOD/material pipeline | Vanguard LOD0/LOD1 authored meshes, faction material rules, energy channels, collision and exhaust; no billboard or procedural fallback in a passing build |
| World | `08-assets.js`, `16-authored-world.js` | Starter Coast scene | Full 163,060-triangle LOD0 on desktop; 32,044-triangle LOD1 quality tier; authored material-name mapping, textured ocean and fog |
| Combat | `22-bullets.js`, `25-ai.js`, `27-gunnery.js` | combat runtime | Projectile ballistics, lead solution, lock/target cycling, damage systems, AI skill, barrel-roll evasion and feedback match canonical behavior |
| Arena rules | `06-arena.js`, `10-objectives.js`, `24-core-rules.js`, `29-rematch.js` | arena state machine | 4v4 Core carrier/pass/score loop, clock, respawn and rematch work offline before network replication |
| HUD | `30-hud.js`, `50-targeting-hud.js` | Unity HUD | Speed, altitude, AoA/G, health, throttle, burner, score/time, target/lead, radio, objective, compass and map remain readable at 16:9 and mobile aspect ratios |
| Hangar | `33-hangar.js`, `34-hangar-characters.js` | hangar scene | Authored hangar/district, pilot rig animations, fit/selection, briefing board, free walk and campaign launch |
| Campaign runtime | `35`–`40` | mission interpreter | All exported callbacks execute through the 25-primitives contract with deterministic save/progression state |
| Campaign content | `41`–`46`, `docs/data/missions.json` | campaign catalog | All 32 missions, six chapters, dialogue, reputation/trust/unity, choices and all six endings are reachable |
| Settings/accessibility | `03`, `05`, `32`, `52` | settings service | Sensitivity, invert Y, motion reduction, quality, touch mode, pause and viewport scaling persist |
| Audio | `04-audio.js` plus events | audio service | Engine/burner, weapons, impacts, UI, radio and music mix react to game state and pause correctly |

## Campaign inventory

- Chapter 1: 10 missions, from FIRST FLIGHT through BLACKOUT.
- Chapter 2: 5 missions, TOWER RAID through THE FRAGMENT.
- Chapter 3: 4 missions, three faction operations and ACE HUNT.
- Chapter 4: 4 missions, FALSE FLAG through THE LEDGER.
- Chapter 5: 4 missions, RECLAIM through TASK FORCE.
- Chapter 6: 5 missions, THE CITY through THE WARDEN CORE.
- Total: 32 missions.

The Unity campaign loader must consume the generated neutral export rather than
maintaining a second hand-written story:

- `docs/data/missions.json`
- 25 runtime primitives listed by that file
- callback programs/expressions encoded in its AST
- coordinate conversion `(x, y, z) -> (x, y, -z)` applied exactly once

## Art and scene gates

- Source meshes remain in Blender/GLB; Unity consumes validated FBX exports.
- Every passing hero asset has a triangle/material audit and is rendered in an
  actual Unity frame.
- Terrain, ocean, roads/airbases, architecture, vegetation, aircraft, VFX, UI
  and character textures follow the budgets in
  `starter-coast-asset-contract.json`.
- No diffusion image may be presented as a billboard substitute for required
  three-dimensional gameplay geometry.
- Flight and hangar frames are visually inspected at target aspect ratio before
  a build is called a release candidate.
- Desktop and WebGL/mobile use explicit LOD/quality tiers.

## Multiplayer boundary

The online mode is a networked version of the proven arena rules, not a fork of
the flight model.

- Session size: 8 players, 4v4.
- Browser transport: secure WebSocket through Unity Relay.
- Replicated intent: input sequence, throttle/burner, fire/pass/target actions.
- Server simulation: fixed-tick flight, Core ownership, projectiles/hits,
  damage, score, respawn, clock and win state.
- Client presentation: interpolation, prediction/reconciliation, camera, HUD,
  local VFX and audio.
- Host migration/reconnect and join-code flows require explicit tests.
- Competitive release cannot call a client host cheat-resistant. A dedicated
  authoritative deployment is the release target; Relay host mode is for
  development and private matches.
- Live service launch requires the owner's Unity Gaming Services project,
  environment, service credentials and billing configuration.

## Release gates

1. All EditMode and PlayMode tests pass.
2. Every campaign mission has an automated start/complete/fail smoke test.
3. The rendered Unity flight and hangar comparison frames pass visual review.
4. WebGL initial payload is at most 25 MiB; later regions/chapters are remote
   content.
5. Target browser maintains the agreed frame-time budget under an 8-player
   combat load.
6. Two-browser, reconnect, packet-loss, late-join and full 8-player network
   tests pass.
7. No console errors, missing shaders/materials, placeholder hero assets or
   procedural aircraft fallback remain.
8. Save migration, settings persistence, all six endings and campaign reset
   are verified.

