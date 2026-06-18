import { ChatRoom } from "./chat-room";
import { AdminHub } from "./admin-hub";

// Re-export the Durable Object classes so the runtime can instantiate them.
export { ChatRoom, AdminHub };

// Matches /api/room/:roomId/ws  (roomId limited to a safe charset)
const WS_ROUTE = /^\/api\/room\/([A-Za-z0-9_-]{1,64})\/ws$/;
const ADMIN_ROOM_ROUTE = /^\/api\/admin\/room\/([A-Za-z0-9_-]{1,64})$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    const wsMatch = url.pathname.match(WS_ROUTE);
    if (wsMatch) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket Upgrade", { status: 426 });
      }
      // One Durable Object instance per room id → the room's single source of truth.
      const stub = env.CHAT_ROOM.getByName(wsMatch[1]);
      return stub.fetch(request);
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
