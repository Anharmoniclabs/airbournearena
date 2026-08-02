# Generated arena content

The AI Toolkit art drop — a new pilot suit, five weapons, three grenades, four
4v4 close-quarters decks, two airbase structures, the Airbourne Arena
masterplan and a set of props — and how it reaches the published game.

Everything here ships to GitHub Pages as part of the standalone game. The Unity
project the art was authored in is not deployed and is not the source of truth
for anything below; the converted GLBs under `Airbourne-Arena/assets/` are.

## The pipeline

The drop arrives as two zips at the repo root. `Assets.zip` holds the Unity
project, and inside it `Assets/Art/Generated/` holds one folder per asset, each
containing `selected.fbx` plus a `Color`/`NormalGL` texture pair.
`GeneratedAssets.zip` is the raw generator output and is not needed — every
integrated asset already appears in the first. Both are gitignored; at ~330 MB
they must never be committed.

```
npm run art:convert            # convert everything into assets/
npm run art:convert -- --only weapon   # substring filter
npm run art:convert:review     # also render Blender proofs
npm run assets:glb:write       # pack the new GLBs with meshopt
npm run build:game             # reassemble index.html
```

`Airbourne-Arena/source-assets/generated-art-manifest.json` is where every
decision about an asset lives: its real-world size in metres, its orientation,
its texture budget, whether it gets a LOD, and the material role name the
runtime calibrates on. The converter itself decides nothing.

Three of those fields are worth understanding before changing an entry:

- **`rotate` is stated, not inferred.** The generator is not consistent about
  which axis is up or forward — the rocket launcher came out barrel-along-X
  while every other weapon was along Y, and the pilot faced +X. A wrong value
  loads without error and is only wrong to look at.
- **`targetSize` is the asset's real size.** The generator's own scale is
  arbitrary. This is the only place an asset's size is decided.
- **`textureSize` has a trap behind it.** Blender's glTF exporter re-encodes
  from an image's *source file* whenever it still has one, so scaling the image
  in memory is silently discarded. This shipped once: every asset embedded the
  generator's full 2048² maps regardless of the manifest, including a 0.26 m
  pistol. `load_downsampled` now writes the scaled image out and repoints the
  datablock at it. If you touch that function, check a built GLB's embedded
  image dimensions rather than trusting the file size.

## Boot cost

None of this art loads during boot, and that is deliberate. `08-assets.js`
builds its progress bar from every `.load()` issued during the initial script
execution, so registering the drop there was correct by that rule and wrong in
every other way — it put the masterplan, both airbases, the props, five weapons
and three grenades in front of the player before they could reach the hangar.
Combined with the texture bug above that was around 130 MB of decoded texture,
enough to take the renderer out entirely on a memory-limited machine.

`afterBoot()` in `08b-generated-art.js` holds these behind the boot cover;
`bootFinish()` releases them. `npm run art:boot-check` is the guard: it asserts
the game reaches the hangar without a crash and that **zero** generated GLBs are
requested before the cover lifts. Boot is ~2.4 s in a software-rendered browser.

Anything added to this drop should go through `afterBoot` too.

### Proving it is right

WebGL capture is not a usable check in this container — the SwiftShader path
wedges — so verification is split in two:

`npm run art:convert:review` renders three views of each asset in Blender with
a 1 m reference cube, which is what catches a mis-scaled or mis-rotated asset.
The current proofs are in `docs/renders/generated/`.

`npm run art:boot-check` is the cheap one and should stay cheap — it only
proves the game boots and that the drop stayed out of the boot load.

`npm run art:probe` goes further: it boots the built game and drives the
features: it asserts every new GLB is actually requested, the arsenal arms, a
deck deploys, a round is spent, a grenade goes live, a weapon swap takes, and
leaving the deck restores the flight camera. It takes no screenshot, on
purpose. Looking at it is your browser's job.

