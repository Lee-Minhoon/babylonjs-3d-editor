import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { createMacroCommand, type History, macroLabel } from "./history";
import type { PlacementTool } from "./placement-tool";
import type { Selection } from "./selection";
import { type ToolState, type TransformTool } from "./tools";
import {
  captureTransform,
  createTransformCommand,
  isSameTransform,
  type TransformSnapshot,
} from "./transform-command";

/**
 * 선택된 메쉬에 이동/회전/크기 기즈모를 붙인다.
 * 표시 조건: 선택된 메쉬가 있고, 도구가 move/rotate/scale이고, 배치 모드가 아닐 때.
 * 여러 개를 선택하면 묶음 중심의 피벗(TransformNode)에 기즈모를 붙이고, 드래그하는 동안만
 * 메쉬들을 피벗의 자식으로 만들어 함께 움직인다 (setParent는 월드 변형을 유지한다).
 * 드래그가 끝날 때마다 변형 Command를 history에 한 번 기록한다 (여러 개면 묶어서 하나).
 */
export type TransformGizmo = {
  /** 커서가 기즈모 위에 있거나 드래그 중이면 true → 뷰포트 클릭을 기즈모가 가져간다 */
  isPointerOver(): boolean;
  /** 기즈모를 끄는 중이면 true → 그동안 단축키(undo·삭제 등)를 받지 않는다 */
  isDragging(): boolean;
  /** 기즈모가 붙은 대상 (메쉬 하나 또는 여러 개 선택의 피벗). 숨겨져 있으면 null */
  getTarget(): TransformNode | null;
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

  /** 여러 개 선택용 피벗. 선택이 바뀔 때마다 묶음 중심으로 옮기고 회전·크기를 초기화한다 */
  const pivot = new TransformNode("__selection-pivot", scene);
  let dragStart: { mesh: AbstractMesh; before: TransformSnapshot }[] | null =
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
      const meshes = selection.getMeshes();
      dragStart = meshes.map((mesh) => ({
        mesh,
        before: captureTransform(mesh),
      }));
      if (meshes.length > 1) {
        for (const mesh of meshes) mesh.setParent(pivot);
      }
    });
    gizmo.onDragEndObservable.add(() => {
      if (!dragStart) return;
      const started = dragStart;
      dragStart = null;
      if (started.length > 1) {
        for (const { mesh } of started) mesh.setParent(null);
      }

      const kind = KIND_BY_TOOL[tool];
      const commands = started.flatMap(({ mesh, before }) => {
        const after = captureTransform(mesh);
        return isSameTransform(before, after)
          ? []
          : [createTransformCommand(mesh, kind, before, after)];
      });
      if (commands.length > 0) {
        history.execute(
          createMacroCommand(macroLabel(commands, kind), commands),
        );
      }
      // 다음 드래그를 위해 피벗을 새 중심으로 (회전·크기는 초기화)
      if (started.length > 1) sync();
    });
  }

  /** 피벗을 메쉬들의 월드 바운딩 박스 중심에 둔다 */
  function placePivot(meshes: readonly AbstractMesh[]) {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(box.minimumWorld);
      max.maximizeInPlace(box.maximumWorld);
    }
    pivot.position.copyFrom(min.add(max).scale(0.5));
    pivot.rotationQuaternion = null;
    pivot.rotation.setAll(0);
    pivot.scaling.setAll(1);
  }

  function sync() {
    // 드래그 중에 선택이 바뀌는 일은 없지만, 피벗을 옮기면 자식이 따라가므로 막아 둔다
    if (dragStart) return;
    const tool = tools.getTool();
    const meshes = selection.getMeshes();
    const visible =
      meshes.length > 0 && tool !== "select" && !placement.isActive();

    manager.positionGizmoEnabled = visible && tool === "move";
    manager.rotationGizmoEnabled = visible && tool === "rotate";
    manager.scaleGizmoEnabled = visible && tool === "scale";
    observe(manager.gizmos.positionGizmo, "move");
    // 드래그 변화량을 스냅 단위로 끊는다 (배치도 스냅되므로 격자 위에서 시작해 격자 위에 머문다)
    if (manager.gizmos.positionGizmo) {
      manager.gizmos.positionGizmo.snapDistance = tools.getActiveSnap() ?? 0;
    }
    observe(manager.gizmos.rotationGizmo, "rotate");
    observe(manager.gizmos.scaleGizmo, "scale");

    if (!visible) {
      manager.attachToNode(null);
    } else if (meshes.length === 1) {
      manager.attachToMesh(meshes[0]);
    } else {
      placePivot(meshes);
      manager.attachToNode(pivot);
    }
  }

  const unsubscribers = [
    selection.subscribe(sync),
    // 여러 개 선택 피벗은 메쉬를 따라가지 않으므로, undo/redo 등으로 메쉬가 움직이면 다시 놓는다
    history.subscribe(sync),
    tools.subscribe(sync),
    placement.subscribe(sync),
  ];
  sync();

  return {
    isPointerOver: () => manager.isHovered || manager.isDragging,
    isDragging: () => dragStart !== null,
    getTarget: () => {
      const target = manager.attachedMesh ?? manager.attachedNode;
      return target instanceof TransformNode ? target : null;
    },
    dispose() {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      manager.dispose();
      pivot.dispose();
    },
  };
}
