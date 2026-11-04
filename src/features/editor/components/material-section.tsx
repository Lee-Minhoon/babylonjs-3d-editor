"use client";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { Switch } from "@/components/ui/switch";

import { usePropertyValues } from "../hooks/use-property";
import { usePropertyEdit } from "../hooks/use-property-edit";
import { handleFieldHistoryKey, isTypingTarget } from "../lib/editor-shortcuts";
import type { History } from "../lib/history";
import { materialProperty, type MaterialValues } from "../lib/mesh-material";
import {
  ColorField,
  MIXED_LABEL,
  sharedValue,
  SliderField,
} from "./value-fields";

/**
 * 머티리얼 편집 (PBR 기본색·메탈릭·거칠기·발광색·불투명도·조명 무시). 여러 메쉬면 함께 편집한다.
 * 속성 패널 숫자 입력과 같은 원칙: 색을 고르는 중·슬라이더를 끄는 중에는 메쉬에 바로 적용(미리보기)하고,
 * 커밋(색상 창 닫기·슬라이더 놓기·hex Enter·스위치)에서 편집 시작 전 값과 비교해 Command 하나로 기록한다.
 * 여러 메쉬면 바꾼 항목만 모두에 넣고(나머지는 각자 값 유지), 달라진 메쉬들을 Command 하나로 묶는다.
 * 값이 서로 다른 항목은 "—"로 보인다.
 */
export function MaterialSection({
  meshes,
  history,
}: {
  meshes: readonly AbstractMesh[];
  history: History;
}) {
  const materials = usePropertyValues(materialProperty, meshes);
  const { preview, commit, cancel } = usePropertyEdit(
    materialProperty,
    meshes,
    history,
  );

  if (materials.length === 0) return null;
  const field = <K extends keyof MaterialValues>(key: K) =>
    sharedValue(materials, (values) => values[key]);
  const color = field("color");
  const emissive = field("emissive");
  const unlit = field("unlit");
  // 조명 무시면 메탈릭·거칠기는 쓰이지 않는다 (기본색·발광색·불투명도만)
  const lit = !unlit.value && !unlit.mixed;

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
        {...color}
        history={history}
        onPreview={(next) => preview({ color: next })}
        onCommit={commit}
        onCancel={cancel}
      />
      {(["metallic", "roughness"] as const).map((key) => (
        <SliderField
          key={key}
          label={key === "metallic" ? "메탈릭" : "거칠기"}
          {...field(key)}
          disabled={!lit}
          onPreview={(value) => preview({ [key]: value })}
          onCommit={commit}
        />
      ))}
      <ColorField
        label="발광색"
        {...emissive}
        history={history}
        onPreview={(next) => preview({ emissive: next })}
        onCommit={commit}
        onCancel={cancel}
      />
      <SliderField
        label="불투명도"
        {...field("alpha")}
        onPreview={(alpha) => preview({ alpha })}
        onCommit={commit}
      />
      <label className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
        <span>
          조명 무시
          {unlit.mixed && <span className="ml-1.5">{MIXED_LABEL}</span>}
        </span>
        <Switch
          size="sm"
          checked={unlit.value && !unlit.mixed}
          onCheckedChange={(next) => {
            preview({ unlit: next });
            commit();
          }}
        />
      </label>
    </div>
  );
}
