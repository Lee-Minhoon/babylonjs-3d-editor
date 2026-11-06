"use client";

import { useRef } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { NumberField } from "@base-ui/react/number-field";

import { useMeshTransforms } from "../hooks/use-mesh-transform";
import { getShortcutKey, handleFieldHistoryKey } from "../lib/editor-shortcuts";
import { createMacroCommand, type History, macroLabel } from "../lib/history";
import {
  applyTransform,
  captureTransform,
  createTransformCommand,
  isSameTransform,
  type TransformSnapshot,
} from "../lib/transform-command";
import {
  type Axis,
  setTransformAxis,
  TRANSFORM_KIND,
  type TransformField,
  type TransformValues,
} from "../lib/transform-values";
import { MIXED_LABEL } from "./value-fields";

/*
 * 속성 패널의 변형(위치·회전·크기) 입력. 다른 섹션(usePropertyEdit)과 달리 "축 하나를 모든 메쉬에 같은 값으로"
 * 넣는 편집이라 시작 전 스냅샷을 여기서 직접 들고 있다.
 */

const AXES = [
  { axis: 0, label: "X", color: "text-red-400" },
  { axis: 1, label: "Y", color: "text-green-400" },
  { axis: 2, label: "Z", color: "text-blue-400" },
] as const satisfies readonly { axis: Axis; label: string; color: string }[];

const FIELDS: {
  field: TransformField;
  label: string;
  step: number;
  smallStep: number;
  largeStep: number;
}[] = [
  {
    field: "position",
    label: "위치",
    step: 0.1,
    smallStep: 0.01,
    largeStep: 1,
  },
  {
    field: "rotation",
    label: "회전 (°)",
    step: 1,
    smallStep: 0.1,
    largeStep: 15,
  },
  { field: "scaling", label: "크기", step: 0.1, smallStep: 0.01, largeStep: 1 },
];

/** 표시 자릿수. 입력·스크럽 값도 이 자릿수로 반올림된다. */
const FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 3 };
const roundForDisplay = (n: number) => Math.round(n * 1000) / 1000;

/** 메쉬들의 한 축 값. 보이는 자릿수로 서로 다르면 null ("—") */
function sharedAxisValue(
  values: readonly TransformValues[],
  field: TransformField,
  axis: Axis,
): number | null {
  const first = roundForDisplay(values[0][field][axis]);
  return values.every((value) => roundForDisplay(value[field][axis]) === first)
    ? values[0][field][axis]
    : null;
}

type AxisFieldProps = {
  meshes: readonly AbstractMesh[];
  history: History;
  field: TransformField;
  axis: Axis;
  label: string;
  color: string;
  /** 메쉬마다 값이 다르면 null — "—"로 보이고, 값을 넣으면 모두 그 값이 된다 */
  value: number | null;
  steps: Pick<(typeof FIELDS)[number], "step" | "smallStep" | "largeStep">;
};

/**
 * 한 축 입력. 편집 중(타이핑·스크럽·화살표)에는 메쉬에 바로 적용해 미리보고,
 * 커밋(blur·Enter·스크럽 놓기) 시점에 편집 시작 전 상태와 비교해 Command 하나로 기록한다.
 * 여러 메쉬면 모두 그 축만 같은 값으로 바꾸고, 달라진 메쉬들을 Command 하나로 묶는다.
 * Esc는 편집 시작 전 값으로 되돌린다.
 */
