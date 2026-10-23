import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

import type { History } from "./history";
import type { PlacementTool } from "./placement-tool";
import type { Selection } from "./selection";
import type { ToolState, TransformTool } from "./tools";
import {
  captureTransform,
  createTransformCommand,
  isSameTransform,
  type TransformSnapshot,
} from "./transform-command";

/**
 * 선택된 메쉬에 이동/회전/크기 기즈모를 붙인다.
 * 표시 조건: 선택된 메쉬가 있고, 도구가 move/rotate/scale이고, 배치 모드가 아닐 때.
 * 드래그가 끝날 때마다 변형 Command를 history에 한 번 기록한다.
 */
export type TransformGizmo = {
  /** 커서가 기즈모 위에 있거나 드래그 중이면 true → 뷰포트 클릭을 기즈모가 가져간다 */
  isPointerOver(): boolean;
  dispose(): void;
};

type Dependencies = {
  history: History;
  selection: Selection;
  tools: ToolState;
  placement: PlacementTool;
};

/** position/rotation/scale 기즈모의 공통 부분 (드래그 이벤트 데이터는 쓰지 않는다) */
type DraggableGizmo = {
  onDragStartObservable: { add(callback: () => void): unknown };
  onDragEndObservable: { add(callback: () => void): unknown };
};

const KIND_BY_TOOL = {
  move: "이동",
  rotate: "회전",
  scale: "크기",
} as const;

export function createTransformGizmo(
  scene: Scene,
  { history, selection, tools, placement }: Dependencies,
): TransformGizmo {
  const manager = new GizmoManager(scene);
  // 붙일 메쉬는 우리가 정한다 (기즈모 매니저 자체의 클릭 선택 끔)
  manager.usePointerToAttachGizmos = false;
  manager.clearGizmoOnEmptyPointerEvent = false;

  let dragStart: { mesh: AbstractMesh; before: TransformSnapshot } | null =
    null;
  const observed = new WeakSet<DraggableGizmo>();

  /** 드래그 시작/끝 구독. 기즈모는 처음 켤 때 생성되므로 켤 때마다 확인한다. */
  function observe(
    gizmo: DraggableGizmo | null,
    tool: Exclude<TransformTool, "select">,
  ) {
    if (!gizmo || observed.has(gizmo)) return;
    observed.add(gizmo);
    gizmo.onDragStartObservable.add(() => {
      const mesh = selection.getSelected();
      dragStart = mesh ? { mesh, before: captureTransform(mesh) } : null;
    });
    gizmo.onDragEndObservable.add(() => {
      if (!dragStart) return;
      const { mesh, before } = dragStart;
      dragStart = null;
      const after = captureTransform(mesh);
      if (isSameTransform(before, after)) return;
      history.execute(
        createTransformCommand(mesh, KIND_BY_TOOL[tool], before, after),
      );
    });
  }

  function sync() {
    const tool = tools.getTool();
    const mesh = selection.getSelected();
    const visible =
      mesh !== null && tool !== "select" && !placement.getActivePresetId();

    manager.positionGizmoEnabled = visible && tool === "move";
    manager.rotationGizmoEnabled = visible && tool === "rotate";
    manager.scaleGizmoEnabled = visible && tool === "scale";
    observe(manager.gizmos.positionGizmo, "move");
    observe(manager.gizmos.rotationGizmo, "rotate");
    observe(manager.gizmos.scaleGizmo, "scale");

    manager.attachToMesh(visible ? mesh : null);
  }

  const unsubscribers = [
    selection.subscribe(sync),
    tools.subscribe(sync),
    placement.subscribe(sync),
  ];
  sync();

  return {
    isPointerOver: () => manager.isHovered || manager.isDragging,
    dispose() {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      manager.dispose();
    },
  };
}
