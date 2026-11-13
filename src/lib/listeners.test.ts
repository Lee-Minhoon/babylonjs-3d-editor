import { describe, expect, test, vi } from "vitest";

import { createKeyedListeners, createListeners } from "./listeners";

describe("createListeners", () => {
  test("등록한 리스너에 알리고, 해제하면 더 알리지 않는다", () => {
    const listeners = createListeners();
    const listener = vi.fn();
    const unsubscribe = listeners.subscribe(listener);
    listeners.emit();
    unsubscribe();
    listeners.emit();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("createKeyedListeners", () => {
  test("키마다 따로 알린다", () => {
    const listeners = createKeyedListeners<string>();
    const a = vi.fn();
    const b = vi.fn();
    listeners.subscribe("a", a);
    listeners.subscribe("b", b);
    listeners.emit("a");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  test("해제 함수를 두 번 불러도 그 사이 같은 키에 등록한 리스너는 남는다", () => {
    const listeners = createKeyedListeners<string>();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = listeners.subscribe("key", first);
    unsubscribeFirst();
    listeners.subscribe("key", second);
    unsubscribeFirst();
    listeners.emit("key");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
