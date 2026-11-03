"use client";

import { useRef } from "react";

/**
 * 패널 편집의 미리보기 → 커밋 흐름 (머티리얼·씬 설정 공통).
 * preview: 편집 시작 전 값을 한 번 기억하고 바로 적용한다 (기록 없음).
 * commit: 시작 전 값과 다르면 record로 Command 하나를 남긴다.
 * cancel: 미리보기 중이면 시작 전 값으로 되돌리고 true (handleFieldHistoryKey의 cancelEdit).
 */
export function usePreviewEdit<T>({
  get,
  apply,
  isSame,
  record,
}: {
  get: () => T | null;
  apply: (values: T) => void;
  isSame: (a: T, b: T) => boolean;
  record: (before: T, after: T) => void;
}) {
  const before = useRef<T | null>(null);

  const preview = (next: Partial<T>) => {
    const current = get();
    if (!current) return;
    before.current ??= current;
    apply({ ...current, ...next });
  };

  const commit = () => {
    const after = get();
    if (before.current && after && !isSame(before.current, after)) {
      record(before.current, after);
    }
    before.current = null;
  };

  const cancel = () => {
    if (!before.current) return false;
    apply(before.current);
    before.current = null;
    return true;
  };

  return { preview, commit, cancel };
}
