"use client";

import { useRef } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { NumberField } from "@base-ui/react/number-field";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { useSelectedMesh } from "../hooks/use-editor-state";
import { useMeshTransform } from "../hooks/use-mesh-transform";
import { getShortcutKey } from "../lib/editor-shortcuts";
import type { History } from "../lib/history";
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
} from "../lib/transform-values";
import type { EditorRuntime } from "./editor-viewport";
import { MaterialSection } from "./material-section";
import { MeshIcon } from "./preset-icons";

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

type AxisFieldProps = {
  mesh: AbstractMesh;
  history: History;
  field: TransformField;
  axis: Axis;
  label: string;
  color: string;
  value: number;
  steps: Pick<(typeof FIELDS)[number], "step" | "smallStep" | "largeStep">;
};

/**
 * 한 축 입력. 편집 중(타이핑·스크럽·화살표)에는 메쉬에 바로 적용해 미리보고,
 * 커밋(blur·Enter·스크럽 놓기) 시점에 편집 시작 전 상태와 비교해 Command 하나로 기록한다.
 * Esc는 편집 시작 전 값으로 되돌린다.
 */
function AxisField({
  mesh,
  history,
  field,
  axis,
  label,
  color,
  value,
  steps,
}: AxisFieldProps) {
  const before = useRef<TransformSnapshot | null>(null);
  /**
   * Esc로 취소 중. Base UI는 blur 때 입력창 글자를 다시 읽어 onValueChange·onValueCommitted를 부르므로,
   * 타이핑 직후 바로 Esc를 누르면(아직 onValueChange 전) 취소한 값이 그대로 커밋될 수 있다 → 그동안 무시한다.
   */
  const cancelling = useRef(false);

  const commit = () => {
    if (!before.current) return;
    const after = captureTransform(mesh);
    if (!isSameTransform(before.current, after)) {
      history.execute(
        createTransformCommand(
          mesh,
          TRANSFORM_KIND[field],
          before.current,
          after,
        ),
      );
    }
    before.current = null;
  };

  /** 편집 취소: 시작 전 상태로 되돌리고 기록하지 않는다 */
  const revert = () => {
    if (!before.current) return;
    applyTransform(mesh, before.current);
    before.current = null;
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
        before.current ??= captureTransform(mesh);
        setTransformAxis(mesh, field, axis, next);
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
          className="h-full w-full min-w-0 bg-transparent px-1.5 text-right text-xs tabular-nums outline-none"
          onKeyDown={(event) => {
            const key = getShortcutKey(event);
            const mod = event.metaKey || event.ctrlKey;

            // Enter: blur → onValueCommitted (Base UI는 Enter만으로는 커밋하지 않는다)
            if (key === "enter") {
              event.currentTarget.blur();
            } else if (key === "escape") {
              cancelling.current = true;
              revert();
              event.currentTarget.blur();
              // blur가 커밋을 부르지 않은 경우(값 변화 없음)에도 다음 편집에 남지 않게
              cancelling.current = false;
            } else if (mod && (key === "z" || key === "y")) {
              // 입력창 포커스 중에도 에디터 undo/redo가 동작해야 한다 (editor-shortcuts는 입력창을 건너뜀).
              // 편집 중이면 먼저 그 편집만 취소한다.
              event.preventDefault();
              if (before.current) revert();
              else if (key === "y" || event.shiftKey) history.redo();
              else history.undo();
            }
          }}
        />
      </NumberField.Group>
    </NumberField.Root>
  );
}

function TransformSection({
  mesh,
  history,
}: {
  mesh: AbstractMesh;
  history: History;
}) {
  const values = useMeshTransform(mesh);

  return (
    <div className="space-y-3">
      {FIELDS.map(({ field, label, ...steps }) => (
        <div key={field}>
          <div className="mb-1.5 text-[0.6875rem] text-muted-foreground">
            {label}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {AXES.map(({ axis, label: axisLabel, color }) => (
              <AxisField
                key={axis}
                mesh={mesh}
                history={history}
                field={field}
                axis={axis}
                label={axisLabel}
                color={color}
                value={values[field][axis]}
                steps={steps}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type PropertiesPanelProps = {
  runtime: EditorRuntime | null;
};

/** 선택된 메쉬의 속성 패널 (변형 · 머티리얼) */
export function PropertiesPanel({ runtime }: PropertiesPanelProps) {
  const mesh = useSelectedMesh(runtime);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-xs text-sidebar-foreground">
      <div className="flex h-12 items-center gap-2 px-3">
        <h2 className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
          속성
        </h2>
      </div>
      <Separator />
      {mesh && runtime ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            <div className="flex items-center gap-2">
              <MeshIcon mesh={mesh} className="size-4 text-muted-foreground" />
              <span className="truncate text-sm font-medium">{mesh.name}</span>
            </div>
            {/* key: 다른 메쉬를 선택하면 편집 중 상태(before)를 버린다 */}
            <TransformSection
              key={mesh.uniqueId}
              mesh={mesh}
              history={runtime.history}
            />
            <p className="text-muted-foreground">
              축 이름(X/Y/Z)을 좌우로 드래그해 값을 조절할 수 있습니다.
            </p>
            <Separator />
            <div>
              <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
                머티리얼
              </h3>
              <MaterialSection
                key={mesh.uniqueId}
                mesh={mesh}
                history={runtime.history}
              />
            </div>
          </div>
        </ScrollArea>
      ) : (
        <p className="p-3 text-muted-foreground">
          메쉬를 선택하면 위치·회전·크기와 머티리얼을 편집할 수 있습니다.
        </p>
      )}
    </aside>
  );
}
