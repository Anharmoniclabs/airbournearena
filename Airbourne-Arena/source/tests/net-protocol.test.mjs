// The wire format exists twice: once as an ES module the Cloudflare worker
// imports, once as plain declarations concatenated into the game's single IIFE
// (which cannot use `import` and has to stay loadable from file://).
//
// Two copies of a binary codec is exactly the kind of duplication that rots
// silently — a field added to one side decodes as garbage on the other, and the
// symptom is an aircraft in the wrong place rather than an error. So these
// tests never check the two files "look the same". They encode with each and
// decode with the other, over the full field set, in both directions.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import * as worker from "../worker/protocol.mjs";

const clientSource = await readFile(
  new URL("../../src/game/53-net-protocol.js", import.meta.url),
  "utf8",
);
const client = vm.createContext({});
vm.runInContext(clientSource, client);

/* A sample with a distinct value in every field, so a transposed pair of
   offsets cannot pass by symmetry. The floats are chosen to survive an f32
   round trip exactly. */
const AIRCRAFT = [
  {
    slot: 5,
    flags: 0b10101,
    hp: 73,
    throttle: 0.5019607843137255, // 128/255 — exact after byte quantisation
    px: 1234.5,
    py: -678.25,
    pz: 9012.75,
    qx: 0.5,
    qy: -0.25,
    qz: 0.125,
    qw: 0.8125,
    vx: -111.5,
    vy: 222.25,
    vz: -333.75,
  },
  {
    slot: 0,
    flags: 1,
    hp: 100,
    throttle: 1,
    px: -1,
    py: 2,
    pz: -3,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    vx: 4,
    vy: -5,
    vz: 6,
  },
];

const CORE = {
  carrier: 3,
  charge: 42,
  px: 10.5,
  py: 600.25,
  pz: -20.75,
  vx: 1.5,
  vy: -2.5,
  vz: 3.5,
};

