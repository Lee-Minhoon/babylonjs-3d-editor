import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { createMacroCommand, type History, macroLabel } from "./history";
import { getEditorParent, topLevelOnly } from "./mesh-hierarchy";
import { isLightObject } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import type { Selection } from "./selection";
import { type GizmoSpace, type ToolState, type TransformTool } from "./tools";
import {
  applyTransform,
  captureTransform,
  createTransformCommand,
  decomposeTransform,
  isSameTransform,
  type TransformSnapshot,
} from "./transform-command";

/**
 * 선택된 메쉬에 이동/회전/크기 기즈모를 붙인다.
 * 표시 조건: 선택된 메쉬가 있고, 도구가 move/rotate/scale이고, 배치 모드가 아닐 때.
 * 여러 개를 선택하면 묶음 중심의 피벗(TransformNode)에 기즈모를 붙이고, 드래그하는 동안
 * 매 프레임 메쉬들을 피벗을 따라 옮긴다 (드래그 시작 때 피벗 기준 자세를 기억해 두고 다시 계산 — 부모는 그대로).
 * 부모와 자식을 함께 골랐으면 자식은 부모를 따라가므로 부모만 옮긴다 (topLevelOnly).
 * 드래그가 끝날 때마다 변형 Command를 history에 한 번 기록한다 (여러 개면 묶어서 하나).
 *
 * 알려진 한계: 피벗을 회전·크기 조절하면 메쉬의 월드 행렬에 전단(shear)이 생길 수 있는데
 * (비균일 크기 + 피벗과 다른 축의 회전), 위치·회전·크기(TRS)로 분해하므로 그런 메쉬는 근사된다.
 * 이동은 전단이 생기지 않아 정확하다.
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
  /** offset: 드래그 시작 때 메쉬의 피벗 기준 행렬 (여러 개일 때만 쓴다) */
  let dragStart:
    { mesh: AbstractMesh; before: TransformSnapshot; offset: Matrix }[] | null =
    null;
  const observed = new WeakSet<DraggableGizmo>();

  /** 기즈모 대상: 크기 도구에서는 조명 아이콘을 뺀다 (조명은 크기가 없다 — 속성 패널과 같게) */
  function targetMeshes(tool: TransformTool): readonly AbstractMesh[] {
    const meshes = selection.getMeshes();
    return tool === "scale"
      ? meshes.filter((mesh) => !isLightObject(mesh))
      : meshes;
  }

  /** 드래그 시작/끝 구독. 기즈모는 처음 켤 때 생성되므로 켤 때마다 확인한다. */
  function observe(
    gizmo: DraggableGizmo | null,
    tool: Exclude<TransformTool, "select">,
  ) {
    if (!gizmo || observed.has(gizmo)) return;
    observed.add(gizmo);
    gizmo.onDragStartObservable.add(() => {
      const meshes = targetMeshes(tool);
      const pivotInverse = Matrix.Invert(pivot.computeWorldMatrix(true));
      dragStart = (meshes.length > 1 ? topLevelOnly(meshes) : meshes).map(
        (mesh) => ({
          mesh,
          before: captureTransform(mesh),
          offset: mesh.computeWorldMatrix(true).multiply(pivotInverse),
        }),
      );
    });
    gizmo.onDragEndObservable.add(() => {
      if (!dragStart) return;
      followPivot();
      const started = dragStart;
      dragStart = null;

      const kind = KIND_BY_TOOL[tool];
      const commands = started.flatMap(({ mesh, before }) => {
        const after = captureTransform(mesh);
        if (isSameTransform(before, after)) {
          // 움직이지 않은 드래그(클릭). 행렬 분해가 남긴 미세한 오차·다른 오일러 표현을 원래대로
          applyTransform(mesh, before);
          return [];
        }
        return [createTransformCommand(mesh, kind, before, after)];
      });
      if (commands.length > 0) {
        // 히스토리 구독(sync)이 피벗을 새 중심으로 옮긴다 (크기는 초기화, 회전은 축 방향 설정대로)
        history.execute(
          createMacroCommand(macroLabel(commands, kind), commands),
        );
      } else {
        // 움직이지 않은 드래그: 기즈모가 건드린 피벗만 제자리로
        sync();
      }
    });
  }

  /** 여러 개 드래그 중: 메쉬들을 피벗의 지금 자세에 맞춰 옮긴다 (부모가 있으면 부모 기준 값으로) */
  function followPivot() {
    if (!dragStart || manager.attachedNode !== pivot) return;
    const pivotWorld = pivot.computeWorldMatrix(true);
    for (const { mesh, offset } of dragStart) {
      const world = offset.multiply(pivotWorld);
      const parent = getEditorParent(mesh);
      const local = parent
        ? world.multiply(Matrix.Invert(parent.computeWorldMatrix(true)))
        : world;
      applyTransform(mesh, decomposeTransform(mesh, local));
    }
  }
  // 기즈모는 포인터 이벤트에서 피벗을 움직인다 → 그리기 전에 따라간다
  const followObserver = scene.onBeforeRenderObservable.add(followPivot);

  /**
   * 피벗을 메쉬들의 월드 바운딩 박스 중심에 둔다. 크기는 초기화한다.
   * 회전: 로컬 모드면 처음 고른 메쉬의 회전(축이 그 메쉬를 따른다), 월드 모드면 없음.
   */
  function placePivot(meshes: readonly AbstractMesh[], space: GizmoSpace) {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(box.minimumWorld);
      max.maximizeInPlace(box.maximumWorld);
    }
    pivot.position.copyFrom(min.add(max).scale(0.5));
    pivot.rotation.setAll(0);
    pivot.rotationQuaternion =
      space === "local" ? meshes[0].absoluteRotationQuaternion.clone() : null;
    pivot.scaling.setAll(1);
  }

  function sync() {
    // 드래그 중에 선택이 바뀌는 일은 없지만, 피벗을 옮기면 자식이 따라가므로 막아 둔다
    if (dragStart) return;
    const tool = tools.getTool();
    const meshes = targetMeshes(tool);
    const space = tools.getGizmoSpace();
    const visible =
      meshes.length > 0 && tool !== "select" && !placement.isActive();

    manager.positionGizmoEnabled = visible && tool === "move";
    manager.rotationGizmoEnabled = visible && tool === "rotate";
    manager.scaleGizmoEnabled = visible && tool === "scale";
    const { positionGizmo, rotationGizmo, scaleGizmo } = manager.gizmos;
    observe(positionGizmo, "move");
    observe(rotationGizmo, "rotate");
    observe(scaleGizmo, "scale");
    // 드래그 변화량을 스냅 단위로 끊는다 (배치도 스냅되므로 격자 위에서 시작해 격자 위에 머문다)
    if (positionGizmo) {
      positionGizmo.snapDistance = tools.getActiveSnap("move") ?? 0;
      positionGizmo.updateGizmoRotationToMatchAttachedMesh = space === "local";
    }
    if (rotationGizmo) {
      // 회전 스냅 단위는 도, Babylon은 라디안
      rotationGizmo.snapDistance =
        ((tools.getActiveSnap("rotate") ?? 0) * Math.PI) / 180;
      rotationGizmo.updateGizmoRotationToMatchAttachedMesh = space === "local";
    }
    // 크기 기즈모는 항상 메쉬 축 (Babylon이 월드 축 크기 조절을 지원하지 않는다).
    // incrementalSnap: 0.1 단위면 1 → 1.1 → 1.2 (곱하기가 아니라 더하기)
    if (scaleGizmo) {
      scaleGizmo.snapDistance = tools.getActiveSnap("scale") ?? 0;
      scaleGizmo.incrementalSnap = true;
    }

    if (!visible) {
      manager.attachToNode(null);
    } else if (meshes.length === 1) {
      manager.attachToMesh(meshes[0]);
    } else {
      placePivot(meshes, space);
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
      followObserver.remove();
      manager.dispose();
      pivot.dispose();
    },
  };
}
