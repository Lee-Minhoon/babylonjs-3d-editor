"use client";

import { type ReactNode, useRef } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { NumberField } from "@base-ui/react/number-field";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import { useSelection } from "../hooks/use-editor-state";
import { useMeshName } from "../hooks/use-mesh-name";
import { useMeshTransforms } from "../hooks/use-mesh-transform";
import { getShortcutKey, handleFieldHistoryKey } from "../lib/editor-shortcuts";
import { createMacroCommand, type History, macroLabel } from "../lib/history";
import { MESH_NAME_INPUT_ID } from "../lib/mesh-name";
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
import type { EditorRuntime } from "./editor-viewport";
import { HistoryPanel } from "./history-panel";
import { MaterialSection } from "./material-section";
import { MeshNameInput } from "./mesh-name-input";
import { MeshIcon } from "./preset-icons";
import { SceneSettingsSection } from "./scene-settings-section";
import { ShapeSection, sharedShapePreset } from "./shape-section";
import { MIXED_LABEL } from "./value-fields";

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

function TransformSection({
  meshes,
  history,
}: {
  meshes: readonly AbstractMesh[];
  history: History;
}) {
  const values = useMeshTransforms(meshes);

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

type PropertiesPanelProps = {
  runtime: EditorRuntime | null;
};

function MeshNameLabel({ mesh }: { mesh: AbstractMesh }) {
  return <span className="truncate">{useMeshName(mesh)}</span>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** 여러 개 선택의 머리: 개수와 메쉬 목록 */
function MultiSelectionHeader({ meshes }: { meshes: readonly AbstractMesh[] }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">메쉬 {meshes.length}개 선택됨</div>
      <ul className="max-h-28 space-y-1 overflow-y-auto">
        {meshes.map((mesh) => (
          <li key={mesh.uniqueId} className="flex items-center gap-2">
            <MeshIcon mesh={mesh} className="size-3.5 text-muted-foreground" />
            <MeshNameLabel mesh={mesh} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 속성 패널: 메쉬를 고르면 변형 · 모양(같은 프리셋일 때) · 머티리얼 (여러 개면 함께 편집 — 값이 다른 칸은 "—"),
 * 선택이 없으면 씬 설정. 아래에는 히스토리 패널.
 */
export function PropertiesPanel({ runtime }: PropertiesPanelProps) {
  const selected = useSelection(runtime);
  const mesh = selected.length === 1 ? selected[0] : null;
  // key: 선택이 바뀌면 편집 중 상태(before)를 버린다
  const selectionKey = selected.map(({ uniqueId }) => uniqueId).join(",");
  // 모양 값은 고른 메쉬가 모두 같은 프리셋일 때만 (프리셋마다 항목이 다르다)
  const shapePreset = sharedShapePreset(selected);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-xs text-sidebar-foreground">
      <div className="flex h-12 items-center gap-2 px-3">
        <h2 className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
          속성
        </h2>
      </div>
      <Separator />
      {runtime && selected.length > 0 ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            {mesh ? (
              <div className="flex items-center gap-2">
                <MeshIcon
                  mesh={mesh}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <MeshNameInput
                  key={mesh.uniqueId}
                  id={MESH_NAME_INPUT_ID}
                  mesh={mesh}
                  history={runtime.history}
                  className="h-7 text-sm font-medium"
                />
              </div>
            ) : (
              <MultiSelectionHeader meshes={selected} />
            )}
            <TransformSection
              key={selectionKey}
              meshes={selected}
              history={runtime.history}
            />
            <p className="text-muted-foreground">
              축 이름(X/Y/Z)을 좌우로 드래그해 값을 조절할 수 있습니다.
              {!mesh &&
                ` 여러 개면 입력한 값이 모두에 들어갑니다 (값이 서로 다른 칸은 ${MIXED_LABEL}).`}
            </p>
            {shapePreset && (
              <>
                <Separator />
                <div>
                  <SectionTitle>모양</SectionTitle>
                  <ShapeSection
                    key={selectionKey}
                    preset={shapePreset}
                    meshes={selected}
                    history={runtime.history}
                  />
                </div>
              </>
            )}
            <Separator />
            <div>
              <SectionTitle>머티리얼</SectionTitle>
              <MaterialSection
                key={selectionKey}
                meshes={selected}
                history={runtime.history}
              />
            </div>
          </div>
        </ScrollArea>
      ) : runtime ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            <div>
              <SectionTitle>씬 설정</SectionTitle>
              <SceneSettingsSection
                scene={runtime.scene}
                history={runtime.history}
              />
            </div>
            <p className="text-muted-foreground">
              메쉬를 선택하면 위치·회전·크기와 머티리얼을 편집할 수 있습니다.
            </p>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1" />
      )}
      <HistoryPanel runtime={runtime} />
    </aside>
  );
}
