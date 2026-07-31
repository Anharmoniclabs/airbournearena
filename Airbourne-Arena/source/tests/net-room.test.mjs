// The decisions a match room makes, tested without a Workers runtime. These
// are the rules that determine which aircraft you get, who simulates the ones
// nobody is flying, and what the scoreboard is allowed to say.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MAX_SLOTS, slotId, slotTeam } from "../worker/protocol.mjs";
import {
  MATCH_TIME,
  TARGET_SCORE,
  aiSlots,
  applyScore,
  clockRemaining,
  makeRoomCode,
  matchOver,
  pickHost,
  pickSlot,
  rosterEntry,
  sanitiseCallsign,
} from "../worker/room-state.mjs";
import { isRoomCode } from "../worker/protocol.mjs";

test("the server's match rules match the game's own constants", async () => {
  // The server is authoritative over the scoreboard and the clock, so if these
  // drift the HUD counts down to a different number than the match ends on.
  const arena = await readFile(new URL("../../src/game/06-arena.js", import.meta.url), "utf8");
  const time = arena.match(/MATCH_TIME=(\d+)/);
  const score = arena.match(/TARGET_SCORE=(\d+)/);
  assert.ok(time && score, "could not find MATCH_TIME/TARGET_SCORE in 06-arena.js");
  assert.equal(Number(time[1]), MATCH_TIME);
  assert.equal(Number(score[1]), TARGET_SCORE);
});

test("the first pilot into an empty room gets blue slot 0", () => {
  assert.equal(pickSlot([], null), slotId("blue", 0));
});

test("joins alternate sides so a filling room stays even", () => {
  const occupied = [];
  const teams = [];
  for (let i = 0; i < MAX_SLOTS; i += 1) {
    const slot = pickSlot(occupied, null);
    occupied.push(slot);
    teams.push(slotTeam(slot));
  }
  assert.equal(teams.filter((t) => t === "blue").length, 4);
  assert.equal(teams.filter((t) => t === "red").length, 4);
  assert.deepEqual(teams.slice(0, 4), ["blue", "red", "blue", "red"]);
});

test("an explicit side request wins while that side has room", () => {
  // Two friends who both pick red should end up on red. Balance is the
  // tie-break for players who did not ask, not an override for players who did.
  assert.equal(slotTeam(pickSlot([], "red")), "red");
  assert.equal(slotTeam(pickSlot([slotId("red", 0)], "red")), "red");
  assert.equal(pickSlot([slotId("red", 0)], "red"), slotId("red", 1));
});

test("a request for a full side falls back rather than refusing the join", () => {
  const redFull = [0, 1, 2, 3].map((i) => slotId("red", i));
  assert.equal(slotTeam(pickSlot(redFull, "red")), "blue");
});

test("a full room has no slot to give", () => {
  const all = [];
  for (let s = 0; s < MAX_SLOTS; s += 1) all.push(s);
  assert.equal(pickSlot(all, null), null);
});

test("slots are filled from the lowest index up within a side", () => {
  // Slot 0 of each team carries the lead callsign in the browser game, so
  // filling upward means the first human on a side gets the name already shown.
  assert.equal(pickSlot([slotId("blue", 0), slotId("red", 0)], "blue"), slotId("blue", 1));
});

test("the arena host is the pilot who has been in the room longest", () => {
  const members = [
    { slot: 4, joinSeq: 7, ready: true },
    { slot: 1, joinSeq: 2, ready: true },
    { slot: 6, joinSeq: 9, ready: true },
  ];
  assert.equal(pickHost(members), 1);
});

test("a socket that has not identified itself cannot become the host", () => {
  // A connection that opens and never sends its hello holds no slot; letting it
  // host would hand the AI aircraft and the Core to nobody.
  const members = [
    { slot: null, joinSeq: 1, ready: false },
    { slot: 3, joinSeq: 5, ready: true },
  ];
  assert.equal(pickHost(members), 3);
});

test("an empty room has no host", () => {
  assert.equal(pickHost([]), null);
  assert.equal(pickHost([{ slot: null, joinSeq: 1, ready: false }]), null);
});

test("the host moves on when the longest-serving pilot leaves", () => {
  const members = [
    { slot: 0, joinSeq: 1, ready: true },
    { slot: 5, joinSeq: 4, ready: true },
  ];
  assert.equal(pickHost(members), 0);
  assert.equal(pickHost(members.filter((m) => m.slot !== 0)), 5);
});