function AxisField({
  meshes,
  history,
  field,
  axis,
  label,
  color,
  value,
  steps,
}: AxisFieldProps) {
  const before = useRef<Map<AbstractMesh, TransformSnapshot> | null>(null);
  /**
   * Esc로 취소 중. Base UI는 blur 때 입력창 글자를 다시 읽어 onValueChange·onValueCommitted를 부르므로,
   * 타이핑 직후 바로 Esc를 누르면(아직 onValueChange 전) 취소한 값이 그대로 커밋될 수 있다 → 그동안 무시한다.
   */
  const cancelling = useRef(false);

  const commit = () => {
    const started = before.current;
    before.current = null;
    if (!started) return;
    const kind = TRANSFORM_KIND[field];
    const commands = [...started].flatMap(([mesh, previous]) => {
      const after = captureTransform(mesh);
      return isSameTransform(previous, after)
        ? []
        : [createTransformCommand(mesh, kind, previous, after)];
    });
    if (commands.length > 0) {
      history.execute(createMacroCommand(macroLabel(commands, kind), commands));
    }
  };

  /** 편집 취소: 시작 전 상태로 되돌리고 기록하지 않는다 */
  const revert = () => {
    if (!before.current) return;
    for (const [mesh, previous] of before.current) {
      applyTransform(mesh, previous);
    }
    before.current = null;
  };

  /**
   * 취소는 반드시 blur까지 한다 (Esc·⌘Z 공통). Base UI는 타이핑한 글자를 value prop과 동기화하지 않고
   * 들고 있다가 blur 때 다시 파싱하므로, 되돌리기만 하고 포커스를 두면 다음 blur에서 취소한 값이 다시 적용된다.
   */
  const cancelEdit = (input: HTMLInputElement) => {
    cancelling.current = true;
    revert();
    input.blur();
    // blur가 커밋을 부르지 않은 경우(값 변화 없음)에도 다음 편집에 남지 않게
    cancelling.current = false;
  };

  return (
    <NumberField.Root
      value={value}
      format={FORMAT}
      locale="en-US"
      {...steps}
      onValueChange={(next) => {
        if (cancelling.current) return;
        if (next === null || !Number.isFinite(next)) return;
        before.current ??= new Map(
          meshes.map((mesh) => [mesh, captureTransform(mesh)]),
        );
        for (const mesh of meshes) setTransformAxis(mesh, field, axis, next);
      }}
      onValueCommitted={() => {
        if (cancelling.current) {
          cancelling.current = false;
          revert();
        } else {
          commit();
        }
      }}
      className="min-w-0"
    >
      <NumberField.Group className="flex h-7 items-center rounded-md border border-input bg-input/20 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30">
        <NumberField.ScrubArea
          className={`flex h-full cursor-ew-resize items-center pl-1.5 text-[0.625rem] font-semibold select-none ${color}`}
          pixelSensitivity={2}
        >
          {label}
        </NumberField.ScrubArea>
        <NumberField.Input
          aria-label={`${label} ${field}`}
          placeholder={MIXED_LABEL}
          className="h-full w-full min-w-0 bg-transparent px-1.5 text-right text-xs tabular-nums outline-none placeholder:text-muted-foreground"
          onKeyDown={(event) => {
            const key = getShortcutKey(event);

            // Enter: blur → onValueCommitted (Base UI는 Enter만으로는 커밋하지 않는다)
            if (key === "enter") {
              event.currentTarget.blur();
            } else if (key === "escape") {
              cancelEdit(event.currentTarget);
            } else {
              const input = event.currentTarget;
              handleFieldHistoryKey(event, history, () => {
                if (!before.current) return false;
                cancelEdit(input);
                return true;
              });
            }
          }}
        />
      </NumberField.Group>
    </NumberField.Root>
  );
}

/** 위치·회전·크기 — 여러 메쉬면 같은 값만 보이고("—"는 다름), 입력하면 모두 그 값이 된다 */
export function TransformSection({
  meshes,
  history,
  withScaling,
}: {
  meshes: readonly AbstractMesh[];
  history: History;
  /** 조명만 골랐으면 크기 칸을 숨긴다 (조명은 크기가 없다) */
  withScaling: boolean;
}) {
  const values = useMeshTransforms(meshes);
  const fields = withScaling
    ? FIELDS
    : FIELDS.filter(({ field }) => field !== "scaling");

  return (
    <div className="space-y-3">
      {fields.map(({ field, label, ...steps }) => (
        <div key={field}>
          <div className="mb-1.5 text-[0.6875rem] text-muted-foreground">
            {label}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {AXES.map(({ axis, label: axisLabel, color }) => (
              <AxisField
                key={axis}
                meshes={meshes}
                history={history}
                field={field}
                axis={axis}
                label={axisLabel}
                color={color}
                value={sharedAxisValue(values, field, axis)}
                steps={steps}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
