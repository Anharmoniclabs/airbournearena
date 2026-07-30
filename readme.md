# Airbourne Arena

A 4v4 arcade air-combat game that runs in a browser tab. Two flights of four
launch from opposite ends of an open sky. A hardened **Arena Core** hangs at
midfield — fly through it to pick it up, run it to the ring at the enemy end to
score, first to three. Shoot the carrier down and the core drops where they
died, free for anyone.

**▶ [Play it](https://anharmoniclabs.github.io/airbournearena/)** — no install,
no sign-in, works on a phone.

![The Arena Core briefing](Airbourne-Arena/assets/case-run-briefing-v2.webp)

## The campaign

Behind the Arena is a six-chapter, 32-mission story: an unknown pilot with an
old Kestrel flies trials for all three teams, signs with one, and works out who
has been manufacturing a war between them. The **CAMPAIGN** button — on the
hangar bar, the briefing card and the pause menu — lists every chapter, marks
what has been flown, and lets any reachable mission be replayed without
rewinding your place in the story.

Faction reputation, rival trust and a unity score are tracked across the whole
run, and they, not a single final prompt, decide which of the six endings you
get. The setting, cast and chapter beats are in
[`docs/STORY-BIBLE.md`](docs/STORY-BIBLE.md).

## The game ships as one HTML file, built from many

[`Airbourne-Arena/index.html`](Airbourne-Arena/index.html) is the game — markup,
styles, flight model, AI, audio and mission logic in a single self-contained
file, with three.js and an `assets/` folder beside it. Every asset path is
relative, so the same file runs unchanged off a local disk, off a project
subpath, or off the site root.

To play it locally, open that file. If your browser blocks local assets, serve
the folder instead:

```bash
cd Airbourne-Arena && python3 -m http.server 8080
```

**That file is generated. Edit [`Airbourne-Arena/src/`](Airbourne-Arena/src/)
instead** — 14 stylesheet parts and 52 script parts, one per system, listed in
build order in [`src/manifest.txt`](Airbourne-Arena/src/manifest.txt):

```bash
cd Airbourne-Arena/source && npm run build:game   # rebuilds index.html and the served copy
```

The parts are concatenated, not imported. The game is one shared function scope
and it has to stay loadable from a `file://` URL, where `<script type="module">`
is blocked — so the split is a source-layout split and the shipped file is
byte-for-byte what a browser used to be handed directly. A part may use anything
declared in a part above it, and any *function* declared in a part below it so
long as the call happens after load; only code that runs at load time is
order-sensitive.

## Flying

The aircraft flies on a real velocity vector — thrust, lift, drag and gravity,
with angle of attack driving the lift curve. Point the nose up and the jet keeps
going the way it was going until the wing turns it. Pull too hard and the wing
stalls. Trade height for speed.

Gunnery is solved rather than guessed: the amber box marks the tracked bandit,
the red circle is where they will be when your rounds arrive, and the pipper is
where those rounds will actually be. Put the pipper on the circle. Rounds carry
your own velocity, so a hard turn throws them wide.

| | |
|---|---|
| **Mouse** | Steer — the nose chases the teal reticle |
| **A** / **D** | Turn. A tap banks and holds; holding winds out to a max-rate turn |
| **W** / **S** | Throttle · **SHIFT** firewall · **CTRL** idle |
| **SPACE** | Cannon · **TAB** lock next bandit · **F** pass the core |
| **Q** / **E** | Barrel roll — corkscrews the flight path out of a gunsight |
| **C** / **M** / **P** / **O** | Camera · map · pause · settings |

The briefing card keeps this list behind its **CONTROLS** button rather than on
screen, and the hangar, pause and campaign menus are buttons on every device.

A connected **gamepad** takes over automatically. On **touch**, the left thumb
gets a floating stick and the right gets fire, pass, boost and roll — in
whichever orientation you're holding the phone.

Settings, accessibility options (colour-blind team colours, reduced motion, HUD
scale) and the full control list are documented in
[`Airbourne-Arena/README.md`](Airbourne-Arena/README.md).

## Layout

```
index.html                    redirect stub → the game
Airbourne-Arena/
  index.html                  the shipped game — GENERATED, do not edit
  src/                        edit these
    shell.html                head, overlay markup, and the two include slots
    manifest.txt              build order, and why it matters
    styles/                   14 stylesheet parts
    game/                     52 script parts — engine, hangar, campaign
  assets/                     textures, models, three.js
  manifest.webmanifest        installable as a PWA
  source/                     Next/Vite host project, not deployed
    scripts/build-game.sh     assembles src/ → index.html; --check for drift
    public/case-run.html      byte-for-byte copy of the game, generated
    tests/                    node:test checks over the shipped file
docs/STORY-BIBLE.md           setting and campaign notes
```

Both `index.html` and `source/public/case-run.html` are generated and committed,
so a clone or a download plays with no build step. `npm run build:game` rebuilds
both; `build-game.sh --check` and `sync-game.sh --check` fail if either has been
hand-edited.

```bash
cd Airbourne-Arena/source && node --test tests/game-html.test.mjs tests/game-build.test.mjs
```

The tests check that the shipped file is what `src/` assembles to, that the
manifest accounts for every part, that the served copy hasn't drifted, that every
asset path is relative, that every referenced asset exists in both asset roots,
and that branding is consistent.
[`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs them before
publishing to GitHub Pages.
