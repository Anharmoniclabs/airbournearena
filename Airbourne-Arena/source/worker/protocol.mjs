/* ===================== Airbourne Arena net protocol =====================
   Canonical definition. The browser game carries a hand-kept copy of this file
   at src/game/53-net-protocol.js, because the game is a concatenated IIFE that
   has to stay loadable from a file:// URL and so cannot import an ES module.
   tests/net-protocol.test.mjs encodes with one copy and decodes with the other
   in both directions, which is what actually stops the two drifting.

   Two channels over one socket:

     control  JSON strings  — join, roster, score, match events. Rare, readable.
     hot      ArrayBuffers  — aircraft state at STATE_HZ. Frequent, packed.

   A WebSocket delivers strings and binary frames distinguishably, so the
   channel a message arrived on already identifies which decoder to use. */

export const PROTOCOL_VERSION = 1;

/* Bumping the wire format without bumping this is how you ship a build that
   silently mis-reads every packet from the previous one. The server rejects a
   hello whose version it does not recognise rather than guessing. */
export const STATE_HZ = 20;
export const SNAPSHOT_HZ = 20;

/* How far behind live the remote aircraft are rendered. One and a bit state
   intervals: enough that a late packet still arrives before its frame is due,
   short enough that the lead you pull on a remote target is honest. */
export const INTERP_DELAY_MS = 110;
/* Past this with no fresh packet, a remote stops being extrapolated and just
   holds its last attitude — a frozen aircraft reads as a network problem,
   whereas one that keeps flying on a stale velocity reads as a teleport when
   the packets resume. */
export const EXTRAPOLATE_MAX_MS = 250;
/* A connection silent for this long is dropped and its slot handed back to the
   AI. Generous, because a browser tab throttled in the background stops sending
   long before the player has actually left. */
export const TIMEOUT_MS = 12000;
export const HEARTBEAT_MS = 3000;

export const MAX_SLOTS = 8;
export const SLOTS_PER_TEAM = 4;
export const ROOM_CODE_LENGTH = 5;
/* No vowels and no 0/O/1/I/L: a room code gets read aloud and typed by hand. */
export const ROOM_CODE_ALPHABET = "23456789BCDFGHJKMNPQRSTVWXYZ";

/* ---------- control messages (JSON) ---------- */
export const C = {
  HELLO: "hello",
  STATE_ACK: "ack",
  HIT: "hit",
  EVENT: "event",
  BYE: "bye",
};
export const S = {
  WELCOME: "welcome",
  REJECT: "reject",
  PEER_JOIN: "peer_join",
  PEER_LEAVE: "peer_leave",
  HOST: "host",
  SCORE: "score",
  HIT: "hit",
  EVENT: "event",
};

/* Gameplay events that must reach every client exactly as the owning client
   decided them. These are relayed verbatim; only SCORE is re-derived by the
   server, because the scoreboard is the one number worth not trusting a client
   with. */
export const EV = {
  KILL: "kill",
  RESPAWN: "respawn",
  CORE_GRAB: "core_grab",
  CORE_PASS: "core_pass",
  CORE_DROP: "core_drop",
  CORE_SCORE: "core_score",
  DAMAGE: "damage",
  /* Any pilot may call a rematch, and only once the match is actually over.
     Restricting it to the arena host would strand a finished room whenever the
     host is the one who walked away from the keyboard. */
  REMATCH: "rematch",
};

export const REJECT = {
  VERSION: "version",
  FULL: "full",
  BAD_ROOM: "bad_room",
};

/* ---------- slot numbering ----------
   Slots are absolute and team-derived: 0-3 blue, 4-7 red. The game's own
   fighters[] array is built in the player's-team-first order and so is
   reordered whenever the player switches sides — indexing the wire by array
   position would silently swap two aircraft the moment someone changed team in
   the hangar. */
export function slotId(team, index) {
  return (team === "red" ? SLOTS_PER_TEAM : 0) + index;
}
export function slotTeam(slot) {
  return slot < SLOTS_PER_TEAM ? "blue" : "red";
}
export function slotIndex(slot) {
  return slot % SLOTS_PER_TEAM;
}

/* ---------- hot path binary codec ----------
   Layout, little-endian:

     u8   message kind (KIND_STATE from a client, KIND_SNAPSHOT from the server)
     u8   aircraft record count
     u8   1 if a core record follows the aircraft records
     u8   reserved, zero
     f64  time, ms — the sender's clock for a state, the server's for a snapshot

     per aircraft, 44 bytes:
       u8  slot
       u8  flags
       u8  hp, 0-100
       u8  throttle, 0-255
       f32 position x, y, z
       f32 quaternion x, y, z, w
       f32 velocity x, y, z

     core, 28 bytes:
       u8  carrier slot, or CORE_NO_CARRIER
       u8  charge, 0-100
       u16 reserved, zero
       f32 position x, y, z
       f32 velocity x, y, z

   Quaternions ship as four raw f32 rather than smallest-three: at eight
   aircraft and 20 Hz the saving is under 3 KB/s and the reconstruction bug it
   invites costs more than the bandwidth. */
export const KIND_STATE = 1;
export const KIND_SNAPSHOT = 2;

