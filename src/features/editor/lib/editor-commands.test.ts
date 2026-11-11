import { describe, expect, test, vi } from "vitest";

import {
  type CommandId,
  type CommandState,
  EDITOR_COMMANDS,
  getCommand,
} from "./editor-commands";
import type { EditorRuntime } from "./editor-runtime";
import { getShortcutLabel } from "./editor-shortcuts";

const EMPTY: CommandState = {
  selectionCount: 0,
  lockedCount: 0,
  hasParent: false,
  hiddenCount: 0,
  meshCount: 0,
  canPaste: false,
};

const enabledIds = (state: CommandState) =>
  (Object.keys(EDITOR_COMMANDS) as CommandId[]).filter((id) =>
    getCommand(id).enabled(state),
  );

describe("명령 활성 조건 (메뉴바·우클릭 메뉴가 같은 표를 본다)", () => {
  test("빈 씬: 파일·추가·도움말처럼 선택과 무관한 것만", () => {
    expect(enabledIds(EMPTY)).toEqual([
      "newScene",
      "open",
      "save",
      "saveAs",
      "importModel",
      "exportGlb",
      "screenshot",
      "addMenu",
      "help",
    ]);
  });

  test("메쉬 하나 선택: 하나짜리 동작(이름 바꾸기)까지, 둘 이상 필요한 부모 지정은 아님", () => {
    const ids = enabledIds({ ...EMPTY, selectionCount: 1, meshCount: 2 });
    expect(ids).toContain("rename");
    expect(ids).toContain("delete");
    expect(ids).toContain("lock");
    expect(ids).not.toContain("unlock");
    expect(ids).not.toContain("parent");
    expect(ids).not.toContain("unparent");
    expect(ids).not.toContain("paste");
  });

  test("여러 개 선택·클립보드·숨김·잠금·부모 상태를 반영한다", () => {
    const ids = enabledIds({
      selectionCount: 3,
      lockedCount: 3,
      hasParent: true,
      hiddenCount: 1,
      meshCount: 5,
      canPaste: true,
    });
    expect(ids).toContain("parent");
    expect(ids).toContain("unparent");
    expect(ids).toContain("paste");
    expect(ids).toContain("showAll");
    expect(ids).toContain("unlock");
    expect(ids).not.toContain("lock"); // 모두 잠겨 있으면 더 잠글 게 없다
    expect(ids).not.toContain("rename"); // 하나일 때만
  });
});

describe("명령 실행", () => {
  test("selectAll·deselect·addMenu는 런타임 도구에 바로 위임한다", () => {
    const runtime = {
      selection: { selectAll: vi.fn(), select: vi.fn() },
      addMenu: { open: vi.fn() },
    } as unknown as EditorRuntime;
    getCommand("selectAll").run(runtime);
    getCommand("deselect").run(runtime);
    getCommand("addMenu").run(runtime);
    expect(runtime.selection.selectAll).toHaveBeenCalledOnce();
    expect(runtime.selection.select).toHaveBeenCalledWith(null);
    expect(runtime.addMenu.open).toHaveBeenCalledOnce();
  });

  test("메뉴에 보일 단축키는 모두 키맵 표에 있는 id", () => {
    for (const id of Object.keys(EDITOR_COMMANDS) as CommandId[]) {
      const { shortcut } = getCommand(id);
      if (shortcut) expect(getShortcutLabel(shortcut)).toBeTruthy();
    }
  });
});