test("every seat nobody holds is reported as an AI seat", () => {
  assert.deepEqual(aiSlots([]), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(aiSlots([0, 4]), [1, 2, 3, 5, 6, 7]);
  assert.deepEqual(aiSlots([0, 1, 2, 3, 4, 5, 6, 7]), []);
});

test("a capture adds exactly one to exactly one side", () => {
  const start = { blue: 0, red: 0 };
  const blue = applyScore(start, "blue");
  assert.deepEqual(blue.score, { blue: 1, red: 0 });
  assert.equal(blue.changed, true);
  // applyScore must not mutate the score it was handed, or a rejected event
  // would still have moved the scoreboard.
  assert.deepEqual(start, { blue: 0, red: 0 });
  assert.deepEqual(applyScore(start, "red").score, { blue: 0, red: 1 });
});

test("a capture for a team that does not exist changes nothing", () => {
  // This is the shape a malformed or hostile event arrives in. The scoreboard is
  // the one number a client does not get to assert, so an unrecognised team is
  // dropped rather than defaulted to a side.
  const result = applyScore({ blue: 2, red: 1 }, "green");
  assert.equal(result.changed, false);
  assert.deepEqual(result.score, { blue: 2, red: 1 });
});

test("a match ends on the target score or on the clock, and not before", () => {
  assert.equal(matchOver({ blue: 0, red: 0 }, MATCH_TIME), false);
  assert.equal(matchOver({ blue: TARGET_SCORE - 1, red: 0 }, 100), false);
  assert.equal(matchOver({ blue: TARGET_SCORE, red: 0 }, 100), true);
  assert.equal(matchOver({ blue: 0, red: TARGET_SCORE }, 100), true);
  assert.equal(matchOver({ blue: 1, red: 1 }, 0), true);
});

test("the clock is derived from wall time, so hibernation cannot stop it", () => {
  // A Durable Object sleeps between packets. A counted-down clock would resume
  // from wherever it was when the room went quiet; a derived one wakes up right.
  const start = 1_000_000;
  assert.equal(clockRemaining(0, start), MATCH_TIME);
  assert.equal(clockRemaining(start, start), MATCH_TIME);
  assert.equal(clockRemaining(start, start + 30_000), MATCH_TIME - 30);
  assert.equal(clockRemaining(start, start + MATCH_TIME * 1000), 0);
});

test("the clock never runs past zero into negative time", () => {
  assert.equal(clockRemaining(1000, 1000 + (MATCH_TIME + 600) * 1000), 0);
});

test("generated room codes are always valid room codes", () => {
  for (let i = 0; i < 500; i += 1) {
    assert.ok(isRoomCode(makeRoomCode()), "generated an invalid room code");
  }
});

test("room code generation covers the alphabet rather than repeating", () => {
  // A generator stuck on one character would still produce "valid" codes.
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) for (const ch of makeRoomCode()) seen.add(ch);
  assert.ok(seen.size > 20, `only ${seen.size} distinct characters ever generated`);
});

test("callsigns are clamped to the same shape the hangar enforces", () => {
  assert.equal(sanitiseCallsign("viper"), "VIPER");
  assert.equal(sanitiseCallsign("  mara  "), "MARA");
  assert.equal(sanitiseCallsign("ab<script>"), "ABSCRIPT");
  assert.equal(sanitiseCallsign("A".repeat(40)), "A".repeat(10));
  assert.equal(sanitiseCallsign(""), "PILOT");
  assert.equal(sanitiseCallsign(null), "PILOT");
  assert.equal(sanitiseCallsign("!!!"), "PILOT");
});

test("a callsign of only punctuation cannot blank out a roster row", () => {
  // Callsigns are the only free text on the wire and they are rendered into the
  // roster and the kill feed, so an empty or markup-shaped one has to become
  // something printable before it ever leaves the server.
  for (const raw of ["<>", "   ", "\n\t", "&amp;"]) {
    const name = sanitiseCallsign(raw);
    assert.ok(name.length > 0);
    assert.ok(!/[<>&]/.test(name), `${JSON.stringify(raw)} kept markup characters`);
  }
});

test("a roster entry carries the slot, its team and a safe callsign", () => {
  assert.deepEqual(rosterEntry({ slot: 5, callsign: "ace<>", joinSeq: 2 }), {
    slot: 5,
    team: "red",
    callsign: "ACE",
  });
});
