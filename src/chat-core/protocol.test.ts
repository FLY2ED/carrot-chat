import { describe, expect, it } from "vitest";
import { maskContact } from "./protocol";

describe("maskContact", () => {
  it("masks Korean mobile numbers", () => {
    expect(maskContact("연락처 010-1234-5678 로 주세요")).toBe("연락처 [비공개] 로 주세요");
    expect(maskContact("01012345678")).toBe("[비공개]");
  });

  it("masks email addresses", () => {
    expect(maskContact("메일 hello@example.com 으로요")).toBe("메일 [비공개] 으로요");
  });

  it("leaves ordinary text untouched", () => {
    expect(maskContact("안녕하세요 반갑습니다 :)")).toBe("안녕하세요 반갑습니다 :)");
  });
});
