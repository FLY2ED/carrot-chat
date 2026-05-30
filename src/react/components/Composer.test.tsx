import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";

describe("Composer", () => {
  it("signals typing, sends trimmed text on submit, then resets", async () => {
    const onSend = vi.fn();
    const onTyping = vi.fn();
    const user = userEvent.setup();
    render(<Composer onSend={onSend} onTyping={onTyping} />);

    const input = screen.getByLabelText<HTMLInputElement>("메시지 입력");
    await user.type(input, "  안녕하세요  ");
    expect(onTyping).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("button", { name: "보내기" }));
    expect(onSend).toHaveBeenCalledWith("안녕하세요");
    expect(input.value).toBe("");
    expect(onTyping).toHaveBeenLastCalledWith(false);
  });

  it("disables the send button when the input is empty", () => {
    render(<Composer onSend={vi.fn()} onTyping={vi.fn()} />);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "보내기" }).disabled).toBe(true);
  });
});
