/* ===================== match room decisions =====================
   The parts of a room that are pure functions of its state, kept out of the
   Durable Object so they can be tested without a Workers runtime. The DO in
   match-room.mjs owns sockets, storage and time; everything here is arithmetic
   over plain objects. */

import {
  MAX_SLOTS,
  SLOTS_PER_TEAM,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  slotId,
  slotTeam,
} from "./protocol.mjs";

/* Mirrors src/game/06-arena.js. A mismatch here does not desync the
   simulation — the server is only authoritative over the scoreboard and the
   clock — but it does mean the HUD counts down to a different number than the
   match ends on, so the test suite pins them together. */
export const MATCH_TIME = 300;
export const TARGET_SCORE = 3;

/* Fill the emptier side first, and the lowest free index within it. Slot 0 of
   each team carries the lead callsign in the browser game, so filling upward
   means the first human on a side gets the name the roster already shows. */
export function pickSlot(occupied, preferredTeam) {
  const taken = new Set(occupied);
  const free = (team) => {
    const out = [];
    for (let i = 0; i < SLOTS_PER_TEAM; i += 1) {
      const id = slotId(team, i);
      if (!taken.has(id)) out.push(id);
    }
    return out;
  };
  const blue = free("blue");
  const red = free("red");
  if (!blue.length && !red.length) return null;

  /* An explicit request wins while that side still has room, so two friends who
     both pick red end up on red rather than being balanced apart. Balance is
     the tie-break, not an override. */
  if (preferredTeam === "blue" && blue.length) return blue[0];
  if (preferredTeam === "red" && red.length) return red[0];

  const blueHumans = SLOTS_PER_TEAM - blue.length;
  const redHumans = SLOTS_PER_TEAM - red.length;
  if (!red.length) return blue[0];
  if (!blue.length) return red[0];
  return blueHumans <= redHumans ? blue[0] : red[0];
}

/* The arena host is whichever human has been in the room longest. It owns the
   aircraft nobody is flying and the Core, because those need exactly one
   simulator and any consistent rule will do — "longest here" just has the
   useful property that it changes as rarely as possible. */
export function pickHost(members) {
  let best = null;
  for (const m of members) {
    if (!m.ready) continue;
    if (!best || m.joinSeq < best.joinSeq) best = m;
  }
  return best ? best.slot : null;
}

/* Slots with nobody in them stay under AI control, and the host is told which
   ones so it knows what to simulate. */
export function aiSlots(occupied) {
  const taken = new Set(occupied);
  const out = [];
  for (let s = 0; s < MAX_SLOTS; s += 1) if (!taken.has(s)) out.push(s);
  return out;
}

/* The scoreboard is the one number a client does not get to assert. A client
   reports "I ran the Core in"; the server decides what that does to the score,
   so a modified build can at worst claim a capture it did not make, not set
   itself to 99. */
export function applyScore(score, team) {
  const next = { blue: score.blue, red: score.red };
  if (team === "blue") next.blue += 1;
  else if (team === "red") next.red += 1;
  else return { score: next, changed: false };
  return { score: next, changed: true };
}

export function matchOver(score, remaining) {
  return score.blue >= TARGET_SCORE || score.red >= TARGET_SCORE || remaining <= 0;
}

/* The clock is derived from wall time rather than counted down by a timer, so
   a Durable Object that hibernates between packets wakes up with the right
   answer instead of a clock that stopped while nobody was looking. */
export function clockRemaining(startedAt, now) {
  if (!startedAt) return MATCH_TIME;
  const elapsed = (now - startedAt) / 1000;
  const left = MATCH_TIME - elapsed;
  return left > 0 ? left : 0;
}

export function makeRoomCode(random = Math.random) {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/* What a joining client is told about everyone already in the room. Callsigns
   are the only free text on the wire, so they are clamped to the same shape the
   hangar's own callsign field enforces. */
export function rosterEntry(member) {
  return {
    slot: member.slot,
    team: slotTeam(member.slot),
    callsign: sanitiseCallsign(member.callsign),
  };
}

export function sanitiseCallsign(raw) {
  const clean = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 \-]/g, "")
    .slice(0, 10)
    .trim();
  return clean || "PILOT";
}
