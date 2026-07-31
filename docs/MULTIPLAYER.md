# Online multiplayer

4v4 drop-in over WebSockets. The browser game stays exactly what it was — a
static artifact on GitHub Pages, playable offline with no download — and reaches
a small Cloudflare Worker when, and only when, a player asks to fly online.

## The one idea that makes this cheap

The arena already ran eight AI aircraft. A human joining is that AI letting go of
one of them, and a human leaving is it picking the aircraft back up. There is no
lobby to fill, no minimum player count, and no empty-slot special case: a room
with one pilot is a normal match, and so is a room with eight.

Everything else follows from that. `fighters[]` is unchanged, `stepFlight` is
unchanged, and the campaign does not know the network exists.

## Authority

| Thing | Who decides | Why |
|---|---|---|
| Your own aircraft | You | A flight model that waits for a round trip is not a flight model. Your aeroplane is never rewound by a remote authority. |
| Other players' aircraft | Them | Received as state and interpolated, never simulated locally. |
| Unflown (AI) aircraft | The arena host | Needs exactly one simulator; the host is whoever has been in the room longest. |
| The Core | The arena host | Same reason. |
| Damage to an aircraft | That aircraft's owner | The shooter claims a hit, the owner applies it. Otherwise eight machines each subtract the same fourteen points. |
| The scoreboard and the clock | The server | The only two numbers worth not trusting a client with. |

A client is refused exactly two things: moving an aircraft it does not own
(`onHotState` filters records by ownership before relaying), and asserting a
score (it reports a capture; the server derives the number).

**This is not cheat-resistant, and is not meant to be.** A modified client can
claim positions and hits it did not earn. That is the accepted cost of the
option that makes the aeroplane feel right, and it is the correct trade for a
free browser game. Making it cheat-resistant means moving the whole simulation
server-side — a much larger job, and the one to do if this ever needs ranked
play. The seam is already in the right place: `netOwns()` is the single question
everything else routes through.

## Layout

```
Airbourne-Arena/
  src/game/53-net-protocol.js   wire format, browser copy
  src/game/54-net-client.js     socket, roster, who-owns-what
  src/game/55-net-sync.js       sending, interpolation, damage marshalling
  src/game/56-net-ui.js         the lobby
  src/styles/15-net.css
  source/worker/protocol.mjs    wire format, canonical copy
  source/worker/room-state.mjs  slot assignment, host election, scoring
  source/worker/match-room.mjs  the Durable Object
  source/worker/index.mjs       routing and CORS
  source/wrangler.jsonc
```

The protocol exists twice because the game is one concatenated IIFE that has to
stay loadable from a `file://` URL and so cannot `import`. Two copies of a binary
codec is a real hazard, so `tests/net-protocol.test.mjs` encodes with each and
decodes with the other, in both directions, over every field — a change to one
that is not mirrored fails the build instead of corrupting packets at runtime.

## Wire format

Two channels over one socket. Control messages are JSON strings — join, roster,
score, match events, all rare and all readable in devtools. Aircraft state is a
packed `ArrayBuffer` at 20 Hz: a 12-byte header, then 44 bytes per aircraft
(slot, flags, health, throttle, position, quaternion, velocity), then an optional
28-byte Core record. Eight aircraft at 20 Hz is about 7 KB/s.

Remote aircraft are drawn 110 ms behind the newest packet, so ordinary socket
jitter lands inside the delay rather than on the screen. Past the newest sample
a remote coasts on its last velocity for up to 250 ms and then holds its
attitude — a frozen aircraft reads as a network problem, whereas one that keeps
flying reads as a teleport when the packets resume.

## Deploying the server

```sh
cd Airbourne-Arena/source
npm run net:deploy          # wrangler deploy
```

You need a Cloudflare account; Durable Objects on the free plan cover early
traffic. The deploy prints a URL like
`https://airbourne-arena-net.<account>.workers.dev`.

Then either bake it into the game — set `ARENA_SERVER` at the top of
`src/game/54-net-client.js` and run `npm run build:game` — or leave it empty and
let each player paste it into the lobby's server field once (it is remembered in
`localStorage`).

Before sharing the link publicly, set `ALLOWED_ORIGINS` in `wrangler.jsonc` to
the Pages origin. Empty means any origin, which is right for local play and
wrong for a deploy that has a domain.

### Locally, two browsers

```sh
cd Airbourne-Arena/source
npm run net:dev             # wrangler dev on :8787
```

Open the game twice with `?net=http://localhost:8787`, open a room in one
window, and type the code into the other. The `?net=` parameter overrides the
stored server so testing never disturbs a real setting.

## Playing

`FLY ONLINE` on the briefing card. **OPEN A ROOM** mints a five-character code;
anyone who enters it joins the same match. The code alphabet drops vowels and
the `0/O/1/I/L` confusions because a code gets read aloud and typed back in.
`index.html?room=ABCDE` fills the lobby in for an invited player.

A match ends the way it always did, on three captures or the clock. `RUN IT
BACK` is a request online rather than a local reset — any pilot may call it,
and only once the match is over, so a finished room is not stranded when the
host has walked away.

## Tests

```sh
npm run test:net
```

- `net-protocol.test.mjs` — cross-decoding both copies, malformed frames,
  clamping, slot numbering, room codes.
- `net-room.test.mjs` — slot assignment, host election, scoring, the clock.
- `net-match-room.test.mjs` — the Durable Object end to end against a stand-in
  runtime: the join handshake, the ownership filter, hit routing, score
  authority, host handover and room reset.

## Known limits

- **Cheatable**, as above.
- **Host migration is not seamless.** When the arena host leaves, the next
  pilot inherits the AI aircraft and the Core from whatever their interpolated
  state last was. Close enough not to jump visibly, but not a clean handover.
- **No matchmaking.** Rooms are found by sharing a code, not by a browser.
- **Campaign is single-player.** Online applies to the Arena Core mode only;
  missions own their own pacing and were never written for more than one pilot.
- **No reconnect into a specific slot.** A dropped player retries for about ten
  seconds and rejoins into whatever seat is free, which may not be the one they
  left.
