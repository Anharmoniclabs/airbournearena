# Porting Airbourne Arena to Unity WebGL

A build plan grounded in what this repository actually contains, measured on
2026-07-30 against `main` at `419d968`.

The strategic advice is sound: **Unity WebGL, not Unreal Pixel Streaming.** Unity
ships a WebAssembly target that runs on the player's device; Pixel Streaming runs
the game on a GPU server you rent by the minute and streams video back. For a
free browser game that expects unknown traffic, a per-player GPU bill is
disqualifying, and flight controls are the genre least tolerant of stream
latency. Keep Unreal in mind for a trailer, not for the game.

What follows corrects five specifics that generic advice gets wrong about *this*
codebase, then lays out the work.

---

## 1. What the repo actually is

| | |
|---|---|
| Shipped game | `Airbourne-Arena/index.html`, 8,264 lines, assembled from 66 parts in `src/` |
| Engine | three.js r128, vendored (`assets/three-r128.min.js`) |
| Script volume | 7,202 lines in one shared scope, 627 top-level names |
| Campaign | 32 missions across 6 chapters, 1,226 lines, **declarative** |
| Assets | 79 MB — 15 GLB (35 MB), 50 WebP (33 MB), 9 PNG (11 MB) |
| Authoring | 7 `.blend` files + 13 Blender Python scripts, schema-versioned asset contract |
| Netcode | **none** |
| Backend | Cloudflare Worker stub, `db/schema.ts` intentionally empty |
| Save | `localStorage`, two JSON keys (`airbourne:pilot`, `airbourne:settings`) |

## 2. Five corrections to the generic plan

### 2.1 Mission logic does not need rebuilding — mission *runtime* does

This is the most valuable finding in the scan. The 32 missions are not
imperative code. They are data structures that call a **25-function API**, and
nothing else. Measured call counts across the six chapter files:

```
say 144   addRep 77   spawnFlier 48   hostilesLeft 33   addUnity 32
convoyAlive 24   makeSite 22   sitesLeft 16   addTrust 12   convoyArrived 11
gatesLeft 9   factionKey 9   allWorked 7   sitesWorked 6   sitesToWork 6
openChoice 6   makeGate 5   distanceTo 5   stepCore 4   namedFlier 3
toCampaignHangar 2   saveGame 2   decideEnding 2   banner 2   radioBusy 1
```

A mission looks like this — `src/game/42-chapter-2.js`, verbatim:

```js
M({chapter:2, id:'ch2_m1', title:'TOWER RAID', next:'ch2_m2',
  brief:'Black Wing drones are working the Skyway navigation masts. Hold the towers.',
  intro:function(){
    say('MARA','Three navigation masts are being worked over at once. That is not opportunism.',4.6);
  },
  objectives:[
    {text:function(){return 'DRIVE THE DRONES OFF THE MASTS ('+hostilesLeft()+' LEFT)';},
     setup:function(){
       makeSite({at:new THREE.Vector3(-900,0,-1500),kind:'mast',hold:4,holdR:340,name:'MAST NORTH'});
       for(var i=0;i<5;i++)
         spawnFlier({at:new THREE.Vector3(rnd(-1200,1600),rnd(650,900),rnd(-1600,1600)),
           hostile:true,hp:54,speed:106,name:'RAIDER'});
     },
     done:function(){return hostilesLeft()===0;}}
  ],
  reward:function(){addRep('civilian',12); addUnity(3); SAVE.credits+=700;}});
```

Implement those 25 primitives as C# and the entire campaign — every objective,
every radio line, every spawn position, every reputation delta, all six endings —
transfers as content. **Budget the 25 primitives, not the 32 missions.**

The catch is the ~98 hardcoded `Vector3` literals in the chapter files. See §2.4.

### 2.2 There is no multiplayer to port

Generic plans list "multiplayer code" as rebuild work. This game has none.
`grep -rlE "WebSocket|socket\.io|RTCPeer|multiplayer" src/` returns nothing. The
4v4 arena is the player plus three AI wingmen against four AI opponents. The
Cloudflare Worker is a stub and `db/schema.ts` is an empty export by design.

Netcode is **new scope**, not port scope. Do not let it into the vertical slice.

### 2.3 Do not replace the flight model with Unity physics

The flight model is 249 lines with **11 three.js references**. It is essentially
pure math already:

