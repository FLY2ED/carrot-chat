import { describe, expect, it } from "vitest";
import { parseAssistantTrigger, stubReply } from "./assistant";
import type { Message } from "../src/chat-core";

describe("parseAssistantTrigger", () => {
  it("extracts the prompt after a mention or slash command", () => {
    expect(parseAssistantTrigger("@ai 약속 잡아줘")).toBe("약속 잡아줘");
    expect(parseAssistantTrigger("@봇 안전결제 알려줘")).toBe("안전결제 알려줘");
    expect(parseAssistantTrigger("/ai 대화 요약해줘")).toBe("대화 요약해줘");
  });

  it("returns null for non-triggers (plain text or bare mention)", () => {
    expect(parseAssistantTrigger("안녕하세요")).toBeNull();
    expect(parseAssistantTrigger("@ai")).toBeNull();
    expect(parseAssistantTrigger("이메일 ai@x.com 로 연락")).toBeNull();
  });
});

describe("stubReply — offline assistant routing (no API key)", () => {
  const empty: Message[] = [];

  it("routes appointment intent to a card with an accept action", () => {
    const r = stubReply(empty, "이번 주말에 약속 잡아줘");
    expect(r.kind).toBe("card");
    expect(r.card?.title).toContain("약속");
    expect(r.card?.actions?.some((a) => a.id === "accept")).toBe(true);
  });

  it("routes payment intent to a safe-payment card", () => {
    const r = stubReply(empty, "안전결제로 거래하고 싶어");
    expect(r.kind).toBe("card");
    expect(r.card?.title).toContain("안전결제");
    expect(r.card?.actions?.[0]?.id).toBe("pay");
  });

  it("routes summary intent to text built from history", () => {
    const history: Message[] = [
      { id: "1", senderId: "u1", senderName: "앨리스", text: "에어팟 팔아요", ts: 1, kind: "text" },
      { id: "2", senderId: "u2", senderName: "바다", text: "얼마예요?", ts: 2, kind: "text" },
    ];
    const r = stubReply(history, "지금까지 대화 요약해줘");
    expect(r.kind).toBe("text");
    expect(r.text).toContain("앨리스");
    expect(r.text).toContain("2개 메시지");
  });

  it("falls back to a help message for unmatched input", () => {
    const r = stubReply(empty, "그냥 인사");
    expect(r.kind).toBe("text");
    expect(r.text).toContain("당근 AI");
  });
});
