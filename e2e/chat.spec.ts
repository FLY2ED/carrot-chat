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
