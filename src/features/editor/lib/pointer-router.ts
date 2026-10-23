import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Scene } from "@babylonjs/core/scene";

import type { PlacementTool } from "./placement-tool";
import type { Selection } from "./selection";
import type { TransformGizmo } from "./transform-gizmo";

/*
 * 뷰포트 포인터 입력을 한 곳에서 받아 우선순위대로 한 도구에만 넘긴다.
 * 도구마다 scene.onPointerObservable을 따로 구독하면 "기즈모 클릭이 선택 해제로 새는" 식의
 * 충돌을 도구 쌍마다 막아야 하므로 여기서 결정한다.
 *
 *   1. 기즈모 위 / 드래그 중  → 기즈모가 처리 (여기선 아무것도 안 함)
 *   2. 배치 모드              → 좌클릭 배치, 우클릭 종료, 이동 시 미리보기 갱신
 *   3. 그 외                  → 좌클릭으로 선택 / 빈 곳이면 해제
 *
 * 클릭은 POINTERTAP(거의 움직이지 않은 클릭)만 본다 — 드래그는 카메라 조작이다.
 */

const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;

type Targets = {
  gizmo: TransformGizmo;
  placement: PlacementTool;
  selection: Selection;
};

export function bindPointerRouter(
  scene: Scene,
  { gizmo, placement, selection }: Targets,
): () => void {
  const observer = scene.onPointerObservable.add((info) => {
    const isPlacing = placement.getActivePresetId() !== null;

    if (info.type === PointerEventTypes.POINTERMOVE) {
      if (isPlacing) placement.updatePointer();
      return;
    }

    const isTap =
      info.type === PointerEventTypes.POINTERTAP ||
      // 300ms 안의 두 번째 클릭은 위치와 무관하게 DOUBLETAP으로만 온다 (연속 클릭 누락 방지)
      info.type === PointerEventTypes.POINTERDOUBLETAP;
    if (!isTap || gizmo.isPointerOver()) return;

    const button = (info.event as PointerEvent).button;
    if (isPlacing) {
      if (button === LEFT_BUTTON) placement.place();
      else if (button === RIGHT_BUTTON) placement.cancel();
    } else if (button === LEFT_BUTTON) {
      selection.selectAtPointer();
    }
  });

  return () => observer.remove();
}
