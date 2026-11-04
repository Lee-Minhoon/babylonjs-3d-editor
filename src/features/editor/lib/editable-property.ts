import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { createKeyedListeners } from "@/lib/listeners";

import type { Command } from "./history";

/*
 * 대상(메쉬·씬)에 붙은 "값 묶음" 속성의 공통 틀 — 머티리얼·조명·모양·씬 설정이 같은 모양이다.
 *   - 값을 바꾸는 곳(미리보기·Command·파일 열기)은 모두 apply를 거친다 → 대상 속성에 직접 대입하지 않는다.
 *   - apply는 값을 쓰고(write) 알린다 → 패널은 onChange 하나만 구독하면 어디서 바뀌든 반영된다.
 *   - createCommand: 편집 한 번 = Command 하나 ("Box 1 머티리얼"). 여러 대상은 호출하는 쪽이 createMacroCommand로 묶는다.
 * 새 속성(예: 텍스처)은 read/write/isSame만 주면 되고, 패널은 hooks/use-property·use-property-edit를 그대로 쓴다.
 * onChange 구독은 반드시 해제한다 — 키드 리스너는 대상을 강한 참조로 붙잡는다 (훅은 useSyncExternalStore가, 도구는 dispose에서).
 */

export type EditableProperty<K, T> = {
  /** 히스토리 라벨 동사 ("머티리얼" → "Box 1 머티리얼" / "메쉬 3개 머티리얼") */
  verb: string;
  /** 대상의 지금 값 (복사본). 이 속성이 없는 대상이면 null */
  get(target: K): T | null;
  /** 값을 쓰고 알린다. 이 속성이 없는 대상이면 아무것도 하지 않는다 */
  apply(target: K, values: T): void;
  /** 이 대상의 값이 바뀌면 호출된다 */
  onChange(target: K, listener: () => void): () => void;
  isSame(a: T, b: T): boolean;
  createCommand(target: K, before: T, after: T): Command;
};

type PropertyOptions<K, T> = {
  verb: string;
  /** Command 라벨 (예: 메쉬 이름 + 동사) */
  label: (target: K) => string;
  read: (target: K) => T | null;
  /** 대상에 값을 쓴다 (read가 null이 아닌 대상만 불린다) */
  write: (target: K, values: T) => void;
  isSame: (a: T, b: T) => boolean;
};

export function createEditableProperty<K, T>({
  verb,
  label,
  read,
  write,
  isSame,
}: PropertyOptions<K, T>): EditableProperty<K, T> {
  const changed = createKeyedListeners<K>();

  const apply = (target: K, values: T) => {
    if (read(target) === null) return;
    write(target, values);
    changed.emit(target);
  };

  return {
    verb,
    get: read,
    apply,
    onChange: changed.subscribe,
    isSame,
    createCommand: (target, before, after) => ({
      label: label(target),
      execute: () => apply(target, after),
      undo: () => apply(target, before),
    }),
  };
}

/** 메쉬 속성: Command 라벨은 "메쉬 이름 + 동사" */
export function createMeshProperty<T>(
  options: Omit<PropertyOptions<AbstractMesh, T>, "label">,
): EditableProperty<AbstractMesh, T> {
  return createEditableProperty({
    ...options,
    label: (mesh) => `${mesh.name} ${options.verb}`,
  });
}
