/* ===================== arena worker entry =====================
   Routes room creation and socket upgrades to a MatchRoom Durable Object.

   This deploys separately from the game itself. The game is a static artifact
   on GitHub Pages and stays that way — it reaches this worker over its public
   URL, which is why the REST endpoint carries CORS headers and the socket
   upgrade checks its Origin. */

import { MatchRoom } from "./match-room.mjs";
import { isRoomCode, normaliseRoomCode } from "./protocol.mjs";
import { makeRoomCode } from "./room-state.mjs";

export { MatchRoom };

/* Set ALLOWED_ORIGINS in wrangler.jsonc to the Pages origin once it is known.
   Left empty the worker accepts any origin, which is right for local play and
   wrong for a deploy that has a domain — hence the explicit list rather than a
   permanent "*". */
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function originOk(env, origin) {
  const list = allowedOrigins(env);
  if (!list.length) return true;
  if (!origin) return false;
  return list.includes(origin);
}

function cors(env, origin) {
  const headers = new Headers({ "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
  headers.set("Access-Control-Allow-Headers", "content-type");
  const list = allowedOrigins(env);
  if (!list.length) headers.set("Access-Control-Allow-Origin", "*");
  else if (origin && list.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env, origin) });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true }, cors(env, origin));
    }

    /* Open a room: mint a code and hand it back. The caller then joins it like
       any other, so hosting is not a separate code path on the client. */
    if (url.pathname === "/api/room" && request.method === "POST") {
      if (!originOk(env, origin)) return json({ error: "origin" }, cors(env, origin), 403);
      const code = await freshRoomCode(env);
      if (!code) return json({ error: "no_capacity" }, cors(env, origin), 503);
      return json({ code }, cors(env, origin));
    }

    const socket = url.pathname.match(/^\/api\/room\/([^/]+)\/socket$/);
    if (socket) {
      if (!originOk(env, origin)) return new Response("forbidden origin", { status: 403 });
      const code = normaliseRoomCode(socket[1]);
      if (!code) return new Response("bad room code", { status: 400 });
      const id = env.MATCH_ROOM.idFromName(code);
      return env.MATCH_ROOM.get(id).fetch(request);
    }

    return new Response("not found", { status: 404 });
  },
};

/* 28^5 is 17 million codes, so a collision is rare — but "rare" landing a
   stranger in the middle of someone's match is a bad enough outcome to be worth
   three probes. */
async function freshRoomCode(env) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = makeRoomCode();
    if (!isRoomCode(code)) continue;
    const id = env.MATCH_ROOM.idFromName(code);
    const probe = await env.MATCH_ROOM.get(id).fetch(
      new Request("https://room.invalid/probe"),
    );
    const { live } = await probe.json();
    if (!live) return code;
  }
  return null;
}

function json(body, headers, status = 200) {
  const h = new Headers(headers);
  h.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: h });
}
