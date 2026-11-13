"use client";

import { type KeyboardEvent, useRef } from "react";

import type { EditableProperty } from "../lib/editable-property";
import { handleFieldHistoryKey, isTypingTarget } from "../lib/editor-shortcuts";
import { createMacroCommand, type History, macroLabel } from "../lib/history";

/**
 * 패널 편집의 미리보기 → 커밋 흐름 (머티리얼·조명·모양·씬 설정 공통). 대상이 여럿이면(여러 메쉬 선택) 함께 바꾼다.
 * preview: 편집 시작 전 값을 대상마다 한 번 기억하고, 바꾼 필드만 각 대상의 지금 값 위에 덮어 적용한다 (기록 없음)
 *   — 여러 메쉬의 머티리얼에서 거칠기만 바꾸면 각자의 색은 그대로다.
 * commit: 시작 전 값과 달라진 대상만 Command로 만들어 하나로 묶어 기록한다 ("Box 1 머티리얼" / "메쉬 3개 머티리얼").
 * cancel: 미리보기 중이면 시작 전 값으로 되돌리고 true (handleFieldHistoryKey의 cancelEdit).
 * onKeyDown: 섹션 요소에 단다 — 입력창·슬라이더에 포커스가 있으면 editor-shortcuts가 건너뛰므로 ⌘Z/⌘⇧Z를 여기서
 *   처리한다 (편집 중이면 먼저 그 편집만 취소). 안쪽 입력칸이 이미 처리한 키(defaultPrevented)와 스위치 같은 버튼의
 *   키는 건드리지 않는다 — 두 번 undo 되지 않게.
 */
export function usePropertyEdit<K, T>(
  property: EditableProperty<K, T>,
  targets: readonly K[],
  history: History,
) {
  const before = useRef<Map<K, T> | null>(null);

  const preview = (next: Partial<T>) => {
    if (!before.current) {
      before.current = new Map();
      for (const target of targets) {
        const current = property.get(target);
        if (current) before.current.set(target, current);
      }
    }
    for (const target of before.current.keys()) {
      const current = property.get(target);
      if (current) property.apply(target, { ...current, ...next });
    }
  };

  const commit = () => {
    const started = before.current;
    before.current = null;
    if (!started) return;
    const commands = [...started].flatMap(([target, previous]) => {
      const after = property.get(target);
      return after && !property.isSame(previous, after)
        ? [property.createCommand(target, previous, after)]
        : [];
    });
    if (commands.length > 0) {
      history.execute(
        createMacroCommand(macroLabel(commands, property.verb), commands),
      );
    }
  };

  const cancel = () => {
    if (!before.current) return false;
    for (const [target, previous] of before.current) {
      property.apply(target, previous);
    }
    before.current = null;
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!event.defaultPrevented && isTypingTarget(event.target)) {
      handleFieldHistoryKey(event, history, cancel);
    }
  };

  return { preview, commit, cancel, onKeyDown };
}
