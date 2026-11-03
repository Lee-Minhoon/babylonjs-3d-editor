import { describe, expect, test, vi } from "vitest";

import {
  type Command,
  createHistory,
  createMacroCommand,
  macroLabel,
} from "./history";

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
    expect(history.getState()).toMatchObject({
      undoLabel: "A 추가",
      redoLabel: null,
    });

    history.undo();
    expect(a.calls.undo).toBe(1);
    expect(history.getState()).toMatchObject({
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
    expect(history.getState()).toMatchObject({
      undoLabel: "B",
      redoLabel: null,
    });
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

  test("mark: undo로 같은 지점에 돌아오면 같은 값 (저장 여부 판단용)", () => {
    const history = createHistory();
    const a = trackedCommand("A");
    const b = trackedCommand("B");
    const empty = history.mark();
    history.execute(a.command);
    const saved = history.mark();
    expect(saved).not.toBe(empty);
    history.execute(b.command);
    expect(history.mark()).not.toBe(saved);
    history.undo();
    expect(history.mark()).toBe(saved);
    history.undo();
    expect(history.mark()).toBe(empty);
  });

  test("mark: 최대 개수를 넘어 빠진 Command가 있으면 끝까지 undo 해도 처음 지점이 아니다", () => {
    const history = createHistory({ limit: 2 });
    const start = history.mark();
    for (const label of ["1", "2", "3"]) {
      history.execute(trackedCommand(label).command);
    }
    history.undo();
    history.undo();
    // "1"은 되돌릴 수 없어 씬에 남아 있다 → 처음(빈) 상태와 같다고 보면 안 된다
    expect(history.mark()).not.toBe(start);
  });

  test("mark: clear 하면 이전의 어떤 지점과도 다르다", () => {
    const history = createHistory();
    const start = history.mark();
    history.clear();
    expect(history.mark()).not.toBe(start);
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
    expect(history.getState()).toMatchObject({
      undoLabel: null,
      redoLabel: null,
    });
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

describe("기록 목록과 goTo (히스토리 패널)", () => {
  function setup() {
    const history = createHistory();
    const commands = ["A", "B", "C"].map(trackedCommand);
    for (const { command } of commands) history.execute(command);
    return { history, commands };
  }

  test("목록은 오래된 것부터, position은 적용된 개수", () => {
    const { history } = setup();
    history.undo();
    expect(history.getState()).toMatchObject({
      entries: ["A", "B", "C"],
      position: 2,
    });
  });

  test("goTo는 한 번에 여러 단계 undo/redo 하고 알림은 한 번", () => {
    const { history, commands } = setup();
    const listener = vi.fn();
    history.subscribe(listener);

    history.goTo(0);
    expect(commands.map(({ calls }) => calls.undo)).toEqual([1, 1, 1]);
    expect(history.getState()).toMatchObject({
      position: 0,
      undoLabel: null,
      redoLabel: "A",
    });
    expect(listener).toHaveBeenCalledTimes(1);

    history.goTo(2);
    expect(commands.map(({ calls }) => calls.execute)).toEqual([2, 2, 1]);
    expect(history.getState().position).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("범위 밖이나 지금 위치면 아무것도 하지 않는다", () => {
    const { history } = setup();
    const listener = vi.fn();
    history.subscribe(listener);
    history.goTo(3);
    history.goTo(-1);
    history.goTo(4);
    expect(listener).not.toHaveBeenCalled();
    expect(history.getState().position).toBe(3);
  });

  test("goTo로 돌아온 지점의 mark는 undo로 돌아온 것과 같다", () => {
    const { history } = setup();
    history.undo();
    const mark = history.mark();
    history.goTo(0);
    history.goTo(2);
    expect(history.mark()).toBe(mark);
  });
});

describe("createMacroCommand", () => {
  test("순서대로 실행하고 역순으로 되돌린다, undo 한 번", () => {
    const order: string[] = [];
    const step = (name: string): Command => ({
      label: name,
      execute: () => void order.push(`do ${name}`),
      undo: () => void order.push(`undo ${name}`),
    });
    const history = createHistory();
    const commands = [step("a"), step("b"), step("c")];
    history.execute(createMacroCommand(macroLabel(commands, "삭제"), commands));
    expect(history.getState().undoLabel).toBe("메쉬 3개 삭제");

    history.undo();
    expect(order).toEqual([
      "do a",
      "do b",
      "do c",
      "undo c",
      "undo b",
      "undo a",
    ]);
    expect(history.getState().undoLabel).toBeNull();
  });

  test("dispose는 묶인 Command 모두에 전달된다", () => {
    const a = trackedCommand("A");
    const b = trackedCommand("B");
    createMacroCommand("묶음", [a.command, b.command]).dispose?.();
    expect([a.calls.dispose, b.calls.dispose]).toEqual([1, 1]);
  });

  test("하나뿐이면 그 Command 그대로 (라벨도 그대로)", () => {
    const a = trackedCommand("Box 1 삭제");
    expect(createMacroCommand("무시됨", [a.command])).toBe(a.command);
    expect(macroLabel([a.command], "삭제")).toBe("Box 1 삭제");
  });
});