Expect the probe to be slow in a container: software rendering decodes every
texture on the CPU, and deploying a deck also builds seven rigged bots. Several
minutes is normal there and says nothing about the frame rate on a real GPU.

## What was added to the game

**Arsenal** (`src/game/34d-arena-weapons.js`) — pistol, SMG, carbine,
anti-material rifle and launcher, plus frag, flash and smoke grenades. Shared
by the lower-city ground war and the 4v4 decks, so the sentries and the deck
bots present the same target shape and one hitscan serves both. Keys 1–5
select, R reloads, B throws, N cycles grenade, right mouse aims down the sights.

The weapon rig is driven off the aim angles rather than parented to the pilot's
hand bone. Ground mode is third-person and aim lives on `salvage.yaw`, which
the walk cycle knows nothing about — a hand-mounted weapon points wherever the
last footstep left the arm.

**4v4 decks** (`src/game/34e-arena-4v4.js`) — Vanguard Sky, Tempest Storm,
Inferno Volcanic and CQB Bunker. Reachable from the hangar bar (ARENA DECKS)
and from the sky-base operations board. Three hang beside their faction's ozone
base; the bunker is cut into the island plateau at 1900,-1400.

Deck height is a measured constant, not a raycast, and this is the one
non-obvious thing in the feature. The shipped decks are packed by gltfpack,
which quantizes positions to normalized shorts and moves the scale onto the
node. three.js r128 draws that correctly because the GPU denormalizes the
attribute — but `Mesh.raycast` reads it raw and computes in ±32767 space, so a
downward ray never hits. The floor and walkable extent of each deck are
measured off the unpacked source by `audit_generated_deck.py` in the Blender
source folder and recorded in `CQC_MAPS`. **Re-run that audit whenever a deck
is regenerated** — a stale `deck` value drops the player through Vanguard Sky,
whose floor is 70 m above its model origin.

```
blender --background --factory-startup --python-exit-code 1 \
  --python audit_generated_deck.py -- \
  --input <drop>/map_vanguard_arena_mesh_Assets/selected.fbx \
  --target-size 190 --rotate 0,0,0
```

**Masterplan and Skycities** (`src/game/18c-arena-installations.js`) — the
authored Airbourne Arena skyway circuit is hung at 1.4 km so it is flown through
rather than past. The two forward airbases are now the Open World arrival
Skycities: their measured deck is 50 m above the model origin, the central
landing circle is kept clear, and the tower, turrets, and cargo are staged at
the perimeter as an attached aerial village. The masterplan remains fly-through
scenery; only the explicitly bounded Skycity decks participate in landing and
on-foot collision.

**Suit display** (`src/game/34f-hangar-kit-display.js`) — the new pilot and the
five weapons on a rack opposite the mission board.

## The pilot is a real playable character

The generated `pilot-mesh-raw` suit is rebuilt by
`source-assets/blender/rig_generated_pilot.py`. The Blender step aligns it to
the shipping Mixamo skeleton, transfers and normalizes at most four bone
weights per vertex, preserves only the `Idle`, `Walk`, and `Run` clips, and
exports `assets/arena-pilot-rigged-v1.glb`. A build fails if a vertex is
unweighted, exceeds four influences, references a non-bone group, or does not
sum to one.

That one skinned asset now drives the hangar player, Mara, the open-world
ground player, and every CQC bot. Its embedded colour and normal maps remain on
the authored UVs. `render_rigged_pilot_review.py` poses each clip at its quarter
and three-quarter frames so collapsed shoulders, detached armour, or weights
dragged to the origin are visible before publishing.

`THREE.Object3D.clone` does not rebind a skinned mesh to a new skeleton, so the
deck bots each load their own copy instead of cloning one. The bytes come from
the HTTP cache, so this costs parse time at first deployment, not bandwidth.
Seven bots are built when the map list opens rather than after a deck is
chosen, which spends that time while the player is reading the four
descriptions.
