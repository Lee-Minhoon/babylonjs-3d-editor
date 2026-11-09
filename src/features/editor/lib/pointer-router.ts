import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { InputManager } from "@babylonjs/core/Inputs/scene.inputManager";
import type { Scene } from "@babylonjs/core/scene";

import type { BoxSelect } from "./box-select";
import { isBoxSelectDrag, leftDragSelects } from "./camera-controls";
import type { ContextMenu } from "./context-menu";
import type { PlacementTool } from "./placement-tool";
import { isAdditiveClick, type Selection } from "./selection";
import type { ToolState } from "./tools";
import type { TransformGizmo } from "./transform-gizmo";

/*
 * 뷰포트 포인터 입력을 한 곳에서 받아 우선순위대로 한 도구에만 넘긴다.
 * 도구마다 scene.onPointerObservable을 따로 구독하면 "기즈모 클릭이 선택 해제로 새는" 식의
 * 충돌을 도구 쌍마다 막아야 하므로 여기서 결정한다.
 *
 *   1. 기즈모 위 / 드래그 중  → 기즈모가 처리 (여기선 아무것도 안 함)
 *   2. 배치 모드              → 좌클릭 배치, 우클릭 종료, 이동 시 미리보기 갱신
 *   3. 박스 선택 드래그        → 선택 도구의 왼쪽 드래그 · 모든 도구의 Shift+드래그 (camera-controls가 규칙을 정한다)
 *   4. 그 외                  → 좌클릭으로 선택 / 빈 곳이면 해제. Shift·⌘/Ctrl+클릭은 선택에 넣고 빼기
 *                               우클릭은 우클릭 메뉴: 객체 위면 (안 골라져 있으면 그것만 골라) 선택 메뉴, 빈 곳이면 씬 메뉴
 *
 * 클릭(탭)은 여기서 직접 판정한다: 누른 자리에서 탭 판정 거리(DragMovementThreshold) 안에 같은 버튼을 떼면 탭,
 * 더 움직였으면 드래그(카메라 조작). Babylon의 POINTERTAP/DOUBLETAP은 쓰지 않는다 — 앞 클릭과의 간격이
 * 정확히 DoubleClickDelay(300ms)면 둘 다 발생하지 않아 클릭이 사라진다 (scene.inputManager의 `>`/`<` 경계).
 * 박스 선택은 같은 거리를 넘게 움직여야 시작되므로 같은 누름이 탭과 박스로 두 번 처리되지 않는다.
 */

const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

type Targets = {
  gizmo: TransformGizmo;
  placement: PlacementTool;
  selection: Selection;
  tools: ToolState;
  boxSelect: BoxSelect;
  contextMenu: ContextMenu;
};

export function bindPointerRouter(
  scene: Scene,
  { gizmo, placement, selection, tools, boxSelect, contextMenu }: Targets,
): () => void {
  /** 마지막으로 누른 버튼과 자리 (캔버스 기준 CSS 픽셀). 떼면 비운다 */
  let press: { button: number; x: number; y: number } | null = null;

  const observer = scene.onPointerObservable.add((info) => {
    const isPlacing = placement.isActive();

    if (info.type === PointerEventTypes.POINTERMOVE) {
      if (isPlacing) placement.updatePointer();
      if (boxSelect.isPending())
        boxSelect.update(scene.pointerX, scene.pointerY);
      return;
    }

    if (info.type === PointerEventTypes.POINTERDOWN) {
      const event = info.event as PointerEvent;
      press = { button: event.button, x: scene.pointerX, y: scene.pointerY };
      const startsBox =
        !gizmo.isPointerOver() &&
        isBoxSelectDrag(event, {
          selects: leftDragSelects(tools, placement),
          placing: isPlacing,
        });
      if (startsBox) {
        boxSelect.begin(scene.pointerX, scene.pointerY, event.shiftKey);
      }
      return;
    }

    if (info.type !== PointerEventTypes.POINTERUP) return;
    const event = info.event as PointerEvent;
    const pressed = press;
    press = null;
    // 박스가 됐으면 탭이 아니다
    if (boxSelect.isPending() && boxSelect.end()) return;
    if (!pressed || pressed.button !== event.button) return;
    const moved = Math.hypot(
      scene.pointerX - pressed.x,
      scene.pointerY - pressed.y,
    );
    if (moved > InputManager.DragMovementThreshold) return;
    if (gizmo.isPointerOver()) return;

    const button = event.button;
    if (isPlacing) {
      if (button === LEFT_BUTTON) placement.place();
      else if (button === RIGHT_BUTTON) placement.cancel();
    } else if (button === LEFT_BUTTON) {
      selection.selectAtPointer(isAdditiveClick(event));
    } else if (button === RIGHT_BUTTON) {
      openContextMenu(event);
    }
  });

  function openContextMenu(event: PointerEvent) {
    const mesh = selection.meshAtPointer();
    if (mesh && !selection.getMeshes().includes(mesh)) selection.select(mesh);
    contextMenu.open(
      mesh ? "selection" : "scene",
      { x: event.clientX, y: event.clientY },
      { x: scene.pointerX, y: scene.pointerY },
    );
  }

  return () => observer.remove();
}
