/* ===================== MatchRoom Durable Object =====================
   One instance per room code. Owns the socket set, the slot assignments, the
   scoreboard and the match clock; relays everything else.

   The authority split is deliberate and narrow. Each client simulates its own
   aircraft and is believed about where it is — that is what makes your own
   aeroplane feel like it has no network in front of it, which for a flight game
   is the whole ballgame. The server only refuses to believe a client about two
   things: which aircraft it is allowed to move, and what the score is. */

import {
  C,
  S,
  EV,
  REJECT,
  PROTOCOL_VERSION,
  KIND_SNAPSHOT,
  KIND_STATE,
  TIMEOUT_MS,
  decodeState,
  encodeState,
  slotTeam,
} from "./protocol.mjs";
import {
  MATCH_TIME,
  aiSlots,
  applyScore,
  clockRemaining,
  matchOver,
  pickHost,
  pickSlot,
  rosterEntry,
  sanitiseCallsign,
} from "./room-state.mjs";

const SCORE_BROADCAST_MS = 1000;

export class MatchRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.joinSeq = 0;
    this.hostSlot = null;
    this.score = { blue: 0, red: 0 };
    this.startedAt = 0;
    this.over = false;
    this.lastScoreBroadcast = 0;
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    const saved = await this.state.storage.get("room");
    if (saved) {
      this.score = saved.score;
      this.startedAt = saved.startedAt;
      this.over = saved.over;
      this.joinSeq = saved.joinSeq || 0;
    }
    this.loaded = true;
  }

  async save() {
    await this.state.storage.put("room", {
      score: this.score,
      startedAt: this.startedAt,
      over: this.over,
      joinSeq: this.joinSeq,
    });
  }

  /* Hibernation keeps no JavaScript object alive between messages, so a
     connection's identity lives on the socket itself rather than in a map that
     would silently empty out. */
  members() {
    const out = [];
    for (const ws of this.state.getWebSockets()) {
      const meta = ws.deserializeAttachment();
      if (meta) out.push({ ws, ...meta });
    }
    return out;
  }

  occupied() {
    return this.members().filter((m) => m.ready).map((m) => m.slot);
  }

  async fetch(request) {
    /* Room-code minting asks whether a candidate code is already in use. It has
       to be a real occupancy answer — replying "not a websocket" to everything
       would make every code look free and reintroduce the collision it exists
       to prevent. */
    if (new URL(request.url).pathname === "/probe") {
      await this.load();
      const live = this.members().filter((m) => m.ready).length;
      return new Response(JSON.stringify({ live }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    await this.load();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    /* Not `ready` until the hello arrives: a socket that connects and never
       identifies itself must not hold a slot open. */
    server.serializeAttachment({ ready: false, slot: null, callsign: "", joinSeq: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.load();
    if (typeof message === "string") {
      let parsed;
      try {
        parsed = JSON.parse(message);
      } catch {
        return;
      }
      await this.onControl(ws, parsed);
      return;
    }
    this.onHotState(ws, message);
  }

  async onControl(ws, msg) {
    const meta = ws.deserializeAttachment() || {};
    if (msg.t === C.HELLO) {
      if (meta.ready) return;
      if (msg.v !== PROTOCOL_VERSION) {
        send(ws, { t: S.REJECT, why: REJECT.VERSION, need: PROTOCOL_VERSION });
        ws.close(4001, "protocol version");
        return;
      }
      const slot = pickSlot(this.occupied(), msg.team === "red" ? "red" : msg.team === "blue" ? "blue" : null);
      if (slot === null) {
        send(ws, { t: S.REJECT, why: REJECT.FULL });
        ws.close(4002, "room full");
        return;
      }
      this.joinSeq += 1;
      const next = {
        ready: true,
        slot,
        callsign: sanitiseCallsign(msg.callsign),
        joinSeq: this.joinSeq,
      };
      ws.serializeAttachment(next);
      /* The clock starts with the first pilot in, not at room creation — a room
         opened while someone reads the code out loud should not spend its match
         time waiting. */
      if (!this.startedAt) this.startedAt = Date.now();
      await this.save();
      this.reassignHost();

      const roster = this.members().filter((m) => m.ready).map(rosterEntry);
      send(ws, {
        t: S.WELCOME,
        v: PROTOCOL_VERSION,
        you: { slot, team: slotTeam(slot) },
        roster,
        host: this.hostSlot,
        ai: aiSlots(this.occupied()),
        score: this.score,
        clock: clockRemaining(this.startedAt, Date.now()),
        over: this.over,
      });
      this.broadcast(
        { t: S.PEER_JOIN, ...rosterEntry(next), ai: aiSlots(this.occupied()), host: this.hostSlot },
        ws,
      );
      return;
    }

    if (!meta.ready) return;

    if (msg.t === C.HIT) {
      /* A hit claim is routed only to the client that owns the target, which is
         the one that will decide whether it landed. Broadcasting it would let
         every client apply the same damage independently. */
      const target = this.memberForSlot(msg.slot);
      const payload = { t: S.HIT, slot: msg.slot, dmg: msg.dmg, by: meta.slot };
      if (target) send(target.ws, payload);
      else if (this.hostSlot !== null) {
        const host = this.memberForSlot(this.hostSlot);
        if (host) send(host.ws, payload);
      }
      return;
    }

    if (msg.t === C.EVENT) {
      if (msg.ev === EV.CORE_SCORE) {
        /* Only the arena host runs the Core, so only the arena host can report a
           capture. Everyone else saying so is ignored. */
        if (meta.slot !== this.hostSlot) return;
        const team = slotTeam(msg.slot);
        const result = applyScore(this.score, team);
        if (!result.changed) return;
        this.score = result.score;
        await this.save();
        /* The host already ran the capture locally, so it is excluded from the
           echo — it learns the authoritative numbers from the SCORE message
           that follows, like everyone else. */
        this.broadcast({ t: S.EVENT, ev: EV.CORE_SCORE, slot: msg.slot, by: meta.slot }, ws);
        await this.pushScore(true);
        return;
      }
      if (msg.ev === EV.REMATCH) {
        /* Only from a finished match, or a pilot could wipe the scoreboard
           mid-fight. Everyone including the caller is told, because no client
           resets locally first — that is what keeps the room in step. */
        if (!this.over) return;
        this.score = { blue: 0, red: 0 };
        this.startedAt = Date.now();
        this.over = false;
        await this.save();
        this.broadcast({ t: S.EVENT, ev: EV.REMATCH, slot: meta.slot, by: meta.slot });
        await this.pushScore(true);
        return;
      }
      /* Everything else is presentation and local truth the owner already
         decided: relayed verbatim, minus the sender. */
      this.broadcast({ t: S.EVENT, ev: msg.ev, slot: msg.slot, by: meta.slot, d: msg.d }, ws);
      return;
    }

    if (msg.t === C.BYE) {
      ws.close(1000, "bye");
    }
  }

  onHotState(ws, buffer) {
    const meta = ws.deserializeAttachment();
    if (!meta || !meta.ready) return;
    const decoded = decodeState(buffer);
    if (!decoded || decoded.kind !== KIND_STATE) return;

    /* The ownership filter. Without it any client could address a record to
       another player's slot and fly their aircraft for them. */
    const isHost = meta.slot === this.hostSlot;
    const owned = new Set([meta.slot]);
    if (isHost) for (const s of aiSlots(this.occupied())) owned.add(s);
    const aircraft = decoded.aircraft.filter((a) => owned.has(a.slot));
    if (!aircraft.length && !(isHost && decoded.core)) return;

    const snapshot = encodeState(
      KIND_SNAPSHOT,
      Date.now(),
      aircraft,
      isHost ? decoded.core : null,
    );
    this.broadcast(snapshot, ws);
    this.maybePushScore();
  }

  async maybePushScore() {
    const now = Date.now();
    if (now - this.lastScoreBroadcast < SCORE_BROADCAST_MS) return;
    await this.pushScore(false);
  }

  async pushScore(force) {
    const now = Date.now();
    this.lastScoreBroadcast = now;
    const remaining = clockRemaining(this.startedAt, now);
    const ended = matchOver(this.score, remaining);
    if (ended && !this.over) {
      this.over = true;
      await this.save();
    }
    if (!force && !ended && !this.members().length) return;
    this.broadcast({
      t: S.SCORE,
      blue: this.score.blue,
      red: this.score.red,
      clock: remaining,
      over: this.over,
    });
  }

  memberForSlot(slot) {
    return this.members().find((m) => m.ready && m.slot === slot) || null;
  }

  /* `among` lets the close handler elect from the survivors explicitly. Whether
     the runtime has already dropped a closing socket from getWebSockets() by the
     time webSocketClose runs is not worth depending on, and a departed pilot
     left in the pool would be re-elected host of a room it is not in. */
  reassignHost(among) {
    const next = pickHost(among || this.members());
    if (next === this.hostSlot) return;
    this.hostSlot = next;
    if (next === null) return;
    this.broadcast({ t: S.HOST, slot: next, ai: aiSlots(this.occupied()) });
  }

  async webSocketClose(ws) {
    await this.dropped(ws);
  }

  async webSocketError(ws) {
    await this.dropped(ws);
  }

  async dropped(ws) {
    await this.load();
    const meta = ws.deserializeAttachment();
    /* Everything below works from the survivors, identified by socket rather
       than by re-reading the pool, so none of it depends on when the runtime
       stops returning a closing socket from getWebSockets(). */
    const survivors = this.members().filter((m) => m.ws !== ws && m.ready);
    try {
      ws.serializeAttachment({ ready: false, slot: null, callsign: "", joinSeq: 0 });
    } catch {
      /* closed too far to write to; the survivor list above already excludes it */
    }
    try {
      ws.close();
    } catch {
      /* already closed — the attachment we read above is all this needed */
    }
    if (!meta || !meta.ready) return;
    /* The slot goes back to the AI rather than leaving a hole in the roster,
       which is the whole reason drop-in works: an unflown aircraft is the
       game's normal state, not an error case. */
    this.broadcast({
      t: S.PEER_LEAVE,
      slot: meta.slot,
      ai: aiSlots(survivors.map((m) => m.slot)),
    });
    this.reassignHost(survivors);
    if (!survivors.length) {
      /* Last one out resets the room, so a stale code that gets reused starts a
         fresh match instead of resuming a finished one. */
      this.score = { blue: 0, red: 0 };
      this.startedAt = 0;
      this.over = false;
      await this.save();
    }
  }

  broadcast(payload, except) {
    const data = typeof payload === "string" || payload instanceof ArrayBuffer
      ? payload
      : JSON.stringify(payload);
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      const meta = ws.deserializeAttachment();
      if (!meta || !meta.ready) continue;
      try {
        ws.send(data);
      } catch {
        /* a socket that fails mid-broadcast is handled by its own close event */
      }
    }
  }
}

function send(ws, payload) {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    /* closed underneath us; the close handler does the cleanup */
  }
}

export { MATCH_TIME, TIMEOUT_MS };
