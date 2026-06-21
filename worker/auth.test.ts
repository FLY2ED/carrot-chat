import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "./auth";

const SECRET = "test-secret";
const NOW = 1_700_000_000; // fixed unix seconds → deterministic exp

describe("JWT HS256 handshake tokens", () => {
  it("round-trips valid claims (and preserves Hangul names)", async () => {
    const token = await signToken(SECRET, { sub: "u1", name: "앨리스" }, 3600, NOW);
    const claims = await verifyToken(SECRET, token, NOW + 10);
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe("u1");
    expect(claims?.name).toBe("앨리스");
    expect(claims?.exp).toBe(NOW + 3600);
  });

  it("rejects an expired token", async () => {
    const token = await signToken(SECRET, { sub: "u1", name: "a" }, 30, NOW);
    expect(await verifyToken(SECRET, token, NOW + 31)).toBeNull();
    // still valid one second before expiry
    expect(await verifyToken(SECRET, token, NOW + 29)).not.toBeNull();
  });

  it("rejects a signature made with a different secret", async () => {
    const token = await signToken(SECRET, { sub: "u1", name: "a" }, 3600, NOW);
    expect(await verifyToken("other-secret", token, NOW + 10)).toBeNull();
  });

  it("rejects a tampered payload (original signature no longer matches)", async () => {
    const token = await signToken(SECRET, { sub: "u1", name: "a" }, 3600, NOW);
    const [head, , sig] = token.split(".");
    const forged = btoa(JSON.stringify({ sub: "admin", name: "x", iat: NOW, exp: NOW + 3600 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyToken(SECRET, `${head}.${forged}.${sig}`, NOW + 10)).toBeNull();
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyToken(SECRET, "not.a.jwt", NOW)).toBeNull();
    expect(await verifyToken(SECRET, "onlyonepart", NOW)).toBeNull();
    expect(await verifyToken(SECRET, "", NOW)).toBeNull();
  });
});
