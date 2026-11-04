"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { EditableProperty } from "../lib/editable-property";

/**
 * 대상들의 속성 값을 구독한다 (머티리얼·조명·모양·씬 설정 공통, 여러 개 선택이면 함께 편집).
 * 미리보기·undo·파일 열기 모두 property.apply를 거치므로 onChange 하나로 충분하다. 값이 바뀔 때만 새 스냅샷을 만든다.
 * targets는 선택 배열처럼 안정적이어야 한다 — 매 렌더 새 배열이면 스토어가 다시 만들어진다.
 */
function createPropertyStore<K, T>(
  property: EditableProperty<K, T>,
  targets: readonly K[],
) {
  const read = () =>
    targets.flatMap((target) => {
      const values = property.get(target);
      return values ? [values] : [];
    });
  let snapshot = read();

  return {
    subscribe: (onChange: () => void) => {
      const unsubscribes = targets.map((target) =>
        property.onChange(target, () => {
          snapshot = read();
          onChange();
        }),
      );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    },
    getSnapshot: () => snapshot,
  };
}

/** 속성이 있는 대상들의 값 (고른 순서). 속성이 없는 대상은 빠진다 */
export function usePropertyValues<K, T>(
  property: EditableProperty<K, T>,
  targets: readonly K[],
): readonly T[] {
  const store = useMemo(
    () => createPropertyStore(property, targets),
    [property, targets],
  );
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

/** 대상 하나의 값. 속성이 없으면 null */
export function usePropertyValue<K, T>(
  property: EditableProperty<K, T>,
  target: K,
): T | null {
  const targets = useMemo(() => [target], [target]);
  return usePropertyValues(property, targets)[0] ?? null;
}
