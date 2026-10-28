import { describe, expect, test } from "vitest";

import { getShortcutKey } from "./editor-shortcuts";

describe("getShortcutKey", () => {
  test("한글 입력 상태에서도 글자 키는 물리 키 위치로 판정한다", () => {
    expect(getShortcutKey({ key: "ㅂ", code: "KeyQ" })).toBe("q");
    expect(getShortcutKey({ key: "ㅋ", code: "KeyZ" })).toBe("z");
  });

  test("Shift로 대문자가 되어도 소문자", () => {
    expect(getShortcutKey({ key: "R", code: "KeyR" })).toBe("r");
  });

  test("글자가 아닌 키는 event.key 그대로 (소문자)", () => {
    expect(getShortcutKey({ key: "Escape", code: "Escape" })).toBe("escape");
    expect(getShortcutKey({ key: "Backspace", code: "Backspace" })).toBe(
      "backspace",
    );
  });
});
