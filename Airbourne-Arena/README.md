# Airbourne Arena

A mobile-friendly 4v4 aerial capture game with high-resolution fighter, terrain,
airbase, portal, case, and briefing assets.

## Play

For the quickest start, open `index.html` in a modern browser.

If your browser blocks local assets, serve this folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Full source

The complete Next/Vite project is in `source/`.

```bash
cd source
npm install
npm run dev
```

The game ships as the single self-contained file `index.html` at the root of this
folder, but that file is **generated** — from the 14 stylesheet parts and 52
script parts under `src/`, concatenated in the order `src/manifest.txt` gives.
`source/public/case-run.html` is then a byte-for-byte copy of the result.

Edit `src/`, never `index.html` and never the copy:

```bash
cd source && npm run build:game
```

Both generated files are committed so the game opens straight from a clone with
no build step, and both are checked for drift on every `npm test`.

## The campaign

Six chapters, 32 missions, from the first circuit over Breakwater Field to the
Warden core on Black Wing's carrier. The **CAMPAIGN** button on the hangar bar
lists every chapter and every mission, shows what has been flown, and lets any
reachable mission be replayed without rewinding your progress. The hangar is
the one place the campaign is run from, so there is a single door to it.

In Chapter 1 you fly a trial for all three teams and then sign with one —
Vanguard, Tempest or Inferno. That choice sets your active ability (Guardian
Field, Velocity Burst or Weapons Overdrive), who talks to you, and which
faction your standing moves with. Tempest field no Arena Core card of their
own, so their pilots launch with the west flight in league matches.

Progress, reputation with each faction, rival trust, the unity score and your
aircraft build are saved to the device. Six endings are possible; which one you
get is decided by what the campaign recorded, not by a single final prompt.

The setting, factions, cast and chapter beats are documented in
[`../docs/STORY-BIBLE.md`](../docs/STORY-BIBLE.md).

## Controls

- **Mouse + keyboard** — the nose chases the teal reticle. `W`/`S` throttle,
  `A`/`D` turn, `SHIFT` firewalls, `SPACE` fires, `F` passes the case,
  `Q`/`E` barrel roll, `C` camera, `M` map, `P` pause, `O` settings.
- **Turning** — `A`/`D` are pressure, not a switch. A tap banks about 53° and
  stops there, which is what you want for lining up a shot. Holding winds the
  bank out to 80° over half a second and pulls the aircraft round at the best
  rate the wing has — a little over three times the sustained turn rate this
  used to give, and it holds its altitude while doing it.
- The thumbstick and the gamepad reach the same turn at full deflection. Pull
  the nose too far above the horizon while you are there and you will still
  trade every knot you have for height, which is the wrong trade in a fight.
- **Gamepad** — connect one and it takes over automatically. Left stick flies,
  triggers are throttle and guns, face buttons handle pass, roll and boost,
  `Start` pauses.
- **Touch** — a floating stick under the left thumb, action buttons under the
  right, and a pause button at the top. No rotating required.

## Settings

Press `O`, or use the button on the briefing, pause and end screens. Mouse
sensitivity, invert pitch, master volume, engine tone, HUD scale, AI
difficulty, colour-blind team colours, zero-point flight, reduced motion and
tutorial coaching all persist across sessions.

Reduced motion defaults to whatever the operating system asks for.

**ZERO-POINT FLIGHT** is on by default. It gives the airframe full pointing
authority at any airspeed, removes the stall, and holds station when you cut the
throttle — the aircraft hovers instead of falling. It blends out by ~165 kn, so
fast flight is unchanged. Switching it off restores the pure energy model, which
is also what the first-sortie coaching and the gunnery solver were originally
tuned against.

## Accessibility

- Colour-blind mode swaps the blue/red team pair for blue/amber, which stays
  distinguishable under all three common types of colour vision deficiency.
- Reduced motion disables camera shake and the lightning flash.
- HUD scale runs from 70% to 160% for high-density displays.
