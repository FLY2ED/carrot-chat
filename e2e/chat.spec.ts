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

test("file attachment uploads to R2 and renders as an image message in both clients", async ({
  page,
}) => {
  const room = `e2e-media-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const alice = page.locator('section[aria-label="앨리스 채팅 패널"]');
  const bada = page.locator('section[aria-label="바다 채팅 패널"]');
  await expect(alice.getByText("실시간 연결됨")).toBeVisible();
  await expect(bada.getByText("실시간 연결됨")).toBeVisible();

  // A real 1x1 PNG as the upload payload.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await alice
    .locator('input[type="file"]')
    .setInputFiles({ name: "그림.png", mimeType: "image/png", buffer: png });

  // The compose event broadcasts an image message; both panels render an <img>
  // pointing at the R2-backed /api/media/ URL.
  await expect(bada.locator('img[src*="/api/media/"]')).toBeVisible();
  await expect(alice.locator('img[src*="/api/media/"]')).toBeVisible();
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

test("JWT handshake: a valid token connects with the claimed identity; a bad token is rejected", async ({
  page,
  request,
}) => {
  const room = `e2e-auth-${Date.now()}`;

  // Demo issuer mints a token bound to a specific identity.
  const tokRes = await request.get(
    `/api/dev-token?user=u-carrot&name=${encodeURIComponent("당근이")}&ttl=60`,
  );
  expect(tokRes.ok()).toBeTruthy();
  const { token } = await tokRes.json();
  expect(token).toBeTruthy();

  await page.goto("/"); // need a page origin to open a WebSocket from

  // A valid token connects — and the server's `hello` carries the CLAIMED identity
  // even though we deliberately pass a different user/name (server overrides → no spoofing).
  const helloName = await page.evaluate(
    ({ room, token }) =>
      new Promise<string>((resolve) => {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${proto}//${location.host}/api/room/${room}/ws?user=spoof&name=spoofed&token=${token}`,
        );
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data as string);
          if (msg.type === "hello") {
            resolve(msg.selfName);
            ws.close();
          }
        };
        ws.onerror = () => resolve("__error__");
        setTimeout(() => resolve("__timeout__"), 4000);
      }),
    { room, token },
  );
  expect(helloName).toBe("당근이");

  // A bad token is rejected at the handshake (server returns 401, never 101).
  const badResult = await page.evaluate(
    ({ room }) =>
      new Promise<string>((resolve) => {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${proto}//${location.host}/api/room/${room}/ws?token=garbage.bad.token`,
        );
        ws.onopen = () => {
          resolve("opened");
          ws.close();
        };
        ws.onerror = () => resolve("rejected");
        ws.onclose = (e) => resolve(e.code === 1000 ? "clean-close" : "rejected");
        setTimeout(() => resolve("timeout"), 4000);
      }),
    { room },
  );
  expect(badResult).toBe("rejected");
});

test("multi-room inbox: a message bumps the recipient's inbox with unread count + preview", async ({
  page,
}) => {
  const room = `e2e-inbox-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const alice = page.locator('section[aria-label="앨리스 채팅 패널"]');
  const bada = page.locator('section[aria-label="바다 채팅 패널"]');
  await expect(alice.getByText("실시간 연결됨")).toBeVisible();
  await expect(bada.getByText("실시간 연결됨")).toBeVisible();

  // Alice sends → both alice & bob are members, so the fan-out records to both
  // inboxes (bob gets unread+1, alice's is fromSelf so no bump).
  const text = `인박스 테스트 ${Date.now()}`;
  await alice.getByLabel("메시지 입력").fill(text);
  await alice.getByRole("button", { name: "보내기" }).click();
  await expect(bada.getByText(text)).toBeVisible(); // delivered → inbox fan-out fired

  // Open Bob's inbox — the room shows the preview + an unread badge of 1.
  await page.goto(`/inbox.html?user=bob&name=${encodeURIComponent("바다")}`);
  await expect(page.getByText("실시간 연결됨")).toBeVisible();
  const row = page.locator(".inbox-row", { hasText: room });
  await expect(row).toBeVisible();
  await expect(row.getByText(text)).toBeVisible();
  await expect(row.locator(".inbox-row__badge")).toHaveText("1");

  // Favoriting persists in the UserInbox DO and re-renders via the live snapshot.
  await row.locator(".inbox-row__fav").click();
  await expect(row.locator(".inbox-row__fav.is-on")).toBeVisible();
});

test("inbox notification: a live arrival pops a toast and updates the unread tab title", async ({
  page,
  context,
}) => {
  const room = `e2e-notify-${Date.now()}`;
  await page.goto(`/?room=${room}`);

  const alice = page.locator('section[aria-label="앨리스 채팅 패널"]');
  const bada = page.locator('section[aria-label="바다 채팅 패널"]');
  await expect(alice.getByText("실시간 연결됨")).toBeVisible();
  await expect(bada.getByText("실시간 연결됨")).toBeVisible();

  // Bob's inbox open in a second tab (empty → baseline = 0 unread).
  const inbox = await context.newPage();
  await inbox.goto(`/inbox.html?user=bob&name=${encodeURIComponent("바다")}`);
  await expect(inbox.getByText("실시간 연결됨")).toBeVisible();

  // Alice sends while Bob's inbox is open → live snapshot bumps unread → toast fires.
  const text = `알림 테스트 ${Date.now()}`;
  await alice.getByLabel("메시지 입력").fill(text);
  await alice.getByRole("button", { name: "보내기" }).click();

  await expect(inbox.locator(".inbox-toast")).toBeVisible();
  await expect(inbox.locator(".inbox-toast")).toContainText(text);
  // This room's unread badge reflects the live arrival (per-room, so it's not
  // affected by other rooms accumulated in the shared UserInbox during the run).
  const row = inbox.locator(".inbox-row", { hasText: room });
  await expect(row.locator(".inbox-row__badge")).toHaveText("1");

  await inbox.close();
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
