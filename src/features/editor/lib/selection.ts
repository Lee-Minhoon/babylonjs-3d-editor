// scene.pick 등록
import "@babylonjs/core/Culling/ray";

import { SelectionOutlineLayer } from "@babylonjs/core/Layers/selectionOutlineLayer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import { isEditorMesh } from "./mesh-presets";

/**
 * 선택 상태(여러 개) + 외곽선 표시.
 * 마지막으로 고른 메쉬가 primary — 속성 패널·단일 기즈모의 기준이다.
 * 선택은 undo 히스토리에 기록하지 않는다. 선택된 메쉬가 씬에서 빠지면(삭제·추가 undo) 선택에서도 빠진다.
 * 뷰포트 클릭은 pointer-router가 selectAtPointer()를 호출한다.
 */
export type Selection = {
  /** 선택된 메쉬들 (고른 순서). 바뀔 때만 새 배열이라 useSyncExternalStore에 바로 쓸 수 있다 */
  getMeshes(): readonly AbstractMesh[];
  /** 마지막으로 고른 메쉬. 없으면 null */
  getPrimary(): AbstractMesh | null;
  /** 이 메쉬 하나만 선택 (null이면 모두 해제) */
  select(mesh: AbstractMesh | null): void;
  /** 이 메쉬들로 선택을 바꾼다 (붙여넣기 결과 등) */
  set(meshes: readonly AbstractMesh[]): void;
  /** 선택에 넣거나 빼기 (Shift/⌘ 클릭) */
  toggle(mesh: AbstractMesh): void;
  /**
   * 커서 아래 에디터 메쉬를 선택한다.
   * additive면 그 메쉬를 넣거나 빼고, 빈 곳이면 그대로 둔다. 아니면 그것만 선택 / 빈 곳이면 해제.
   */
  selectAtPointer(additive: boolean): void;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

export function createSelection(scene: Scene): Selection {
  let selected: readonly AbstractMesh[] = [];
  const listeners = new Set<() => void>();

  const outline = new SelectionOutlineLayer("__selection-outline", scene);
  outline.outlineColor = new Color3(1, 0.6, 0.15);
  outline.outlineThickness = 2;

  function set(meshes: readonly AbstractMesh[]) {
    const next = [...new Set(meshes)];
    if (
      next.length === selected.length &&
      next.every((mesh, index) => mesh === selected[index])
    ) {
      return;
    }
    selected = next;
    outline.clearSelection();
    if (next.length > 0) outline.addSelection([...next]);
    listeners.forEach((listener) => listener());
  }

  function toggle(mesh: AbstractMesh) {
    set(
      selected.includes(mesh)
        ? selected.filter((item) => item !== mesh)
        : [...selected, mesh],
    );
  }

  const removedObserver = scene.onMeshRemovedObservable.add((mesh) => {
    if (selected.includes(mesh)) set(selected.filter((item) => item !== mesh));
  });

  return {
    getMeshes: () => selected,
    getPrimary: () => selected.at(-1) ?? null,
    select: (mesh) => set(mesh ? [mesh] : []),
    set,
    toggle,
    selectAtPointer(additive) {
      const hit = scene.pick(scene.pointerX, scene.pointerY, isEditorMesh);
      const mesh = hit?.pickedMesh ?? null;
      if (additive) {
        if (mesh) toggle(mesh);
      } else {
        set(mesh ? [mesh] : []);
      }
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    dispose() {
      removedObserver.remove();
      outline.dispose();
      listeners.clear();
    },
  };
}
