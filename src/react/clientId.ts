// Per-browser (install) identifier, shared across tabs via localStorage. Used to
// dedup messages across reconnects/tabs and to persist rate-limit windows so a
// user can't reset their quota by dropping and reopening the socket.
const KEY = "carrot-chat:clientId";
let memo: string | null = null;

export function getClientId(): string {
  if (memo) return memo;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return (memo = existing);
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return (memo = id);
  } catch {
    // SSR or storage blocked → ephemeral in-memory id (still stable per session).
    return (memo ??= crypto.randomUUID());
  }
}
