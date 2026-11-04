import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createClipboard } from "./clipboard";
import {
  alignSelected,
  copySelected,
  cutSelected,
  deleteMesh,
  deleteSelected,
  distributeSelected,
  duplicateSelected,
  focusSelected,
  hideSelected,
  parentSelected,
  paste,
  renameMesh,
  setSelectedLocked,
  showAllHidden,
  startPresetPlacement,
  toggleMeshFlag,
  unparentSelected,
} from "./editor-actions";
import { createHistory } from "./history";
import { getMeshFlag } from "./mesh-flags";
import { getEditorParent, setMeshParent } from "./mesh-hierarchy";
import { addPresetMesh, findPreset } from "./mesh-presets";
import type { PlacementTool } from "./placement-tool";
import { clearEditorMeshes } from "./scene-format";
import { createSelection, type Selection } from "./selection";
import { createTestScene } from "./test-scene";

/*
 * 단축키·메뉴가 공유하는 동작. Selection·Clipboard·History는 실제 객체,
 * 배치 도구는 "무엇으로 배치를 시작했는지"만 보는 가짜 (커서 피킹은 배치 도구의 몫).
 */

const scene = createTestScene();
const selections: Selection[] = [];
afterEach(() => {
  selections.splice(0).forEach((selection) => selection.dispose());
  clearEditorMeshes(scene);
});

const box = () => addPresetMesh(scene, findPreset("box")!);

function setup() {
  const history = createHistory();
  const selection = createSelection(scene);
  selections.push(selection);
  const clipboard = createClipboard();
  const placement = {
    startSnapshot: vi.fn(),
    toggle: vi.fn(),
    getActivePresetId: vi.fn(() => null),
  };
  return {
    scene,
    history,
    selection,
    clipboard,
    placement: placement as unknown as PlacementTool,
    placementMock: placement,
  };
}

describe("삭제·잘라내기", () => {
  test("deleteSelected: 선택한 메쉬들을 Command 하나로 지우고 undo로 돌아온다", () => {
    const context = setup();
    const [a, b] = [box(), box()];
    context.selection.set([a, b]);
    expect(deleteSelected(context)).toBe(true);
    expect(context.history.getState().undoLabel).toBe("메쉬 2개 삭제");
    expect(scene.meshes).not.toContain(a);
    expect(context.selection.getMeshes()).toEqual([]); // 씬에서 빠지면 선택에서도
    context.history.undo();
    expect(scene.meshes).toContain(a);
    expect(scene.meshes).toContain(b);
  });

  test("deleteSelected: 선택이 없으면 false, 부모와 자식을 함께 골랐으면 부모만 지운다", () => {
    const context = setup();
    expect(deleteSelected(context)).toBe(false);
    const parent = box();
    const child = box();
    setMeshParent(child, parent);
    context.selection.set([child, parent]);
    deleteSelected(context);
    expect(context.history.getState().undoLabel).toBe(`${parent.name} 삭제`);
    expect(scene.meshes).not.toContain(child);
  });

  test("deleteMesh: 선택과 무관하게 그 메쉬만", () => {
    const context = setup();
    const [a, b] = [box(), box()];
    context.selection.set([a]);
    deleteMesh(context, b);
    expect(scene.meshes).toContain(a);
    expect(scene.meshes).not.toContain(b);
  });

  test("cutSelected: 클립보드에 담고 지운다 (라벨은 잘라내기), 빈 선택은 false", () => {
    const context = setup();
    expect(cutSelected(context)).toBe(false);
    const a = box();
    context.selection.set([a]);
    expect(cutSelected(context)).toBe(true);
    expect(context.clipboard.get()).toHaveLength(1);
    expect(context.history.getState().undoLabel).toBe(`${a.name} 잘라내기`);
    expect(scene.meshes).not.toContain(a);
  });
});

