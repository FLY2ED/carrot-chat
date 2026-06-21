import { ChatRoom } from "./chat-room";
import { AdminHub } from "./admin-hub";
import { handleServe, handleUpload } from "./media";
import { authorizeHandshake, signToken } from "./auth";

// Re-export the Durable Object classes so the runtime can instantiate them.
export { ChatRoom, AdminHub };

// Matches /api/room/:roomId/ws  (roomId limited to a safe charset)
const WS_ROUTE = /^\/api\/room\/([A-Za-z0-9_-]{1,64})\/ws$/;
const UPLOAD_ROUTE = /^\/api\/room\/([A-Za-z0-9_-]{1,64})\/upload$/;
const MEDIA_ROUTE = /^\/api\/media\/(.+)$/;
const ADMIN_ROOM_ROUTE = /^\/api\/admin\/room\/([A-Za-z0-9_-]{1,64})$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    const wsMatch = url.pathname.match(WS_ROUTE);
    if (wsMatch) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket Upgrade", { status: 426 });
      }
      // Verify the JWT (if any) BEFORE the upgrade; inject the trusted identity so
      // a client can't spoof user/name. Anonymous allowed only when ALLOW_ANON.
      const gate = await authorizeHandshake(request, url, env);
      if (!gate.ok) return new Response(gate.reason ?? "Unauthorized", { status: 401 });
      // One Durable Object instance per room id → the room's single source of truth.
      const stub = env.CHAT_ROOM.getByName(wsMatch[1]);
      return stub.fetch(gate.request ?? request);
    }

    // Demo token issuer. A real app mints tokens from its own login backend after
    // authenticating the user; this stands in so the JWT handshake is exercisable.
    if (url.pathname === "/api/dev-token") {
      if (!env.JWT_SECRET) return new Response("auth not configured", { status: 503 });
      const sub = (url.searchParams.get("user") ?? `u-${crypto.randomUUID().slice(0, 8)}`).slice(0, 64);
      const name = (url.searchParams.get("name") ?? "익명").slice(0, 32);
      const ttl = Math.min(Math.max(Number(url.searchParams.get("ttl") ?? "3600"), 5), 86400);
      const token = await signToken(env.JWT_SECRET, { sub, name }, ttl, Math.floor(Date.now() / 1000));
      return Response.json({ token, sub, name, expiresIn: ttl });
    }

    // Media: raw-body upload (POST) and object serving (GET) via R2.
    const uploadMatch = url.pathname.match(UPLOAD_ROUTE);
    if (uploadMatch) {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      return handleUpload(request, env, uploadMatch[1]);
    }
    const mediaMatch = url.pathname.match(MEDIA_ROUTE);
    if (mediaMatch) {
      if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
      return handleServe(env, mediaMatch[1]);
    }

    // Read-only, token-gated admin console API. Declared before the /api/ 404 and
    // BEFORE the room WS route so a forged admin event can't reach a chat room.
    if (url.pathname.startsWith("/api/admin/")) {
      const token =
        request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ??
        url.searchParams.get("token") ??
        "";
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      const hub = env.ADMIN_HUB.getByName("global");
      if (url.pathname === "/api/admin/rooms") {
        return Response.json(await hub.getRooms());
      }
      if (url.pathname === "/api/admin/stats") {
        return Response.json(await hub.getStats());
      }
      const roomMatch = url.pathname.match(ADMIN_ROOM_ROUTE);
      if (roomMatch) {
        const room = env.CHAT_ROOM.getByName(roomMatch[1]);
        return Response.json(await room.adminRecentMessages());
      }
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    // Non-API paths are served by Static Assets (run_worker_first scopes the
    // Worker to /api/*); this is a defensive fallback only.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
