import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";

import { createMeshProperty } from "./editable-property";
import {
  findPreset,
  getPresetId,
  getShapeParams,
  recordShapeParams,
  type ShapeParams,
  shapeParamsOf,
} from "./mesh-presets";

/*
 * 프리셋 모양 파라미터 바꾸기 (원기둥 위·아래 지름, 분할 수 …).
 * 메쉬를 새로 만들지 않고 같은 메쉬의 정점 데이터만 바꾼다 — 선택·이름·머티리얼·변형·그 메쉬를 가리키는
 * Command가 모두 그대로 이어진다. 값을 바꾸는 곳(미리보기·Command)은 모두 applyShapeParams를 거치고
 * 패널은 onShapeChange로 구독한다 (editable-property — 머티리얼과 같은 틀).
 */

/** 메쉬의 모양 속성 (get은 에디터 메쉬가 아니면 null). 편집 한 번(슬라이더 놓기) = Command 하나 */
export const shapeProperty = createMeshProperty<ShapeParams>({
  verb: "모양",
  read: getShapeParams,
  write(mesh, shape) {
    const presetId = getPresetId(mesh);
    const preset = presetId && findPreset(presetId);
    if (!preset) return;
    const params = shapeParamsOf(preset, shape);
    const scene = mesh.getScene();
    // 같은 빌더로 임시 메쉬를 만들어 정점만 옮겨 온다
    const temp = preset.create("__shape", scene, params);
    VertexData.ExtractFromMesh(temp).applyToMesh(mesh as Mesh);
    temp.dispose();
    mesh.refreshBoundingInfo({});
    recordShapeParams(mesh, params);
  },
  isSame(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => a[key] === b[key]);
  },
});

export const {
  apply: applyShapeParams,
  onChange: onShapeChange,
  isSame: isSameShape,
  createCommand: createShapeCommand,
} = shapeProperty;
