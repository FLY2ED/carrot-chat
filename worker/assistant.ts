// ── In-room AI assistant (당근 AI) ──
//
// Demonstrates a tool-use (function-calling) assistant that rides the SAME
// extensible message structure as everything else: its replies are normal
// messages with kind=text|card|system, authored by a virtual sender.
//
// Two execution paths, chosen at runtime by whether GEMINI_API_KEY is set:
//   1. Real  — POST to Gemini `generateContent` with functionDeclarations; map
//              the model's functionCall back onto a local tool executor.
//   2. Stub  — a deterministic keyword router that calls the exact same tool
//              executors, so the demo is fully functional with NO API key.
//
// The chat is always authoritative and must never break: any network/quota/parse
// failure degrades to a short text reply, never an exception that reaches the room.

import type { Card, Message } from "@naldadev/chat";

export const ASSISTANT_ID = "assistant";
export const ASSISTANT_NAME = "당근 AI";

/** What the assistant produces — folded straight into a chat Message. */
export interface AssistantReply {
  kind: "text" | "card" | "system";
  text: string;
  card?: Card;
}

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = [
  "당신은 중고 거래 채팅의 도우미 '당근 AI'입니다.",
  "사용자가 약속을 잡으려 하면 propose_appointment, 결제/안전거래를 원하면 recommend_safe_payment,",
  "대화 내용을 묻으면 summarize_conversation 함수를 호출하세요.",
  "그 외에는 한국어로 1~2문장으로 친절하게 답하세요. 개인 연락처를 묻거나 알려주지 마세요.",
].join(" ");

// ── Tool declarations (Gemini function-calling schema) ──
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "propose_appointment",
        description: "거래 약속(시간·장소)을 제안하는 카드를 만든다.",
        parameters: {
          type: "object",
          properties: {
            when: { type: "string", description: "제안 시각, 예: 내일 오후 3시" },
            place: { type: "string", description: "장소, 예: 강남역 11번 출구" },
          },
          required: ["when", "place"],
        },
      },
      {
        name: "recommend_safe_payment",
        description: "당근페이 안전결제를 안내하는 카드를 만든다.",
        parameters: {
          type: "object",
          properties: { amount: { type: "string", description: "결제 금액(원)" } },
          required: ["amount"],
        },
      },
      {
        name: "summarize_conversation",
        description: "최근 대화를 한국어로 짧게 요약한다.",
        parameters: { type: "object", properties: {} },
      },
    ],
  },
];

// ── Tool executors — turn a (name, args) into a chat reply. Shared by both paths. ──
function execTool(
  name: string,
  args: Record<string, unknown>,
  history: Message[],
): AssistantReply {
  switch (name) {
    case "propose_appointment": {
      const when = String(args.when ?? "내일 오후 3시");
      const place = String(args.place ?? "근처 지하철역");
      return {
        kind: "card",
        text: "약속을 제안했어요.",
        card: {
          title: "📅 약속 제안",
          body: `${when}, ${place} 어떠세요?`,
          actions: [
            { id: "accept", label: "수락", style: "primary" },
            { id: "suggest", label: "다른 시간 제안" },
          ],
          meta: { when, place },
        },
      };
    }
    case "recommend_safe_payment": {
      const amount = String(args.amount ?? "32,000");
      return {
        kind: "card",
        text: "안전결제를 안내했어요.",
        card: {
          title: "🔒 당근페이 안전결제",
          body: `${amount}원을 안전하게 보관했다가 거래가 완료되면 판매자에게 전달돼요. 사기 걱정 없이 거래하세요.`,
          actions: [{ id: "pay", label: `${amount}원 결제하기`, style: "primary" }],
          meta: { amount },
        },
      };
    }
    case "summarize_conversation":
      return { kind: "text", text: summarize(history) };
    default:
      return { kind: "text", text: "무엇을 도와드릴까요?" };
  }
}

/** Heuristic summary used when no LLM is available — honest about being a count-based digest. */
function summarize(history: Message[]): string {
  const real = history.filter((m) => m.kind !== "system" && m.senderId !== ASSISTANT_ID);
  if (real.length === 0) return "아직 요약할 대화가 없어요.";
  const people = [...new Set(real.map((m) => m.senderName))];
  const last = real.slice(-3).map((m) => `${m.senderName}: ${m.text}`);
  return `최근 ${real.length}개 메시지 · 참여자 ${people.join(", ")}\n${last.join(" / ")}`;
}

