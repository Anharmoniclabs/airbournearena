// The MatchRoom Durable Object, driven end to end against a stand-in for the
// Workers runtime. Unit tests cover the decisions in room-state.mjs; these
// cover the thing those decisions are for — that a client can move its own
// aircraft and nothing else, that a hit reaches exactly one machine, and that
// the scoreboard cannot be asserted by whoever feels like it.
import assert from "node:assert/strict";
import test from "node:test";

import {
  C,
  EV,
  KIND_SNAPSHOT,
  KIND_STATE,
  PROTOCOL_VERSION,
  REJECT,
  S,
  decodeState,
  encodeState,
  slotId,
} from "../worker/protocol.mjs";

/* ---------- a stand-in for the pieces of the Workers runtime the DO touches ----------
   Deliberately small: sockets that remember what was sent and what was attached
   to them, and a Map behind the storage API. Anything more would be testing the
   stand-in. */
class FakeSocket {
  constructor(name) {
    this.name = name;
    this.sent = [];
    this.closed = null;
    this.attachment = null;
    this.readyState = 1;
  }
  send(data) {
    if (this.closed) throw new Error("send on a closed socket");
    this.sent.push(data);
  }
  close(code, reason) {
    this.closed = { code, reason };
    this.readyState = 3;
  }
  serializeAttachment(value) {
    // The real API structured-clones; copying keeps a test from sharing a
    // reference the runtime would not have shared.
    this.attachment = value === null || value === undefined ? value : { ...value };
  }
  deserializeAttachment() {
    return this.attachment ? { ...this.attachment } : this.attachment;
  }
  /* Everything the room sent this socket, as parsed JSON control messages. */
  control() {
    return this.sent.filter((m) => typeof m === "string").map((m) => JSON.parse(m));
  }
  binary() {
    return this.sent.filter((m) => m instanceof ArrayBuffer);
  }
  last(type) {
    return this.control().filter((m) => m.t === type).pop() ?? null;
  }
  clear() {
    this.sent.length = 0;
  }
}

class FakeState {
  constructor() {
    this.sockets = new Set();
    this.map = new Map();
    this.storage = {
      get: async (k) => this.map.get(k),
      put: async (k, v) => void this.map.set(k, v),
    };
  }
  acceptWebSocket(ws) {
    this.sockets.add(ws);
  }
  getWebSockets() {
    return [...this.sockets];
  }
}

class ShimResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.webSocket = init.webSocket ?? null;
  }
  async json() {
    return JSON.parse(this.body);
  }
}

let pairCount = 0;
globalThis.WebSocketPair = function WebSocketPair() {
  pairCount += 1;
  return { 0: new FakeSocket(`client${pairCount}`), 1: new FakeSocket(`server${pairCount}`) };
};
globalThis.Response = ShimResponse;

const { MatchRoom } = await import("../worker/match-room.mjs");

async function openRoom() {
  return new MatchRoom(new FakeState(), {});
}

/* Connect a pilot and complete the hello handshake. Returns the server-side
   socket, which is the handle the room itself holds. */
async function join(room, callsign, team) {
  const res = await room.fetch(
    new Request("https://room.invalid/socket", { headers: { Upgrade: "websocket" } }),
  );
  const ws = [...room.state.sockets].at(-1);
  assert.equal(res.status, 101);
  await room.webSocketMessage(
    ws,
    JSON.stringify({ t: C.HELLO, v: PROTOCOL_VERSION, callsign, team }),
  );
  return ws;
}

function stateFrame(records, core) {
  return encodeState(KIND_STATE, Date.now(), records, core);
}

function aircraft(slot, extra = {}) {
  return {
    slot,
    flags: 1,
    hp: 100,
    throttle: 1,
    px: slot * 100,
    py: 500,
    pz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    vx: 0,
    vy: 0,
    vz: -180,
    ...extra,
  };
}

