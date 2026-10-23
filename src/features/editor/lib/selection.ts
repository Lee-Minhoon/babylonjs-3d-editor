// scene.pick 등록
import "@babylonjs/core/Culling/ray";

import { SelectionOutlineLayer } from "@babylonjs/core/Layers/selectionOutlineLayer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import { isEditorMesh } from "./mesh-presets";

/**
 * 단일 선택 상태 + 외곽선 표시.
 * 선택은 undo 히스토리에 기록하지 않는다. 선택된 메쉬가 씬에서 빠지면(삭제·추가 undo) 자동 해제.
 * 뷰포트 클릭은 pointer-router가 selectAtPointer()를 호출한다.
 */
export type Selection = {
  getSelected(): AbstractMesh | null;
  select(mesh: AbstractMesh | null): void;
  /** 현재 커서 아래 에디터 메쉬를 선택, 없으면 해제 */
  selectAtPointer(): void;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
};

export function createSelection(scene: Scene): Selection {
  let selected: AbstractMesh | null = null;
  const listeners = new Set<() => void>();

  const outline = new SelectionOutlineLayer("__selection-outline", scene);
  outline.outlineColor = new Color3(1, 0.6, 0.15);
  outline.outlineThickness = 2;

  function select(mesh: AbstractMesh | null) {
    if (mesh === selected) return;
    selected = mesh;
    outline.clearSelection();
    if (mesh) outline.addSelection(mesh);
    listeners.forEach((listener) => listener());
  }

  const removedObserver = scene.onMeshRemovedObservable.add((mesh) => {
    if (mesh === selected) select(null);
  });

  return {
    getSelected: () => selected,
    select,
    selectAtPointer() {
      const hit = scene.pick(scene.pointerX, scene.pointerY, isEditorMesh);
      select(hit?.pickedMesh ?? null);
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
