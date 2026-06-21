// ── WebSocket JWT handshake (HS256 via WebCrypto) ──
//
// Browsers can't set an Authorization header on a WebSocket, so the token rides
// the query string (`?token=`). The Worker verifies it BEFORE accepting the
// upgrade and injects the verified identity, so a client can't spoof user/name.
//
// The public demo also allows anonymous (?user=&name=) when ALLOW_ANON !== "false",
// so the playground keeps working; a real deployment sets ALLOW_ANON=false and
// issues tokens from its own auth backend (here a tiny /api/dev-token stands in).

export interface AuthClaims {
  sub: string; // user id
  name: string;
  iat: number; // issued-at (unix seconds)
  exp: number; // expiry (unix seconds)
}

// ── base64url helpers (JWT uses url-safe, unpadded base64) ──
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const enc = new TextEncoder();
const b64url = (s: string): string => b64urlFromBytes(enc.encode(s));

function bytesFromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

/** Mint a signed HS256 token. `now` is unix seconds (explicit so it's testable). */
export async function signToken(
  secret: string,
  claims: { sub: string; name: string },
  ttlSec: number,
  now: number,
): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: AuthClaims = { sub: claims.sub, name: claims.name, iat: now, exp: now + ttlSec };
  const body = b64url(JSON.stringify(payload));
  const data = `${head}.${body}`;
  const key = await hmacKey(secret, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${b64urlFromBytes(sig)}`;
}

/** Verify signature + expiry. Returns claims or null (never throws). */
export async function verifyToken(
  secret: string,
  token: string,
  now: number,
): Promise<AuthClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    const key = await hmacKey(secret, ["verify"]);
    // Cast: BufferSource's generic distinguishes ArrayBuffer vs SharedArrayBuffer;
    // our bytes are always plain-ArrayBuffer-backed.
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      bytesFromB64url(sig) as BufferSource,
      enc.encode(`${head}.${body}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(bytesFromB64url(body))) as AuthClaims;
    if (typeof claims.exp !== "number" || claims.exp < now) return null;
    if (!claims.sub || !claims.name) return null;
    return claims;
  } catch {
    return null;
  }
}

export interface HandshakeResult {
  ok: boolean;
  reason?: string;
  /** When a token authorized the connection, a cloned request with the verified
   *  identity injected into user/name (so the DO trusts it, not the client). */
  request?: Request;
}

/**
 * Gate a WebSocket upgrade. With a token → verify and inject identity. Without →
 * allow only if anonymous access is enabled (the demo default).
 */
export async function authorizeHandshake(
  request: Request,
  url: URL,
  env: Env,
): Promise<HandshakeResult> {
  const token = url.searchParams.get("token");
  if (token) {
    if (!env.JWT_SECRET) return { ok: false, reason: "auth_not_configured" };
    const claims = await verifyToken(env.JWT_SECRET, token, Math.floor(Date.now() / 1000));
    if (!claims) return { ok: false, reason: "invalid_or_expired_token" };
    const u = new URL(url);
    u.searchParams.set("user", claims.sub);
    u.searchParams.set("name", claims.name);
    return { ok: true, request: new Request(u.toString(), request) };
  }
  // Cast: the var is typed as its literal default, but a secret/runtime override
  // can set any value, so compare as a plain string.
  if ((env.ALLOW_ANON as string) === "false") return { ok: false, reason: "auth_required" };
  return { ok: true };
}