export const HEADER_BYTES = 12;
export const AIRCRAFT_BYTES = 44;
export const CORE_BYTES = 28;
export const CORE_NO_CARRIER = 0xff;

export const FLAG_ALIVE = 1 << 0;
export const FLAG_CARRYING = 1 << 1;
export const FLAG_BURNER = 1 << 2;
export const FLAG_FIRING = 1 << 3;
export const FLAG_STALLED = 1 << 4;

export function encodeState(kind, time, aircraft, core) {
  const count = aircraft.length;
  const hasCore = core ? 1 : 0;
  const buffer = new ArrayBuffer(
    HEADER_BYTES + count * AIRCRAFT_BYTES + hasCore * CORE_BYTES,
  );
  const view = new DataView(buffer);
  view.setUint8(0, kind);
  view.setUint8(1, count);
  view.setUint8(2, hasCore);
  view.setUint8(3, 0);
  view.setFloat64(4, time, true);

  let at = HEADER_BYTES;
  for (let i = 0; i < count; i += 1) {
    const a = aircraft[i];
    view.setUint8(at, a.slot);
    view.setUint8(at + 1, a.flags);
    /* hp and throttle are quantised, so a client that sends 100.4 or 1.0000001
       cannot push a value past the byte and wrap it to zero. */
    view.setUint8(at + 2, clampByte(a.hp, 100));
    view.setUint8(at + 3, clampByte(Math.round(a.throttle * 255), 255));
    view.setFloat32(at + 4, a.px, true);
    view.setFloat32(at + 8, a.py, true);
    view.setFloat32(at + 12, a.pz, true);
    view.setFloat32(at + 16, a.qx, true);
    view.setFloat32(at + 20, a.qy, true);
    view.setFloat32(at + 24, a.qz, true);
    view.setFloat32(at + 28, a.qw, true);
    view.setFloat32(at + 32, a.vx, true);
    view.setFloat32(at + 36, a.vy, true);
    view.setFloat32(at + 40, a.vz, true);
    at += AIRCRAFT_BYTES;
  }

  if (core) {
    view.setUint8(at, core.carrier === null ? CORE_NO_CARRIER : core.carrier);
    view.setUint8(at + 1, clampByte(core.charge, 100));
    view.setUint16(at + 2, 0, true);
    view.setFloat32(at + 4, core.px, true);
    view.setFloat32(at + 8, core.py, true);
    view.setFloat32(at + 12, core.pz, true);
    view.setFloat32(at + 16, core.vx, true);
    view.setFloat32(at + 20, core.vy, true);
    view.setFloat32(at + 24, core.vz, true);
  }
  return buffer;
}

export function decodeState(buffer) {
  const bytes = buffer.byteLength;
  if (bytes < HEADER_BYTES) return null;
  const view = new DataView(buffer);
  const kind = view.getUint8(0);
  if (kind !== KIND_STATE && kind !== KIND_SNAPSHOT) return null;
  const count = view.getUint8(1);
  const hasCore = view.getUint8(2) === 1;
  /* A truncated or over-long frame is a malformed frame. Decoding the records
     that happen to fit would hand the game a half-populated snapshot, which
     surfaces as one aircraft stuck at the origin rather than as a network
     error anyone can find. */
  if (bytes !== HEADER_BYTES + count * AIRCRAFT_BYTES + (hasCore ? CORE_BYTES : 0)) {
    return null;
  }
  const time = view.getFloat64(4, true);

  const aircraft = [];
  let at = HEADER_BYTES;
  for (let i = 0; i < count; i += 1) {
    aircraft.push({
      slot: view.getUint8(at),
      flags: view.getUint8(at + 1),
      hp: view.getUint8(at + 2),
      throttle: view.getUint8(at + 3) / 255,
      px: view.getFloat32(at + 4, true),
      py: view.getFloat32(at + 8, true),
      pz: view.getFloat32(at + 12, true),
      qx: view.getFloat32(at + 16, true),
      qy: view.getFloat32(at + 20, true),
      qz: view.getFloat32(at + 24, true),
      qw: view.getFloat32(at + 28, true),
      vx: view.getFloat32(at + 32, true),
      vy: view.getFloat32(at + 36, true),
      vz: view.getFloat32(at + 40, true),
    });
    at += AIRCRAFT_BYTES;
  }

  let core = null;
  if (hasCore) {
    const carrier = view.getUint8(at);
    core = {
      carrier: carrier === CORE_NO_CARRIER ? null : carrier,
      charge: view.getUint8(at + 1),
      px: view.getFloat32(at + 4, true),
      py: view.getFloat32(at + 8, true),
      pz: view.getFloat32(at + 12, true),
      vx: view.getFloat32(at + 16, true),
      vy: view.getFloat32(at + 20, true),
      vz: view.getFloat32(at + 24, true),
    };
  }
  return { kind, time, aircraft, core };
}

function clampByte(value, max) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > max) return max;
  return Math.round(value);
}

/* Room codes are generated server-side so two hosts cannot race onto the same
   one, but both sides validate the shape: the client so a typo never opens a
   socket, the server so a crafted code cannot address an arbitrary
   Durable Object name. */
export function isRoomCode(code) {
  if (typeof code !== "string" || code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export function normaliseRoomCode(raw) {
  const code = String(raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return isRoomCode(code) ? code : null;
}
