"use client";

import { useRef } from "react";

export type PreviewChange<K, T> = { target: K; before: T; after: T };

/**
 * 패널 편집의 미리보기 → 커밋 흐름 (머티리얼·씬 설정 공통). 대상이 여럿이면(여러 메쉬 선택) 함께 바꾼다.
 * preview: 편집 시작 전 값을 대상마다 한 번 기억하고, 바꾼 필드만 각 대상의 지금 값 위에 덮어 적용한다 (기록 없음)
 *   — 여러 메쉬의 머티리얼에서 거칠기만 바꾸면 각자의 색은 그대로다.
 * commit: 시작 전 값과 달라진 대상만 모아 record로 넘긴다 (Command 하나로 묶는 건 호출하는 쪽).
 * cancel: 미리보기 중이면 시작 전 값으로 되돌리고 true (handleFieldHistoryKey의 cancelEdit).
 */
export function usePreviewEdit<K, T>({
  targets,
  get,
  apply,
  isSame,
  record,
}: {
  targets: readonly K[];
  get: (target: K) => T | null;
  apply: (target: K, values: T) => void;
  isSame: (a: T, b: T) => boolean;
  record: (changes: PreviewChange<K, T>[]) => void;
}) {
  const before = useRef<Map<K, T> | null>(null);

  const preview = (next: Partial<T>) => {
    if (!before.current) {
      before.current = new Map();
      for (const target of targets) {
        const current = get(target);
        if (current) before.current.set(target, current);
      }
    }
    for (const target of before.current.keys()) {
      const current = get(target);
      if (current) apply(target, { ...current, ...next });
    }
  };

  const commit = () => {
    const started = before.current;
    before.current = null;
    if (!started) return;
    const changes: PreviewChange<K, T>[] = [];
    for (const [target, previous] of started) {
      const after = get(target);
      if (after && !isSame(previous, after)) {
        changes.push({ target, before: previous, after });
      }
    }
    if (changes.length > 0) record(changes);
  };

  const cancel = () => {
    if (!before.current) return false;
    for (const [target, previous] of before.current) apply(target, previous);
    before.current = null;
    return true;
  };

  return { preview, commit, cancel };
}
