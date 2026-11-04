import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { PointerInputMapEntry } from "@babylonjs/core/Cameras/inputMapper";

import type { PlacementTool } from "./placement-tool";
import type { ToolState } from "./tools";

/*
 * 뷰포트 마우스 배치 (카메라 ↔ 박스 선택). 카메라는 Babylon 9의 inputMap으로 정하고,
 * 박스 선택 시작 판정(isBoxSelectDrag)도 같은 규칙을 여기서 함께 둔다 — 둘이 어긋나면 한 드래그가 카메라도 돌리고 박스도 그린다.
 *
 *   왼쪽 드래그        회전 (선택 도구에선 박스 선택, 배치 중이면 회전)
 *   ⌥ + 왼쪽 드래그    선택 도구에서 회전
 *   Shift + 왼쪽 드래그 박스 선택 (기존 선택에 더함, 모든 도구)
 *   ⌃ + 왼쪽 드래그    팬 (Babylon 기본)
 *   오른쪽 / 가운데 드래그  팬
 *   휠 · 핀치          줌 (Babylon 기본)
 */

type PointerEntry = PointerInputMapEntry<"rotate" | "pan">;

/**
 * 설명서·도움말 창에 보여줄 마우스 조작표. 아래 규칙(cameraPointerMap·isBoxSelectDrag)을 바꾸면 여기도 고친다.
 * selectTool: 선택 도구(Q)일 때, otherTools: 이동·회전·크기 도구일 때
 */
export const MOUSE_CONTROLS: readonly {
  input: string;
  selectTool: string;
  otherTools: string;
}[] = [
  { input: "왼쪽 클릭", selectTool: "선택", otherTools: "선택" },
  {
    input: "Shift · ⌘ + 왼쪽 클릭",
    selectTool: "선택에 넣기/빼기",
    otherTools: "선택에 넣기/빼기",
  },
  {
    input: "오른쪽 클릭",
    selectTool: "우클릭 메뉴 (배치 중엔 배치 종료)",
    otherTools: "우클릭 메뉴 (배치 중엔 배치 종료)",
  },
  { input: "왼쪽 드래그", selectTool: "박스 선택", otherTools: "카메라 회전" },
  { input: "⌥ + 왼쪽 드래그", selectTool: "카메라 회전", otherTools: "—" },
  {
    input: "Shift + 왼쪽 드래그",
    selectTool: "박스 선택 (기존 선택에 더함)",
    otherTools: "박스 선택 (기존 선택에 더함)",
  },
  {
    input: "오른쪽 · 가운데 드래그, ⌃ + 왼쪽 드래그",
    selectTool: "카메라 이동 (팬)",
    otherTools: "카메라 이동 (팬)",
  },
  { input: "휠 · 핀치", selectTool: "줌", otherTools: "줌" },
];

/** 선택 도구이고 배치 중이 아닐 때만 왼쪽 드래그가 박스 선택이다 */
export function leftDragSelects(tools: ToolState, placement: PlacementTool) {
  return tools.getTool() === "select" && !placement.isActive();
}

/** 이 포인터 다운이 박스 선택을 시작하는지 (카메라 inputMap과 같은 규칙) */
export function isBoxSelectDrag(
  event: {
    button: number;
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
  },
  { selects, placing }: { selects: boolean; placing: boolean },
): boolean {
  if (event.button !== 0 || event.ctrlKey || placing) return false;
  return event.shiftKey || (selects && !event.altKey);
}

/** 카메라 포인터 입력 규칙 (첫 번째로 맞는 것이 이긴다). 맞는 게 없으면 카메라는 움직이지 않는다 */
export function cameraPointerMap(selects: boolean): PointerEntry[] {
  return [
    {
      source: "pointer",
      button: 0,
      modifiers: { ctrl: true },
      interaction: "pan",
    },
    selects
      ? {
          source: "pointer",
          button: 0,
          modifiers: { alt: true, shift: false },
          interaction: "rotate",
        }
      : {
          source: "pointer",
          button: 0,
          modifiers: { shift: false },
          interaction: "rotate",
        },
    { source: "pointer", button: 1, interaction: "pan" },
    { source: "pointer", button: 2, interaction: "pan" },
  ];
}

/** 도구·배치 상태가 바뀔 때마다 카메라의 포인터 규칙을 바꾼다 (휠·키보드 규칙은 그대로) */
export function bindCameraControls(
  camera: ArcRotateCamera,
  { tools, placement }: { tools: ToolState; placement: PlacementTool },
): () => void {
  const input = camera.movement.input;
  const apply = () => {
    input.inputMap = [
      ...cameraPointerMap(leftDragSelects(tools, placement)),
      ...input.inputMap.filter((entry) => entry.source !== "pointer"),
    ];
  };
  apply();
  const unsubscribeTools = tools.subscribe(apply);
  const unsubscribePlacement = placement.subscribe(apply);
  return () => {
    unsubscribeTools();
    unsubscribePlacement();
  };
}
