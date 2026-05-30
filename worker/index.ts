import { ChatRoom } from "./chat-room";

// Re-export the Durable Object class so the runtime can instantiate it.
export { ChatRoom };

// Matches /api/room/:roomId/ws  (roomId limited to a safe charset)
const WS_ROUTE = /^\/api\/room\/([A-Za-z0-9_-]{1,64})\/ws$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(WS_ROUTE);

    if (match) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket Upgrade", { status: 426 });
      }
      // One Durable Object instance per room id → the room's single source of truth.
      const stub = env.CHAT_ROOM.getByName(match[1]);
      return stub.fetch(request);
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    // Non-API paths are served by Static Assets (run_worker_first scopes the
    // Worker to /api/*); this is a defensive fallback only.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
