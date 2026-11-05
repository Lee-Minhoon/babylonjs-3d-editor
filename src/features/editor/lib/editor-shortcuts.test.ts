import { describe, expect, test } from "vitest";

import {
  getPresetShortcut,
  getShortcutKey,
  getToolShortcut,
  SHORTCUT_LABELS,
  shortcutCandidates,
  type ShortcutKeyEvent,
  VIEW_SHORTCUTS,
} from "./editor-shortcuts";

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

/** 키 이벤트 흉내. 글자는 code를 KeyX로 채운다 */
function press(
  key: string,
  modifiers: Partial<
    Pick<ShortcutKeyEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">
  > = {},
  code = /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : key,
): ShortcutKeyEvent {
  return {
    key,
    code,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

describe("shortcutCandidates (키맵 표의 매칭·우선순위)", () => {
  test("보조키는 적은 대로 정확히 — ⌘Z는 undo, ⌘⇧Z는 redo, Ctrl도 ⌘와 같다", () => {
    expect(shortcutCandidates(press("z", { metaKey: true }))).toEqual(["undo"]);
    expect(shortcutCandidates(press("z", { ctrlKey: true }))).toEqual(["undo"]);
    expect(
      shortcutCandidates(press("z", { metaKey: true, shiftKey: true })),
    ).toEqual(["redo"]);
    expect(shortcutCandidates(press("z"))).toEqual([]);
    expect(shortcutCandidates(press("y", { ctrlKey: true }))).toEqual([
      "redoAlt",
    ]);
  });

  test("같은 키의 여러 줄은 우선순위 순 — R은 배치 회전 다음에 크기 도구, ⇧R은 회전만", () => {
    expect(shortcutCandidates(press("r"))).toEqual([
      "rotatePlacement",
      "tool:scale",
    ]);
    expect(shortcutCandidates(press("r", { shiftKey: true }))).toEqual([
      "rotatePlacementBack",
    ]);
  });

  test("한글 입력 상태의 글자 키도 같은 단축키", () => {
    expect(shortcutCandidates(press("ㅂ", {}, "KeyQ"))).toEqual([
      "tool:select",
    ]);
    expect(shortcutCandidates(press("ㅊ", { metaKey: true }, "KeyC"))).toEqual([
      "copy",
    ]);
  });

  test("⌘S / ⌘⇧S, ⌥H / H, ⇧A는 서로 다른 줄", () => {
    expect(shortcutCandidates(press("s", { metaKey: true }))).toEqual(["save"]);
    expect(
      shortcutCandidates(press("s", { metaKey: true, shiftKey: true })),
    ).toEqual(["saveAs"]);
    expect(shortcutCandidates(press("h"))).toEqual(["hide"]);
    expect(shortcutCandidates(press("˙", { altKey: true }, "KeyH"))).toEqual([
      "showAll",
    ]);
    expect(shortcutCandidates(press("A", { shiftKey: true }, "KeyA"))).toEqual([
      "addMenu",
    ]);
    expect(shortcutCandidates(press("a", { metaKey: true }))).toEqual([
      "selectAll",
    ]);
  });

  test("숫자열은 프리셋, 숫자패드는 시점 (Num Lock이 꺼져 key가 End여도 시점이 먼저)", () => {
    expect(shortcutCandidates(press("1", {}, "Digit1"))).toEqual([
      "preset:box",
    ]);
    expect(shortcutCandidates(press("1", {}, "Numpad1"))).toEqual([
      "view:front",
    ]);
    expect(
      shortcutCandidates(press("End", { ctrlKey: true }, "Numpad1")),
    ).toEqual(["view:back"]);
    expect(
      shortcutCandidates(press("1", { metaKey: true }, "Numpad1")),
    ).toEqual([]);
    expect(shortcutCandidates(press("End", {}, "End"))).toEqual([
      "dropToFloor",
    ]);
    expect(shortcutCandidates(press("5", {}, "Numpad5"))).toEqual([
      "orthographic",
    ]);
  });

  test("?는 Shift 여부와 무관하게 도움말", () => {
    expect(shortcutCandidates(press("?", { shiftKey: true }, "Slash"))).toEqual(
      ["help"],
    );
    expect(shortcutCandidates(press("?", {}, "Slash"))).toEqual(["help"]);
  });
});

describe("표에서 나오는 라벨", () => {
  test("SHORTCUT_LABELS·VIEW_SHORTCUTS·도구·프리셋", () => {
    expect(SHORTCUT_LABELS.undo).toBe("⌘Z");
    expect(SHORTCUT_LABELS.rotatePlacementBack).toBe("⇧R");
    expect(VIEW_SHORTCUTS).toEqual({
      front: "Num1",
      back: "⌃Num1",
      right: "Num3",
      left: "⌃Num3",
      top: "Num7",
      bottom: "⌃Num7",
    });
    expect(getToolShortcut("rotate")).toBe("E");
    expect(getPresetShortcut("box")).toBe("1");
    expect(getPresetShortcut("point-light")).toBeNull();
  });
});
