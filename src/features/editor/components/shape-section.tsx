"use client";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { usePropertyValues } from "../hooks/use-property";
import { usePropertyEdit } from "../hooks/use-property-edit";
import { handleFieldHistoryKey, isTypingTarget } from "../lib/editor-shortcuts";
import type { History } from "../lib/history";
import { findPreset, getPresetId, type MeshPreset } from "../lib/mesh-presets";
import { shapeProperty } from "../lib/mesh-shape";
import { sharedValue, SliderField } from "./value-fields";

/** 고른 메쉬들이 모두 같은 프리셋이고 그 프리셋에 모양 값이 있으면 그 프리셋 */
export function sharedShapePreset(
  meshes: readonly AbstractMesh[],
): MeshPreset | null {
  const ids = new Set(meshes.map(getPresetId));
  const [id] = ids;
  if (ids.size !== 1 || !id) return null;
  const preset = findPreset(id);
  return preset && preset.params.length > 0 ? preset : null;
}

/**
 * 모양 파라미터 편집 (원기둥 위·아래 지름, 분할 수 …). 슬라이더를 끄는 중엔 정점을 바로 다시 만들어 미리보고,
 * 놓을 때 Command 하나. 여러 메쉬면 같은 프리셋일 때만 보이고, 바꾼 값만 모두에 넣는다.
 */
export function ShapeSection({
  preset,
  meshes,
  history,
}: {
  preset: MeshPreset;
  meshes: readonly AbstractMesh[];
  history: History;
}) {
  const shapes = usePropertyValues(shapeProperty, meshes);
  const { preview, commit, cancel } = usePropertyEdit(
    shapeProperty,
    meshes,
    history,
  );

  if (shapes.length === 0) return null;

  return (
    <div
      className="space-y-3"
      // 슬라이더는 editor-shortcuts가 건너뛰므로 undo/redo를 여기서 처리한다
      onKeyDown={(event) => {
        if (isTypingTarget(event.target)) {
          handleFieldHistoryKey(event, history, cancel);
        }
      }}
    >
      {preset.params.map((param) => (
        <SliderField
          key={param.key}
          label={param.label}
          {...sharedValue(shapes, (shape) => shape[param.key] ?? param.default)}
          min={param.min}
          max={param.max}
          step={param.step}
          digits={param.integer ? 0 : 2}
          onPreview={(value) => preview({ [param.key]: value })}
          onCommit={commit}
        />
      ))}
    </div>
  );
}
