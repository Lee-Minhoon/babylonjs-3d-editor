"use client";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { Switch } from "@/components/ui/switch";

import { useMeshMaterial } from "../hooks/use-mesh-material";
import { usePreviewEdit } from "../hooks/use-preview-edit";
import { handleFieldHistoryKey, isTypingTarget } from "../lib/editor-shortcuts";
import type { History } from "../lib/history";
import {
  applyMaterialValues,
  createMaterialCommand,
  getMaterialValues,
  isSameMaterial,
} from "../lib/mesh-material";
import { ColorField, SliderField } from "./value-fields";

/**
 * 머티리얼 편집 (PBR 기본색·메탈릭·거칠기·발광색·불투명도·조명 무시).
 * 속성 패널 숫자 입력과 같은 원칙: 색을 고르는 중·슬라이더를 끄는 중에는 메쉬에 바로 적용(미리보기)하고,
 * 커밋(색상 창 닫기·슬라이더 놓기·hex Enter·스위치)에서 편집 시작 전 값과 비교해 Command 하나로 기록한다.
 */
export function MaterialSection({
  mesh,
  history,
}: {
  mesh: AbstractMesh;
  history: History;
}) {
  const values = useMeshMaterial(mesh);
  const { preview, commit, cancel } = usePreviewEdit({
    get: () => getMaterialValues(mesh),
    apply: (next) => applyMaterialValues(mesh, next),
    isSame: isSameMaterial,
    record: (before, after) =>
      history.execute(createMaterialCommand(mesh, before, after)),
  });

  if (!values) return null;
  // 조명 무시면 메탈릭·거칠기는 쓰이지 않는다 (기본색·발광색·불투명도만)
  const lit = !values.unlit;

  return (
    <div
      className="space-y-3"
      // 입력창·슬라이더에 포커스가 있으면 editor-shortcuts가 건너뛰므로 undo/redo를 여기서 처리한다.
      // 편집 중이면 먼저 그 편집만 취소한다. (스위치 같은 버튼은 editor-shortcuts가 처리 — 두 번 undo 하지 않게)
      onKeyDown={(event) => {
        if (isTypingTarget(event.target)) {
          handleFieldHistoryKey(event, history, cancel);
        }
      }}
    >
      <ColorField
        label="기본색"
        value={values.color}
        history={history}
        onPreview={(color) => preview({ color })}
        onCommit={commit}
        onCancel={cancel}
      />
      <SliderField
        label="메탈릭"
        value={values.metallic}
        disabled={!lit}
        onPreview={(metallic) => preview({ metallic })}
        onCommit={commit}
      />
      <SliderField
        label="거칠기"
        value={values.roughness}
        disabled={!lit}
        onPreview={(roughness) => preview({ roughness })}
        onCommit={commit}
      />
      <ColorField
        label="발광색"
        value={values.emissive}
        history={history}
        onPreview={(emissive) => preview({ emissive })}
        onCommit={commit}
        onCancel={cancel}
      />
      <SliderField
        label="불투명도"
        value={values.alpha}
        onPreview={(alpha) => preview({ alpha })}
        onCommit={commit}
      />
      <label className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
        조명 무시
        <Switch
          size="sm"
          checked={values.unlit}
          onCheckedChange={(unlit) => {
            preview({ unlit });
            commit();
          }}
        />
      </label>
    </div>
  );
}
