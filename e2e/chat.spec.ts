import { expect, test } from "@playwright/test";

test("two clients in the same room sync messages, read receipts in real time", async ({
  page,
}) => {
  // Unique room per run so history from previous runs doesn't leak in.
  const room = `e2e-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const alice = page.locator('section[aria-label="앨리스 채팅 패널"]');
  const bada = page.locator('section[aria-label="바다 채팅 패널"]');

  // Both independent clients reach the Durable Object.
  await expect(alice.getByText("실시간 연결됨")).toBeVisible();
  await expect(bada.getByText("실시간 연결됨")).toBeVisible();

  const text = "실시간 동기화 테스트 메시지";
  await alice.getByLabel("메시지 입력").fill(text);
  await alice.getByRole("button", { name: "보내기" }).click();

  // Bada receives it over the WebSocket without a reload.
  await expect(bada.getByText(text)).toBeVisible();

  // Alice's bubble flips to "읽음" once Bada's client auto-marks it read.
  await expect(alice.getByText("읽음")).toBeVisible();
});

test("masks contact details server-side before broadcasting", async ({ page }) => {
  const room = `e2e-mask-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const bada = page.locator('section[aria-label="바다 채팅 패널"]');
  await expect(bada.getByText("실시간 연결됨")).toBeVisible();

  await page
    .locator('section[aria-label="앨리스 채팅 패널"]')
    .getByLabel("메시지 입력")
    .fill("내 번호 010-1234-5678 로 연락주세요");
  await page
    .locator('section[aria-label="앨리스 채팅 패널"]')
    .getByRole("button", { name: "보내기" })
    .click();

  await expect(bada.getByText("[비공개]")).toBeVisible();
  await expect(bada.getByText("010-1234-5678")).toHaveCount(0);
  // The policy badge is rendered alongside the masked message so operators/users
  // can see that the server applied a rule, not just that the text changed.
  await expect(bada.getByText("정책 적용")).toBeVisible();
});

test("reconnect simulation updates Alice status before recovering", async ({ page }) => {
  const room = `e2e-reconnect-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const alice = page.locator('section[aria-label="앨리스 채팅 패널"]');
  const input = alice.getByLabel("메시지 입력");
  await expect(alice.getByText("실시간 연결됨")).toBeVisible();

  await page.getByRole("button", { name: "재연결 시뮬레이션 (앨리스)" }).click();

  await expect(alice.getByText("재연결 중…")).toBeVisible();
  await expect(input).toBeDisabled();
  await expect(alice.getByText("실시간 연결됨")).toBeVisible({ timeout: 5000 });
  await expect(input).toBeEnabled();
});

test("optimistic send shows immediately and reconciles without a duplicate", async ({
  page,
}) => {
  const room = `e2e-optimistic-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const alice = page.locator('section[aria-label="앨리스 채팅 패널"]');
  await expect(alice.getByText("실시간 연결됨")).toBeVisible();

  const text = "낙관적 전송 테스트";
  await alice.getByLabel("메시지 입력").fill(text);
  await alice.getByRole("button", { name: "보내기" }).click();

  // Renders immediately (optimistic) — exactly once.
  await expect(alice.getByText(text)).toHaveCount(1);
  // After the server echo reconciles by clientMsgId, still exactly one (no dup).
  await page.waitForTimeout(500);
  await expect(alice.getByText(text)).toHaveCount(1);
});

test("rich card message: appointment card broadcasts, tapping an action emits a system message", async ({
  page,
}) => {
  const room = `e2e-card-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const alice = page.locator('section[aria-label="앨리스 채팅 패널"]');
  const bada = page.locator('section[aria-label="바다 채팅 패널"]');
  await expect(alice.getByText("실시간 연결됨")).toBeVisible();
  await expect(bada.getByText("실시간 연결됨")).toBeVisible();

  // Alice sends a 당근-style appointment card (rides the extensible message structure).
  await page.getByRole("button", { name: "📅 약속 잡기" }).click();

  // Both clients render the card with its title + action buttons.
  await expect(bada.getByText("📅 약속 잡기")).toBeVisible();
  const acceptBtn = bada.getByRole("button", { name: "수락" });
  await expect(acceptBtn).toBeVisible();

  // Bada taps "수락" → server resolves the label and broadcasts a system message.
  await acceptBtn.click();
  await expect(alice.getByText('바다님이 "수락"을(를) 선택했어요')).toBeVisible();
  await expect(bada.getByText('바다님이 "수락"을(를) 선택했어요')).toBeVisible();
});

test("AI assistant answers an @ai mention with a card, authored by the bot (offline stub)", async ({
  page,
}) => {
  const room = `e2e-ai-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const alice = page.locator('section[aria-label="앨리스 채팅 패널"]');
  const bada = page.locator('section[aria-label="바다 채팅 패널"]');
  await expect(alice.getByText("실시간 연결됨")).toBeVisible();

  // Alice mentions the assistant; with no GEMINI_API_KEY the server uses the
  // deterministic offline stub, which routes "약속" → an appointment card.
  await page.getByRole("button", { name: "🤖 AI 어시스턴트" }).click();

  // The bot reply is a normal message authored by "당근 AI", broadcast to everyone.
  await expect(alice.getByText("📅 약속 제안")).toBeVisible();
  await expect(bada.getByText("당근 AI")).toBeVisible();
  await expect(bada.getByRole("button", { name: "수락" })).toBeVisible();
});

test("admin console reflects room activity + mask rate, and rejects bad tokens", async ({
  page,
  request,
}) => {
  const room = `e2e-admin-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const alice = page.locator('section[aria-label="앨리스 채팅 패널"]');
  await expect(alice.getByText("실시간 연결됨")).toBeVisible();

  // A masked message so the admin mask-rate counter moves.
  await alice.getByLabel("메시지 입력").fill("연락처 010-1234-5678 입니다");
  await alice.getByRole("button", { name: "보내기" }).click();
  await expect(
    page.locator('section[aria-label="바다 채팅 패널"]').getByText("[비공개]"),
  ).toBeVisible();

  // Token-gated admin API reflects the activity (fire-and-forget report settles).
  await expect
    .poll(
      async () => {
        const res = await request.get("/api/admin/stats", {
          headers: { Authorization: "Bearer carrot-admin-demo" },
        });
        if (!res.ok()) return -1;
        const stats = await res.json();
        return stats.totalMasked as number;
      },
      { timeout: 5000 },
    )
    .toBeGreaterThan(0);

  // No token → 401.
  const unauth = await request.get("/api/admin/stats");
  expect(unauth.status()).toBe(401);
});
