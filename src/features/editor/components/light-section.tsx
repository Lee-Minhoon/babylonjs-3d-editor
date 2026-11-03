"use client";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { Switch } from "@/components/ui/switch";

import { useLightValues } from "../hooks/use-light-values";
import { usePreviewEdit } from "../hooks/use-preview-edit";
import {
  applyLightValues,
  createLightCommand,
  getLightKind,
  getLightValues,
  isSameLight,
  LIGHT_FIELDS,
  LIGHT_RANGES,
  type LightValues,
} from "../lib/editor-lights";
import { handleFieldHistoryKey, isTypingTarget } from "../lib/editor-shortcuts";
import { createMacroCommand, type History, macroLabel } from "../lib/history";
import type { LightKind } from "../lib/mesh-presets";
import {
  ColorField,
  MIXED_LABEL,
  sharedValue,
  SliderField,
} from "./value-fields";

/**
 * 조명 편집 (색·세기·범위·각도·그림자). lights는 고른 것 중 조명 객체만.
 * 머티리얼과 같은 원칙 — 미리보기 후 커밋에서 Command 하나, 여러 개면 바꾼 항목만 모두에.
 * 범위는 점광원·스포트가, 각도는 스포트가 섞여 있을 때만 보인다.
 */
export function LightSection({
  lights,
  history,
}: {
  lights: readonly AbstractMesh[];
  history: History;
}) {
  const values = useLightValues(lights);
  const { preview, commit, cancel } = usePreviewEdit({
    targets: lights,
    get: getLightValues,
    apply: applyLightValues,
    isSame: isSameLight,
    record: (changes) => {
      const commands = changes.map(({ target, before, after }) =>
        createLightCommand(target, before, after),
      );
      history.execute(
        createMacroCommand(macroLabel(commands, "조명"), commands),
      );
    },
  });

  if (values.length === 0) return null;
  const kinds = new Set(
    lights.flatMap((mesh) => getLightKind(mesh) ?? []),
  ) as Set<LightKind>;
  const shows = (field: "range" | "angle") =>
    [...kinds].some((kind) => LIGHT_FIELDS[kind].includes(field));
  // 세기 슬라이더는 고른 종류 중 가장 큰 범위로 (방향광 10, 점광원·스포트 100)
  const intensityMax = Math.max(
    ...[...kinds].map((kind) => LIGHT_RANGES.intensity.max[kind]),
  );
  const field = <K extends keyof LightValues>(key: K) =>
    sharedValue(values, (light) => light[key]);
  const shadows = field("shadows");

  return (
    <div
      className="space-y-3"
      // 입력창·슬라이더는 editor-shortcuts가 건너뛰므로 undo/redo를 여기서 처리한다 (스위치는 editor-shortcuts 몫)
      onKeyDown={(event) => {
        if (isTypingTarget(event.target)) {
          handleFieldHistoryKey(event, history, cancel);
        }
      }}
    >
      <ColorField
        label="빛 색"
        {...field("color")}
        history={history}
        onPreview={(color) => preview({ color })}
        onCommit={commit}
        onCancel={cancel}
      />
      <SliderField
        label="세기"
        {...field("intensity")}
        min={LIGHT_RANGES.intensity.min}
        max={intensityMax}
        step={LIGHT_RANGES.intensity.step}
        digits={1}
        onPreview={(intensity) => preview({ intensity })}
        onCommit={commit}
      />
      {shows("range") && (
        <SliderField
          label="범위"
          {...field("range")}
          {...LIGHT_RANGES.range}
          digits={1}
          onPreview={(range) => preview({ range })}
          onCommit={commit}
        />
      )}
      {shows("angle") && (
        <SliderField
          label="각도 (°)"
          {...field("angle")}
          {...LIGHT_RANGES.angle}
          digits={0}
          onPreview={(angle) => preview({ angle })}
          onCommit={commit}
        />
      )}
      <label className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
        <span>
          그림자
          {shadows.mixed && <span className="ml-1.5">{MIXED_LABEL}</span>}
        </span>
        <Switch
          size="sm"
          checked={shadows.value && !shadows.mixed}
          onCheckedChange={(next) => {
            preview({ shadows: next });
            commit();
          }}
        />
      </label>
    </div>
  );
}