```js
var THRUST=16.0;       // max thrust acceleration (T/W ~0.5)
var DRAG_K=0.00032;    // parasitic drag
var LIFT_K=0.00284;
var CL_A=5.2, CL0=0.06, A_CRIT=0.30;
var G_LIMIT=9.0;       // structural limit — sets the sustained turn radius
var PITCH_RATE=1.85, ROLL_RATE=5.6, YAW_RATE=0.60, STAB=1.9;
var AB_THRUST=1.85, AB_DRAIN=1/5.0, AB_RECHARGE=1/8.0, AB_COOL=0.9;
```

This is a **translation job, not a rebuild** — the riskiest thing you could do is
hand it to `Rigidbody` and `AddForce`. The entire feel of the game is a custom
velocity-vector integration with angle-of-attack driving a lift curve, a stall
past `A_CRIT`, and rounds that inherit aircraft velocity. Unity's solver will not
reproduce that, and "physics behaves differently now" is unfixable by tuning.

Port it as a plain C# class stepped from `FixedUpdate`, with a
`Rigidbody.isKinematic = true` transform, or no Rigidbody at all. Use Unity
colliders for *hit detection only*, never for flight response.

Same argument, smaller stakes, for the AI: 169 lines, **1** three.js reference.
Nearly free to port.

| Part | Lines | three.js refs | Portability |
|---|---|---|---|
| `21-flight-model.js` | 249 | 11 | translate as-is |
| `25-ai.js` | 169 | 1 | translate as-is |
| `06-arena.js` (terrain math) | 100 | 4 | translate as-is |
| `23-state.js` | 109 | 5 | translate as-is |
| `27-gunnery.js` | 231 | 12 | translate, keep the solver |
| `49-loop.js` | 605 | 9 | **discard** — becomes Unity's update order |

### 2.4 Handedness will silently corrupt every coordinate

three.js is **right-handed**. Unity is **left-handed**. Y is up in both, so the
error does not look like an error: the world loads, the aircraft flies, and
everything is mirrored through the Z axis. Half the missions will spawn hostiles
behind the player instead of ahead.

This touches:

- ~98 `Vector3` literals in the chapter files
- `BASES`/`GOALS` at ±2500 X
- `CONSTRUCTION_PADS`, `LAND_LOBES`, `SITE_PLATEAUS` in `06-arena.js`
- every `path:[...]` waypoint list

GLB importers apply the flip to *geometry* automatically. They do not touch your
hand-written gameplay coordinates. Decide the convention once, write it into the
asset contract, and convert during the data extraction in Phase 0 — not by hand,
per mission, later.

### 2.5 The Blender pipeline is the strongest asset, and it is scripted

Generic advice says "reuse map layout and textures." The reality is better. This
repo has:

- `source-assets/blender/starter-coast-asset-contract.json` — schema-versioned,
  `"units": "meters"`, `"up_axis": "Y"`, `"format": "GLB"`, with per-zone
  `required_geometry` and named layout zones at fixed coordinates
- 13 Python scripts that **generate** the models (`build_kestrel_mk1.py`,
  `build_starter_coast_world_v2.py`, `build_kestrel_lods.py`)
- `validate_asset_contract.py` plus two audit scripts

The models are **regenerable**, not merely reusable. A Unity target does not need
a conversion pass — it needs a second export path in scripts that already exist.
Re-export FBX, or adjust scale/pivot/LOD thresholds for Unity, by editing a build
script rather than by hand-fixing 15 GLB files.

LOD and collision meshes are already authored: `vanguard-interceptor-v4.glb` +
`-lod1.glb` + `-collision.glb`, and the same for `kestrel-mk1-authored-v2`. That
is work you would otherwise be doing in month three.

**Extend the contract with a `unity` runtime block. Do not fork it.**

---

## 3. The real constraint: download size

This is where browser ports die, and the number is not close.

| | Size |
|---|---|
| Current asset tree | **79 MB** |
| Unity 6 WebGL engine + wasm, Brotli, URP, stripped | ~10–15 MB |
| Comfortable first-load budget for a free game | **15–25 MB** |
| Vertical-slice assets (Kestrel v3 + world LOD1 + 3 core textures) | **8.0 MB** |

Two hard consequences:

**Unity cannot import WebP.** All 50 WebP files (33 MB) need converting to PNG or
TGA for import, then re-compressing to a GPU format (ASTC for mobile-class, DXT
for desktop) on the Unity side. Do this as a scripted step, not by hand. The
diffusion-generated 4K atlases are the worst offenders — `kestrel-mk1-tileable-albedo-diffusion-v2.png`
alone is 3.0 MB and most of these should ship at 1K–2K for a browser build.