describe("복사·붙여넣기·복제", () => {
  test("copySelected는 히스토리에 남지 않는다", () => {
    const context = setup();
    expect(copySelected(context)).toBe(false);
    context.selection.set([box()]);
    expect(copySelected(context)).toBe(true);
    expect(context.clipboard.hasContent()).toBe(true);
    expect(context.history.getState().undoLabel).toBeNull();
  });

  test("paste: 클립보드 내용으로 배치를 시작하고, 놓인 메쉬들을 선택한다", () => {
    const context = setup();
    expect(paste(context)).toBe(false);
    context.selection.set([box(), box()]);
    copySelected(context);
    expect(paste(context)).toBe(true);

    const [snapshots, verb, onPlaced] =
      context.placementMock.startSnapshot.mock.calls[0];
    expect(snapshots).toHaveLength(2);
    expect(verb).toBe("붙여넣기");
    const placed = [box()];
    onPlaced(placed);
    expect(context.selection.getMeshes()).toEqual(placed);
  });

  test("duplicateSelected: 클립보드는 건드리지 않고 선택으로 배치를 시작한다", () => {
    const context = setup();
    expect(duplicateSelected(context)).toBe(false);
    context.selection.set([box()]);
    expect(duplicateSelected(context)).toBe(true);
    expect(context.clipboard.hasContent()).toBe(false);
    expect(context.placementMock.startSnapshot.mock.calls[0][1]).toBe("복제");
  });

  test("startPresetPlacement: 이미 그 프리셋으로 배치 중이면 끄지 않는다", () => {
    const { placement, placementMock } = setup();
    const preset = findPreset("sphere")!;
    startPresetPlacement(placement, preset);
    expect(placementMock.toggle).toHaveBeenCalledWith(preset);
    placementMock.getActivePresetId.mockReturnValue("sphere" as never);
    startPresetPlacement(placement, preset);
    expect(placementMock.toggle).toHaveBeenCalledTimes(1);
  });
});

describe("이름·숨김·잠금", () => {
  test("renameMesh: 바뀌면 Command, 그대로거나 비면 false", () => {
    const context = setup();
    const a = box();
    expect(renameMesh(context, a, a.name)).toBe(false);
    expect(renameMesh(context, a, "  ")).toBe(false);
    expect(renameMesh(context, a, " Wall ")).toBe(true);
    expect(a.name).toBe("Wall");
    context.history.undo();
    expect(a.name).toMatch(/^Box \d+$/);
  });

  test("hideSelected는 선택에서 빼고, showAllHidden은 모두 보인다 (숨긴 게 없으면 false)", () => {
    const context = setup();
    const [a, b] = [box(), box()];
    expect(showAllHidden(context)).toBe(false);
    context.selection.set([a]);
    expect(hideSelected(context)).toBe(true);
    expect(getMeshFlag(a, "hidden")).toBe(true);
    expect(context.selection.getMeshes()).toEqual([]);
    toggleMeshFlag(context, b, "hidden");
    expect(showAllHidden(context)).toBe(true);
    expect(getMeshFlag(a, "hidden")).toBe(false);
    expect(getMeshFlag(b, "hidden")).toBe(false);
    expect(context.history.getState().undoLabel).toBe("메쉬 2개 보이기");
  });

  test("setSelectedLocked / toggleMeshFlag는 undo 대상", () => {
    const context = setup();
    const a = box();
    context.selection.set([a]);
    expect(setSelectedLocked(context, true)).toBe(true);
    expect(setSelectedLocked(context, true)).toBe(false); // 이미 그 값
    expect(getMeshFlag(a, "locked")).toBe(true);
    context.history.undo();
    expect(getMeshFlag(a, "locked")).toBe(false);
    toggleMeshFlag(context, a, "locked");
    expect(getMeshFlag(a, "locked")).toBe(true);
  });
});

describe("계층·정렬·포커스", () => {
  test("parentSelected: 마지막에 고른 것이 부모, 2개 미만이면 false; unparentSelected로 해제", () => {
    const context = setup();
    const [a, b, c] = [box(), box(), box()];
    context.selection.set([a]);
    expect(parentSelected(context)).toBe(false);
    context.selection.set([a, b, c]);
    expect(parentSelected(context)).toBe(true);
    expect(getEditorParent(a)).toBe(c);
    expect(getEditorParent(b)).toBe(c);
    expect(getEditorParent(c)).toBeNull();

    context.selection.set([a, b]);
    expect(unparentSelected(context)).toBe(true);
    expect(getEditorParent(a)).toBeNull();
    expect(unparentSelected(context)).toBe(false); // 이미 최상위
  });

  test("정렬·분배·바닥에 붙이기는 개수 조건을 지키고 Command로 기록한다", () => {
    const context = setup();
    const [a, b] = [box(), box()];
    b.position.x = 3;
    context.selection.set([a]);
    expect(alignSelected(context, "x", "min")).toBe(false);
    context.selection.set([a, b]);
    expect(distributeSelected(context, "x")).toBe(false);
    expect(alignSelected(context, "x", "min")).toBe(true);
    expect(b.position.x).toBeCloseTo(0);
    expect(context.history.getState().undoLabel).toBe(`${b.name} 정렬`);
  });

  test("focusSelected: 선택이 없으면 false, 있으면 카메라를 옮긴다", () => {
    const context = setup();
    const camera = new ArcRotateCamera("cam", 0, 1, 10, Vector3.Zero(), scene);
    expect(focusSelected(context)).toBe(false);
    context.selection.set([box()]);
    expect(focusSelected(context)).toBe(true);
    expect(context.history.getState().undoLabel).toBeNull(); // 히스토리에 남지 않는다
    camera.dispose();
  });
});