/** Keyword router used when GEMINI_API_KEY is unset — drives the same tool executors. */
export function stubReply(history: Message[], userText: string): AssistantReply {
  if (/약속|만나|거래.*(시간|언제)|언제\s*볼/.test(userText)) {
    return execTool("propose_appointment", { when: "내일 오후 3시", place: "근처 지하철역" }, history);
  }
  if (/안전|결제|송금|페이|사기|보관/.test(userText)) {
    return execTool("recommend_safe_payment", { amount: "32,000" }, history);
  }
  if (/요약|정리|무슨\s*(얘기|이야기)|뭐라고|정리해/.test(userText)) {
    return execTool("summarize_conversation", {}, history);
  }
  return {
    kind: "text",
    text: "안녕하세요! 당근 AI예요. ‘약속 잡아줘’, ‘안전결제 알려줘’, ‘대화 요약해줘’ 같은 걸 도와드릴 수 있어요. (오프라인 데모 모드 — GEMINI_API_KEY 미설정)",
  };
}

// ── Gemini path ──
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}
interface GeminiContent {
  role: string;
  parts: Record<string, unknown>[];
}

// Tools that produce a final UI message (a card) end the turn immediately. Other
// tools return DATA that is fed back so the model can reason/answer — that's what
// makes the loop multi-turn (mirrors artdata's MAX_TOOL_TURNS chatbot).
const TERMINAL_TOOLS = new Set(["propose_appointment", "recommend_safe_payment"]);
const MAX_TOOL_TURNS = 4;

function toContents(history: Message[], userText: string): GeminiContent[] {
  const turns: GeminiContent[] = history
    .filter((m) => m.kind !== "system")
    .slice(-12)
    .map((m) => ({
      role: m.senderId === ASSISTANT_ID ? "model" : "user",
      parts: [{ text: `${m.senderName}: ${m.text}` }],
    }));
  turns.push({ role: "user", parts: [{ text: userText }] });
  return turns;
}

async function generate(key: string, contents: GeminiContent[]): Promise<GeminiPart[]> {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: TOOLS,
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
  return data.candidates?.[0]?.content?.parts ?? [];
}

async function callGemini(
  key: string,
  history: Message[],
  userText: string,
): Promise<AssistantReply> {
  const contents = toContents(history, userText);
  let lastReply: AssistantReply | null = null;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const parts = await generate(key, contents);
    const fc = parts.find((p) => p.functionCall)?.functionCall;
    if (!fc) {
      const text = parts.map((p) => p.text).filter(Boolean).join(" ").trim();
      return { kind: "text", text: text || lastReply?.text || "무엇을 도와드릴까요?" };
    }

    const reply = execTool(fc.name, fc.args ?? {}, history);
    lastReply = reply;
    if (TERMINAL_TOOLS.has(fc.name)) return reply; // card tool → that's the answer

    // Data tool (e.g. summarize): feed its result back and let the model continue.
    contents.push({ role: "model", parts: [{ functionCall: fc }] });
    contents.push({
      role: "user",
      parts: [{ functionResponse: { name: fc.name, response: { result: reply.text } } }],
    });
  }
  return lastReply ?? { kind: "text", text: "무엇을 도와드릴까요?" };
}

/**
 * Run one assistant turn. Picks the Gemini path when a key is configured,
 * otherwise the offline stub. Never throws — failures become a short text reply.
 */
export async function runAssistant(
  env: Env,
  history: Message[],
  userText: string,
): Promise<AssistantReply> {
  const key = env.GEMINI_API_KEY;
  if (!key) return stubReply(history, userText);
  try {
    return await callGemini(key, history, userText);
  } catch {
    return { kind: "text", text: "(AI 응답을 가져오지 못했어요 — 잠시 후 다시 시도해 주세요)" };
  }
}

/**
 * Detect an assistant trigger in a user message. Returns the prompt (text after
 * the mention) when triggered, or null. Realistic @mention / slash-command style.
 */
export function parseAssistantTrigger(text: string): string | null {
  const m = text.match(/^\s*(?:@ai|@봇|@bot|\/ai)\s+(.+)$/i);
  return m ? m[1].trim() : null;
}