**The full world cannot be a single first load.** Plan for: vertical slice as the
initial download, then Addressables with remote content on a CDN, loaded per
region and per chapter. The existing procedural terrain and the authored-world
fallback in `16-authored-world.js` are a good model for what streams and what
must be resident.

---

## 4. Build stages

### Phase 0 — Extract, in this repo, before Unity is installed

Highest leverage work, and none of it needs a Unity licence. Everything here is
mechanical, testable, and de-risks the port permanently.

1. **Export the 32 missions to engine-neutral JSON.** Load `src/game/4*-chapter-*.js`
   in Node with the 25 primitives stubbed as recorders, run the registrations,
   and serialize. Emit `docs/data/missions.json` with a declared axis convention
   and Z already flipped. Callbacks (`intro`, `done`, `reward`) serialize as
   primitive-call sequences, not as code.
2. **Extend the asset contract** with a `unity` runtime block: target format,
   scale, handedness, LOD thresholds, texture budget per class.
3. **Write the flight model spec** — the constants above plus the integration
   order, as prose and a table, so the C# port is checkable rather than
   guessable.
4. **Script the texture conversion** — WebP → PNG at target resolutions, with a
   size report per asset class.
5. **Add a golden-values test** capturing flight model output for a fixed input
   sequence (throttle/stick over 10 seconds → position/velocity/AoA samples).
   This is the only way to prove the C# port matches. Run the same sequence in
   Unity and diff.

Step 5 matters more than it looks. Without it, "does the new one fly like the old
one?" is answered by opinion.

### Phase 1 — Unity vertical slice

One aircraft (Kestrel), one arena, one enemy type, guns + the burner, the HUD's
gunnery solver, one mission (`ch1_m1`, FIRST FLIGHT). URP, not HDRP. Target:
runs in a browser at 60 fps on a mid-range laptop and 30 on a recent phone, under
25 MB first load.

Gate: **the golden-values test passes** and `ch1_m1` is completable. Do not
proceed while the aircraft feels different.

### Phase 2 — Systems transfer

The 25 mission primitives, the AI state machine, damage, the core objective,
weather, day/night, the campaign registry and progression (reputation, rival
trust, unity score, six endings). Load `missions.json` from Phase 0. At the end
of this phase all 32 missions should run, even if the world is still placeholder.

### Phase 3 — World and art

Regenerate assets from the Blender scripts against the extended contract.
Addressables, streaming per region, baked lighting, reflection probes, LOD
groups, particle-based explosions and contrails. This is where the visual upgrade
actually comes from — assets and lighting, not the engine badge.

### Phase 4 — Ship both targets

Same project, two build configs: `Airbourne Arena Web` (WebGL, URP, reduced
textures) and `Airbourne Arena Enhanced` (Windows/iOS/Android, full textures).
Keep gameplay code identical; vary quality settings and packaging only.

---

## 5. Keep the current game alive

Do not delete or freeze the HTML version. It is:

- the **reference implementation** — the only definition of correct feel
- the **fallback** that plays instantly with no 25 MB download
- the **contract source** the Blender pipeline already validates against

The `src/` split done in `4c3f383` makes it a usable specification rather than a
monolith to squint at: 66 parts, one system each, and `src/manifest.txt` records
the dependency order. Port from `src/`, part by part, and track progress against
that file list.

## 6. What not to do

- **Do not port `49-loop.js`.** 605 lines of hand-rolled frame ordering. Unity's
  update phases replace it. Read it for ordering intent, then throw it away.
- **Do not translate the monolith line by line.** Port system by system from
  `src/`, with the golden-values test as the acceptance gate.
- **Do not start with the full 32-mission campaign or the whole island.**
  Vertical slice first.
- **Do not add netcode during the port.** It is new scope wearing a port's
  clothes.
- **Do not use HDRP.** It will not hit a browser budget.
- **Do not let Unity physics own the flight model.** See §2.3.

## 7. Honest cost

The reusable fraction is unusually high for a port — the campaign is data, the
flight model is math, and the art is script-generated against a formal contract.
What genuinely gets rebuilt is the runtime: rendering, input, UI, the frame loop,
collision, and the 25 primitives the mission data leans on. Roughly 3,000 of the
7,202 script lines are logic worth translating; about 1,500 are three.js-specific
scene construction that Unity replaces outright; the campaign's 1,226 lines
transfer as data.

Phase 0 is days. Phase 1 is the one to schedule honestly — a flight model that
feels right is the whole game, and it is the phase where an engine port is
usually abandoned.
