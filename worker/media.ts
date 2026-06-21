// ── Media attachments (image/file) backed by Cloudflare R2 ──
//
// Upload is a raw-body POST (content-type = the file's mime, x-filename header
// carries the name) — simpler and cheaper than multipart for a single file.
// The stored object's URL is returned ABSOLUTE because MediaSchema.url is a
// strict URL (z.url()); a relative path would fail validation in `compose`.

import type { Media } from "../src/chat-core";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — keep DO/R2 cheap, enough for the demo
const ALLOWED_PREFIXES = ["image/", "video/", "audio/", "application/pdf", "text/"];

function allowedMime(mime: string): boolean {
  return ALLOWED_PREFIXES.some((p) => mime.startsWith(p)) || mime === "application/octet-stream";
}

// Keep only filename-safe chars (Hangul allowed); never let a name break the R2 key.
function sanitizeName(name: string): string {
  const cleaned = name.replace(/[/\\?%*:|"<>\x00-\x1f]/g, "_").trim();
  return cleaned.slice(0, 100) || "file";
}

export async function handleUpload(
  request: Request,
  env: Env,
  roomId: string,
): Promise<Response> {
  const mime = (request.headers.get("content-type")?.split(";")[0] ?? "").trim() ||
    "application/octet-stream";
  if (!allowedMime(mime)) {
    return Response.json({ error: "unsupported_type" }, { status: 415 });
  }
  // Cheap early reject before buffering, when the client sends a length.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) return Response.json({ error: "empty" }, { status: 400 });
  if (buf.byteLength > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  const name = sanitizeName(decodeURIComponent(request.headers.get("x-filename") ?? "file"));
  const key = `${roomId}/${crypto.randomUUID()}/${name}`;
  await env.MEDIA.put(key, buf, {
    httpMetadata: { contentType: mime, contentDisposition: `inline; filename="${name}"` },
  });

  const origin = new URL(request.url).origin;
  const media: Media = {
    url: `${origin}/api/media/${key}`,
    mime,
    name,
    size: buf.byteLength,
  };
  return Response.json(media);
}

export async function handleServe(env: Env, key: string): Promise<Response> {
  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  // Keyed by a UUID path → content is immutable, cache hard.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
