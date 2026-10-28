import { describe, expect, test, vi } from "vitest";

import { type Command, createHistory } from "./history";

/** 실행/되돌리기 횟수와 dispose 여부를 기록하는 Command */
function trackedCommand(label: string) {
  const calls = { execute: 0, undo: 0, dispose: 0 };
  const command: Command = {
    label,
    execute: () => void calls.execute++,
    undo: () => void calls.undo++,
    dispose: () => void calls.dispose++,
  };
  return { command, calls };
}

describe("createHistory", () => {
  test("execute → undo → redo 순서와 라벨", () => {
    const history = createHistory();
    const a = trackedCommand("A 추가");
    history.execute(a.command);
    expect(history.getState()).toEqual({
      undoLabel: "A 추가",
      redoLabel: null,
    });

    history.undo();
    expect(a.calls.undo).toBe(1);
    expect(history.getState()).toEqual({
      undoLabel: null,
      redoLabel: "A 추가",
    });

    history.redo();
    expect(a.calls.execute).toBe(2);
    expect(history.getState().undoLabel).toBe("A 추가");
  });

  test("빈 스택에서 undo/redo는 아무것도 하지 않는다", () => {
    const history = createHistory();
    const listener = vi.fn();
    history.subscribe(listener);
    history.undo();
    history.redo();
    expect(listener).not.toHaveBeenCalled();
  });

  test("undo 뒤 새 Command를 실행하면 redo 스택을 버리고 dispose 한다", () => {
    const history = createHistory();
    const a = trackedCommand("A");
    const b = trackedCommand("B");
    history.execute(a.command);
    history.undo();
    history.execute(b.command);
    expect(a.calls.dispose).toBe(1);
    expect(history.getState()).toEqual({ undoLabel: "B", redoLabel: null });
  });

  test("최대 개수를 넘으면 가장 오래된 Command를 dispose 한다", () => {
    const history = createHistory({ limit: 2 });
    const commands = ["1", "2", "3"].map(trackedCommand);
    for (const { command } of commands) history.execute(command);
    expect(commands[0].calls.dispose).toBe(1);
    expect(commands[1].calls.dispose).toBe(0);
    history.undo();
    history.undo();
    history.undo(); // 세 번째는 남은 게 없다
    expect(commands[0].calls.undo).toBe(0);
  });

  test("peek: undo로 같은 지점에 돌아오면 같은 Command (저장 여부 판단용)", () => {
    const history = createHistory();
    const a = trackedCommand("A");
    const b = trackedCommand("B");
    history.execute(a.command);
    const saved = history.peek();
    history.execute(b.command);
    expect(history.peek()).not.toBe(saved);
    history.undo();
    expect(history.peek()).toBe(saved);
  });

  test("clear는 모두 dispose 하고 구독은 유지한다, dispose는 구독도 끊는다", () => {
    const history = createHistory();
    const a = trackedCommand("A");
    const b = trackedCommand("B");
    history.execute(a.command);
    history.execute(b.command);
    history.undo();

    const listener = vi.fn();
    history.subscribe(listener);
    history.clear();
    expect(a.calls.dispose).toBe(1);
    expect(b.calls.dispose).toBe(1);
    expect(history.getState()).toEqual({ undoLabel: null, redoLabel: null });
    expect(listener).toHaveBeenCalledTimes(1);

    history.dispose();
    history.execute(trackedCommand("C").command);
    expect(listener).toHaveBeenCalledTimes(2); // dispose의 emit 한 번만, 그 뒤로는 없음
  });

  test("getState는 변경이 없으면 같은 객체 (useSyncExternalStore 요구 사항)", () => {
    const history = createHistory();
    expect(history.getState()).toBe(history.getState());
  });
});