test("the first pilot in is welcomed into blue 0 and made arena host", async () => {
  const room = await openRoom();
  const ws = await join(room, "viper", null);
  const welcome = ws.last(S.WELCOME);
  assert.ok(welcome, "no welcome was sent");
  assert.equal(welcome.you.slot, slotId("blue", 0));
  assert.equal(welcome.you.team, "blue");
  assert.equal(welcome.host, slotId("blue", 0));
  assert.deepEqual(welcome.roster, [{ slot: 0, team: "blue", callsign: "VIPER" }]);
  // Every other seat keeps flying itself, which is what makes a one-pilot room
  // a playable match rather than a waiting screen.
  assert.deepEqual(welcome.ai, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(welcome.over, false);
});

test("a second pilot is balanced onto the other side and announced to the first", async () => {
  const room = await openRoom();
  const a = await join(room, "viper", null);
  a.clear();
  const b = await join(room, "mara", null);

  assert.equal(b.last(S.WELCOME).you.team, "red");
  const announced = a.last(S.PEER_JOIN);
  assert.ok(announced, "the first pilot was not told about the second");
  assert.equal(announced.callsign, "MARA");
  assert.equal(announced.slot, slotId("red", 0));
  // The host does not move just because someone else arrived.
  assert.equal(announced.host, slotId("blue", 0));
  assert.deepEqual(announced.ai, [1, 2, 3, 5, 6, 7]);
});

test("a build on the wrong protocol version is refused rather than half-understood", async () => {
  const room = await openRoom();
  const res = await room.fetch(
    new Request("https://room.invalid/socket", { headers: { Upgrade: "websocket" } }),
  );
  assert.equal(res.status, 101);
  const ws = [...room.state.sockets].at(-1);
  await room.webSocketMessage(ws, JSON.stringify({ t: C.HELLO, v: 999, callsign: "old" }));
  assert.equal(ws.last(S.REJECT).why, REJECT.VERSION);
  assert.equal(ws.closed.code, 4001);
});

test("a ninth pilot is turned away instead of being squeezed into a taken seat", async () => {
  const room = await openRoom();
  for (let i = 0; i < 8; i += 1) await join(room, `p${i}`, null);
  const res = await room.fetch(
    new Request("https://room.invalid/socket", { headers: { Upgrade: "websocket" } }),
  );
  assert.equal(res.status, 101);
  const ws = [...room.state.sockets].at(-1);
  await room.webSocketMessage(ws, JSON.stringify({ t: C.HELLO, v: PROTOCOL_VERSION, callsign: "late" }));
  assert.equal(ws.last(S.REJECT).why, REJECT.FULL);
  assert.equal(ws.closed.code, 4002);
});

test("a pilot's own aircraft is relayed to the rest of the room", async () => {
  const room = await openRoom();
  const a = await join(room, "viper", null);
  const b = await join(room, "mara", null);
  b.clear();

  await room.webSocketMessage(a, stateFrame([aircraft(0)]));
  const frames = b.binary();
  assert.equal(frames.length, 1, "the other pilot did not receive the state");
  const decoded = decodeState(frames[0]);
  assert.equal(decoded.kind, KIND_SNAPSHOT, "a relayed frame must be re-stamped as a snapshot");
  assert.equal(decoded.aircraft.length, 1);
  assert.equal(decoded.aircraft[0].slot, 0);
  assert.equal(decoded.aircraft[0].px, 0);
});

test("a state frame is never echoed back to the client that sent it", async () => {
  // The sender already knows where it is, and applying its own relayed state
  // would fight its local simulation.
  const room = await openRoom();
  const a = await join(room, "viper", null);
  await join(room, "mara", null);
  a.clear();
  await room.webSocketMessage(a, stateFrame([aircraft(0)]));
  assert.equal(a.binary().length, 0);
});

test("a client cannot fly an aircraft that belongs to someone else", async () => {
  // This is the ownership filter, and the reason it exists: without it any
  // client could address a record to another player's slot and puppet them.
  const room = await openRoom();
  const a = await join(room, "viper", null); // blue 0, host
  const b = await join(room, "mara", null); // red 0
  const c = await join(room, "cibao", null); // blue 1
  c.clear();

  await room.webSocketMessage(b, stateFrame([aircraft(4, { px: 1 }), aircraft(0, { px: 99999 })]));
  const decoded = decodeState(c.binary()[0]);
  assert.equal(decoded.aircraft.length, 1, "a foreign slot survived the ownership filter");
  assert.equal(decoded.aircraft[0].slot, 4);
  assert.ok(a, "the puppeteered pilot is still in the room");
});

test("the arena host may fly the seats nobody is in; a non-host may not", async () => {
  const room = await openRoom();
  const host = await join(room, "viper", null); // blue 0, host
  const other = await join(room, "mara", null); // red 0
  other.clear();

  // slot 2 is an AI seat: the host speaks for it.
  await room.webSocketMessage(host, stateFrame([aircraft(0), aircraft(2)]));
  const fromHost = decodeState(other.binary().at(-1));
  assert.deepEqual(fromHost.aircraft.map((a) => a.slot).sort(), [0, 2]);

  // The same claim from a non-host keeps only its own aircraft.
  host.clear();
  await room.webSocketMessage(other, stateFrame([aircraft(4), aircraft(2)]));
  const fromOther = decodeState(host.binary().at(-1));
  assert.deepEqual(fromOther.aircraft.map((a) => a.slot), [4]);
});

test("only the arena host's Core position is relayed", async () => {
  // The Core needs exactly one simulator. A second client describing it would
  // make it flicker between two positions at the packet rate.
  const room = await openRoom();
  const host = await join(room, "viper", null);
  const other = await join(room, "mara", null);
  const core = { carrier: null, charge: 80, px: 5, py: 600, pz: 5, vx: 0, vy: 0, vz: 0 };

  other.clear();
  await room.webSocketMessage(host, stateFrame([aircraft(0)], core));
  assert.ok(decodeState(other.binary().at(-1)).core, "the host's Core was not relayed");

  host.clear();
  await room.webSocketMessage(other, stateFrame([aircraft(4)], core));
  assert.equal(decodeState(host.binary().at(-1)).core, null, "a non-host described the Core");
});

test("a hit claim reaches the target's owner and nobody else", async () => {
  // Broadcasting a hit would have every client apply the same damage
  // independently; the target's owner is the one machine that decides.
  const room = await openRoom();
  const shooter = await join(room, "viper", null); // 0
  const target = await join(room, "mara", null); // 4
  const bystander = await join(room, "cibao", null); // 1
  target.clear();
  bystander.clear();
  shooter.clear();

  await room.webSocketMessage(shooter, JSON.stringify({ t: C.HIT, slot: 4, dmg: 14 }));

  const delivered = target.last(S.HIT);
  assert.ok(delivered, "the target's owner never heard about the hit");
  assert.equal(delivered.dmg, 14);
  assert.equal(delivered.by, 0, "the claim must name the shooter the server knows, not the sender's word");
  assert.equal(bystander.last(S.HIT), null, "a bystander was told about someone else's hit");
  assert.equal(shooter.last(S.HIT), null, "the shooter was told about its own hit");
});

test("a hit on an AI seat is routed to the arena host", async () => {
  const room = await openRoom();
  const host = await join(room, "viper", null); // 0, host
  const other = await join(room, "mara", null); // 4
  host.clear();

  await room.webSocketMessage(other, JSON.stringify({ t: C.HIT, slot: 6, dmg: 14 }));
  const delivered = host.last(S.HIT);
  assert.ok(delivered, "nobody was told about a hit on an AI aircraft");
  assert.equal(delivered.slot, 6);
  assert.equal(delivered.by, 4);
});

test("the arena host's capture moves the scoreboard the server keeps", async () => {
  const room = await openRoom();
  const host = await join(room, "viper", null); // blue 0, host
  const other = await join(room, "mara", null); // red 0
  other.clear();

  await room.webSocketMessage(host, JSON.stringify({ t: C.EVENT, ev: EV.CORE_SCORE, slot: 0 }));

  const score = other.last(S.SCORE);
  assert.ok(score, "no scoreboard update was broadcast");
  assert.deepEqual([score.blue, score.red], [1, 0]);
  assert.equal(other.last(S.EVENT).ev, EV.CORE_SCORE);
});

test("a capture reported by anyone but the arena host is ignored", async () => {
  // The Core is simulated by the host alone, so the host is the only client in
  // a position to have seen a capture happen.
  const room = await openRoom();
  await join(room, "viper", null); // host
  const other = await join(room, "mara", null);
  other.clear();

  await room.webSocketMessage(other, JSON.stringify({ t: C.EVENT, ev: EV.CORE_SCORE, slot: 4 }));
  assert.equal(other.last(S.SCORE), null, "a non-host moved the scoreboard");
  assert.deepEqual(room.score, { blue: 0, red: 0 });
});

test("a client cannot set the score directly, only report a capture", async () => {
  const room = await openRoom();
  const host = await join(room, "viper", null);
  // The shape a modified client would try. The server derives the score from
  // the event and never reads a score off the wire.
  await room.webSocketMessage(
    host,
    JSON.stringify({ t: C.EVENT, ev: EV.CORE_SCORE, slot: 0, blue: 99, red: 0, score: { blue: 99 } }),
  );
  assert.deepEqual(room.score, { blue: 1, red: 0 });
});

test("three captures end the match", async () => {
  const room = await openRoom();
  const host = await join(room, "viper", null);
  const other = await join(room, "mara", null);
  for (let i = 0; i < 3; i += 1) {
    await room.webSocketMessage(host, JSON.stringify({ t: C.EVENT, ev: EV.CORE_SCORE, slot: 0 }));
  }
  assert.equal(room.over, true);
  assert.equal(other.last(S.SCORE).over, true);
});

test("a rematch is refused mid-match and accepted once it is over", async () => {
  const room = await openRoom();
  const host = await join(room, "viper", null);
  const other = await join(room, "mara", null);

  await room.webSocketMessage(other, JSON.stringify({ t: C.EVENT, ev: EV.REMATCH }));
  assert.deepEqual(room.score, { blue: 0, red: 0 });
  assert.equal(room.over, false);

  for (let i = 0; i < 3; i += 1) {
    await room.webSocketMessage(host, JSON.stringify({ t: C.EVENT, ev: EV.CORE_SCORE, slot: 0 }));
  }
  assert.equal(room.over, true);
  other.clear();
  host.clear();

  // Any pilot may call it, not only the host — otherwise a finished room is
  // stranded whenever the host has walked away.
  await room.webSocketMessage(other, JSON.stringify({ t: C.EVENT, ev: EV.REMATCH }));
  assert.equal(room.over, false);
  assert.deepEqual(room.score, { blue: 0, red: 0 });
  // Everyone is told, including the caller, because nobody resets locally first.
  assert.equal(host.last(S.EVENT).ev, EV.REMATCH);
  assert.equal(other.last(S.EVENT).ev, EV.REMATCH);
});

test("a pilot leaving hands the aircraft back to the AI", async () => {
  const room = await openRoom();
  const a = await join(room, "viper", null); // 0
  const b = await join(room, "mara", null); // 4
  a.clear();

  await room.webSocketClose(b);
  const left = a.last(S.PEER_LEAVE);
  assert.ok(left, "nobody was told the pilot left");
  assert.equal(left.slot, 4);
  assert.ok(left.ai.includes(4), "the vacated seat was not handed back to the AI");
});

test("the arena host moving on is announced to the room", async () => {
  const room = await openRoom();
  const a = await join(room, "viper", null); // 0, host
  const b = await join(room, "mara", null); // 4
  b.clear();

  await room.webSocketClose(a);
  assert.equal(room.hostSlot, 4, "the room was left with no arena host");
  assert.equal(b.last(S.HOST).slot, 4, "the new host was not told it is hosting");
});

test("the last pilot out resets the room so a reused code starts fresh", async () => {
  const room = await openRoom();
  const host = await join(room, "viper", null);
  await room.webSocketMessage(host, JSON.stringify({ t: C.EVENT, ev: EV.CORE_SCORE, slot: 0 }));
  assert.deepEqual(room.score, { blue: 1, red: 0 });

  await room.webSocketClose(host);
  assert.deepEqual(room.score, { blue: 0, red: 0 });
  assert.equal(room.startedAt, 0);
  assert.equal(room.over, false);
});

test("a socket that never says hello holds no slot and gets no traffic", async () => {
  const room = await openRoom();
  const joined = await join(room, "viper", null);
  const res = await room.fetch(
    new Request("https://room.invalid/socket", { headers: { Upgrade: "websocket" } }),
  );
  assert.equal(res.status, 101);
  const silent = [...room.state.sockets].at(-1);

  joined.clear();
  await room.webSocketMessage(joined, stateFrame([aircraft(0)]));
  assert.equal(silent.sent.length, 0, "an unidentified socket received match traffic");

  // And it cannot claim a seat by sending state before its hello.
  await room.webSocketMessage(silent, stateFrame([aircraft(1)]));
  assert.equal(joined.binary().length, 0);
});

test("a malformed binary frame is dropped rather than relayed", async () => {
  const room = await openRoom();
  const a = await join(room, "viper", null);
  const b = await join(room, "mara", null);
  b.clear();

  await room.webSocketMessage(a, new ArrayBuffer(7));
  await room.webSocketMessage(a, new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]).buffer);
  assert.equal(b.binary().length, 0, "a malformed frame was passed on to the room");
});

test("unparseable control text does not take the room down", async () => {
  const room = await openRoom();
  const a = await join(room, "viper", null);
  await room.webSocketMessage(a, "{not json");
  await room.webSocketMessage(a, JSON.stringify({ t: "nonsense" }));
  // Still serving.
  const b = await join(room, "mara", null);
  assert.ok(b.last(S.WELCOME));
});

test("the probe reports occupancy so room codes are not minted onto live matches", async () => {
  const room = await openRoom();
  const empty = await room.fetch(new Request("https://room.invalid/probe"));
  assert.equal((await empty.json()).live, 0);

  await join(room, "viper", null);
  const busy = await room.fetch(new Request("https://room.invalid/probe"));
  assert.equal((await busy.json()).live, 1);
});