function assertAircraftMatch(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: record count`);
  for (let i = 0; i < expected.length; i += 1) {
    for (const key of Object.keys(expected[i])) {
      assert.equal(actual[i][key], expected[i][key], `${label}: aircraft ${i} field ${key}`);
    }
  }
}

test("the two protocol copies agree on every constant that shapes a frame", () => {
  // These are the numbers a decoder uses to find its fields. A mismatch in any
  // one of them mis-reads every packet, so they are pinned individually rather
  // than by a checksum that would not say which drifted.
  const pairs = [
    ["PROTOCOL_VERSION", "NET_PROTOCOL_VERSION"],
    ["STATE_HZ", "NET_STATE_HZ"],
    ["INTERP_DELAY_MS", "NET_INTERP_DELAY_MS"],
    ["EXTRAPOLATE_MAX_MS", "NET_EXTRAPOLATE_MAX_MS"],
    ["HEARTBEAT_MS", "NET_HEARTBEAT_MS"],
    ["MAX_SLOTS", "NET_MAX_SLOTS"],
    ["SLOTS_PER_TEAM", "NET_SLOTS_PER_TEAM"],
    ["ROOM_CODE_LENGTH", "NET_ROOM_CODE_LENGTH"],
    ["ROOM_CODE_ALPHABET", "NET_ROOM_CODE_ALPHABET"],
    ["KIND_STATE", "NET_KIND_STATE"],
    ["KIND_SNAPSHOT", "NET_KIND_SNAPSHOT"],
    ["HEADER_BYTES", "NET_HEADER_BYTES"],
    ["AIRCRAFT_BYTES", "NET_AIRCRAFT_BYTES"],
    ["CORE_BYTES", "NET_CORE_BYTES"],
    ["CORE_NO_CARRIER", "NET_CORE_NO_CARRIER"],
    ["FLAG_ALIVE", "NET_FLAG_ALIVE"],
    ["FLAG_CARRYING", "NET_FLAG_CARRYING"],
    ["FLAG_BURNER", "NET_FLAG_BURNER"],
    ["FLAG_FIRING", "NET_FLAG_FIRING"],
    ["FLAG_STALLED", "NET_FLAG_STALLED"],
  ];
  for (const [workerName, clientName] of pairs) {
    assert.equal(
      client[clientName],
      worker[workerName],
      `${clientName} in the game does not match ${workerName} in the worker`,
    );
  }
});

test("the two copies agree on the control and event vocabularies", () => {
  // Spread before comparing: the game's copy is evaluated in a vm context, so
  // its objects carry that realm's prototypes and would fail a strict deep
  // comparison while being structurally identical.
  assert.deepEqual({ ...client.NET_C }, { ...worker.C });
  assert.deepEqual({ ...client.NET_S }, { ...worker.S });
  assert.deepEqual({ ...client.NET_EV }, { ...worker.EV });
  assert.deepEqual({ ...client.NET_REJECT }, { ...worker.REJECT });
});

test("a frame encoded by the worker decodes in the game, field for field", () => {
  const buffer = worker.encodeState(worker.KIND_SNAPSHOT, 1717171717171, AIRCRAFT, CORE);
  const decoded = client.netDecodeState(buffer);
  assert.ok(decoded, "the game refused a frame the worker produced");
  assert.equal(decoded.kind, worker.KIND_SNAPSHOT);
  assert.equal(decoded.time, 1717171717171);
  assertAircraftMatch(decoded.aircraft, AIRCRAFT, "worker -> game");
  for (const key of Object.keys(CORE)) {
    assert.equal(decoded.core[key], CORE[key], `worker -> game: core field ${key}`);
  }
});

test("a frame encoded by the game decodes in the worker, field for field", () => {
  const buffer = client.netEncodeState(client.NET_KIND_STATE, 987654321, AIRCRAFT, CORE);
  const decoded = worker.decodeState(buffer);
  assert.ok(decoded, "the worker refused a frame the game produced");
  assert.equal(decoded.kind, worker.KIND_STATE);
  assert.equal(decoded.time, 987654321);
  assertAircraftMatch(decoded.aircraft, AIRCRAFT, "game -> worker");
  for (const key of Object.keys(CORE)) {
    assert.equal(decoded.core[key], CORE[key], `game -> worker: core field ${key}`);
  }
});

test("both copies produce byte-identical frames from identical input", () => {
  const a = new Uint8Array(worker.encodeState(worker.KIND_STATE, 42, AIRCRAFT, CORE));
  const b = new Uint8Array(client.netEncodeState(client.NET_KIND_STATE, 42, AIRCRAFT, CORE));
  assert.deepEqual([...a], [...b]);
});

test("a carrier-less core survives the round trip on both sides", () => {
  // null is the common case — the Core is loose for most of a match — and it is
  // the one value that is not a slot number, so it gets its own sentinel.
  const loose = { ...CORE, carrier: null };
  const viaWorker = client.netDecodeState(
    worker.encodeState(worker.KIND_SNAPSHOT, 1, [], loose),
  );
  const viaClient = worker.decodeState(
    client.netEncodeState(client.NET_KIND_SNAPSHOT, 1, [], loose),
  );
  assert.equal(viaWorker.core.carrier, null);
  assert.equal(viaClient.core.carrier, null);
});

test("a frame with no aircraft and no core is still well formed", () => {
  const decoded = client.netDecodeState(worker.encodeState(worker.KIND_STATE, 7, [], null));
  assert.equal(decoded.aircraft.length, 0);
  assert.equal(decoded.core, null);
});

test("both decoders reject a frame whose length contradicts its header", () => {
  // The failure this prevents: decoding whichever records happen to fit, which
  // hands the game a half-filled snapshot and shows up as one aircraft parked
  // at the origin rather than as an error anyone can trace.
  const full = worker.encodeState(worker.KIND_SNAPSHOT, 1, AIRCRAFT, CORE);
  const truncated = full.slice(0, full.byteLength - 5);
  assert.equal(worker.decodeState(truncated), null);
  assert.equal(client.netDecodeState(truncated), null);

  const padded = new Uint8Array(full.byteLength + 3);
  padded.set(new Uint8Array(full));
  assert.equal(worker.decodeState(padded.buffer), null);
  assert.equal(client.netDecodeState(padded.buffer), null);
});

test("both decoders reject an unknown message kind", () => {
  const buffer = worker.encodeState(worker.KIND_STATE, 1, AIRCRAFT, null);
  new DataView(buffer).setUint8(0, 99);
  assert.equal(worker.decodeState(buffer), null);
  assert.equal(client.netDecodeState(buffer), null);
});

test("both decoders reject a frame too short to hold a header", () => {
  const stub = new ArrayBuffer(4);
  assert.equal(worker.decodeState(stub), null);
  assert.equal(client.netDecodeState(stub), null);
});

test("out-of-range health and throttle are clamped identically, not wrapped", () => {
  // Health and throttle ride in one byte each. Without the clamp a client
  // reporting 260 health would wrap to 4, which reads as a nearly-dead aircraft
  // rather than as bad input.
  const wild = [{ ...AIRCRAFT[0], hp: 260, throttle: 4 }];
  const fromWorker = client.netDecodeState(worker.encodeState(worker.KIND_STATE, 1, wild, null));
  const fromClient = worker.decodeState(
    client.netEncodeState(client.NET_KIND_STATE, 1, wild, null),
  );
  assert.equal(fromWorker.aircraft[0].hp, 100);
  assert.equal(fromClient.aircraft[0].hp, 100);
  assert.equal(fromWorker.aircraft[0].throttle, 1);
  assert.equal(fromClient.aircraft[0].throttle, 1);

  const negative = [{ ...AIRCRAFT[0], hp: -30, throttle: -2 }];
  assert.equal(
    client.netDecodeState(worker.encodeState(worker.KIND_STATE, 1, negative, null)).aircraft[0].hp,
    0,
  );
  assert.equal(
    worker.decodeState(client.netEncodeState(client.NET_KIND_STATE, 1, negative, null))
      .aircraft[0].hp,
    0,
  );
});

test("a NaN slipped into a state field does not corrupt the rest of the frame", () => {
  // A stalled aircraft can produce a NaN in the simulation. It must not be able
  // to take the whole packet with it, because the fields after it belong to
  // other aircraft.
  const poisoned = [{ ...AIRCRAFT[0], hp: NaN, throttle: NaN }, AIRCRAFT[1]];
  const decoded = client.netDecodeState(worker.encodeState(worker.KIND_STATE, 1, poisoned, null));
  assert.equal(decoded.aircraft[0].hp, 0);
  assert.equal(decoded.aircraft[0].throttle, 0);
  assert.equal(decoded.aircraft[1].slot, AIRCRAFT[1].slot);
  assert.equal(decoded.aircraft[1].px, AIRCRAFT[1].px);
});

test("slot numbering is absolute and matches on both sides", () => {
  // Slots must never be fighters[] indices: that array is built with the
  // player's own team first and is rebuilt whenever the player switches sides,
  // so an index-based wire would swap two aircraft the moment anyone did.
  for (let i = 0; i < worker.SLOTS_PER_TEAM; i += 1) {
    assert.equal(worker.slotId("blue", i), client.netSlotId("blue", i));
    assert.equal(worker.slotId("red", i), client.netSlotId("red", i));
  }
  assert.deepEqual(
    [worker.slotId("blue", 0), worker.slotId("blue", 3), worker.slotId("red", 0), worker.slotId("red", 3)],
    [0, 3, 4, 7],
  );
  for (let slot = 0; slot < worker.MAX_SLOTS; slot += 1) {
    assert.equal(worker.slotTeam(slot), client.netSlotTeam(slot));
    assert.equal(worker.slotIndex(slot), client.netSlotIndex(slot));
    assert.equal(worker.slotId(worker.slotTeam(slot), worker.slotIndex(slot)), slot);
  }
});

test("room codes validate the same way on both sides", () => {
  const cases = ["ABCDE", "23456", "", "ABC", "ABCDEF", "aabbc", "A1CDE", "OOOOO", "23-45"];
  for (const code of cases) {
    assert.equal(
      worker.isRoomCode(code),
      client.netIsRoomCode(code),
      `disagreement on room code ${JSON.stringify(code)}`,
    );
  }
  // The alphabet drops vowels and the 0/O/1/I/L confusions on purpose: a code
  // gets read aloud and typed back in.
  for (const ch of "AEIOU01IL") {
    assert.ok(!worker.ROOM_CODE_ALPHABET.includes(ch), `${ch} should not be in the alphabet`);
  }
});

test("normalising a room code strips punctuation and case on both sides", () => {
  for (const raw of [" b2c3d ", "b2-c3d", "b2c3d", "nope", "toolongcode"]) {
    assert.equal(worker.normaliseRoomCode(raw), client.netNormaliseRoomCode(raw));
  }
  assert.equal(worker.normaliseRoomCode(" b2-c3d "), "B2C3D");
});
