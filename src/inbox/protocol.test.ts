import { describe, expect, it } from "vitest";
import { InboxClientEventSchema } from "./protocol";

describe("InboxClientEventSchema", () => {
  it("accepts valid read/favorite commands", () => {
    expect(InboxClientEventSchema.safeParse({ type: "read", roomId: "lobby" }).success).toBe(true);
    expect(InboxClientEventSchema.safeParse({ type: "favorite", roomId: "lobby" }).success).toBe(
      true,
    );
  });

  it("rejects unknown types and malformed frames", () => {
    expect(InboxClientEventSchema.safeParse({ type: "delete", roomId: "x" }).success).toBe(false);
    expect(InboxClientEventSchema.safeParse({ type: "read" }).success).toBe(false);
    expect(InboxClientEventSchema.safeParse({ type: "read", roomId: "" }).success).toBe(false);
    expect(InboxClientEventSchema.safeParse("nope").success).toBe(false);
  });
});
