"use client";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { Switch } from "@/components/ui/switch";

import { usePropertyValues } from "../hooks/use-property";
import { usePropertyEdit } from "../hooks/use-property-edit";
import {
  getLightKind,
  LIGHT_FIELDS,
  LIGHT_RANGES,
  lightProperty,
  type LightValues,
} from "../lib/editor-lights";
import type { History } from "../lib/history";
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
  const values = usePropertyValues(lightProperty, lights);
  const { preview, commit, cancel, onKeyDown } = usePropertyEdit(
    lightProperty,
    lights,
    history,
  );

  if (values.length === 0) return null;
  const kinds = new Set(lights.flatMap((mesh) => getLightKind(mesh) ?? []));
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
    <div className="space-y-3" onKeyDown={onKeyDown}>
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
