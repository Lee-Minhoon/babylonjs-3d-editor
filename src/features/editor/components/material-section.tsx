"use client";

import { useEffect, useRef } from "react";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

import { useMeshMaterial } from "../hooks/use-mesh-material";
import { getShortcutKey } from "../lib/editor-shortcuts";
import type { History } from "../lib/history";
import {
  applyMaterialValues,
  createMaterialCommand,
  getMaterialValues,
  isSameMaterial,
  type MaterialValues,
} from "../lib/mesh-material";

const SLIDERS = [
  { key: "metallic", label: "메탈릭" },
  { key: "roughness", label: "거칠기" },
] as const satisfies readonly {
  key: keyof MaterialValues;
  label: string;
}[];

/** "#abc123" / "abc123" → "#ABC123". 잘못된 값이면 null */
function normalizeHex(text: string): string | null {
  const hex = text.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
}

const firstValue = (value: number | readonly number[]) =>
  Array.isArray(value) ? (value[0] as number) : (value as number);

/**
 * 머티리얼 편집 (PBR 기본색·메탈릭·거칠기).
 * 속성 패널 숫자 입력과 같은 원칙: 색을 고르는 중·슬라이더를 끄는 중에는 메쉬에 바로 적용(미리보기)하고,
 * 커밋(색상 창 닫기·슬라이더 놓기·hex Enter)에서 편집 시작 전 값과 비교해 Command 하나로 기록한다.
 */
export function MaterialSection({
  mesh,
  history,
}: {
  mesh: AbstractMesh;
  history: History;
}) {
  const values = useMeshMaterial(mesh);
  const before = useRef<MaterialValues | null>(null);
  const colorInput = useRef<HTMLInputElement>(null);

  const preview = (next: Partial<MaterialValues>) => {
    const current = getMaterialValues(mesh);
    if (!current) return;
    before.current ??= current;
    applyMaterialValues(mesh, { ...current, ...next });
  };

  const commit = () => {
    const after = getMaterialValues(mesh);
    if (before.current && after && !isSameMaterial(before.current, after)) {
      history.execute(createMaterialCommand(mesh, before.current, after));
    }
    before.current = null;
  };

  const revert = () => {
    if (!before.current) return;
    applyMaterialValues(mesh, before.current);
    before.current = null;
  };

  // <input type="color">: React onChange는 고르는 중(input 이벤트)마다 오고,
  // 네이티브 change는 색상 창을 닫아 값이 확정될 때 온다 → 그때 커밋
  useEffect(() => {
    const input = colorInput.current;
    if (!input) return;
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  });

  if (!values) return null;

  return (
    <div
      className="space-y-3"
      // 입력창·슬라이더에 포커스가 있으면 editor-shortcuts가 건너뛰므로 undo/redo를 여기서 처리한다.
      // 편집 중이면 먼저 그 편집만 취소한다.
      onKeyDown={(event) => {
        const key = getShortcutKey(event);
        if (!(event.metaKey || event.ctrlKey) || (key !== "z" && key !== "y")) {
          return;
        }
        event.preventDefault();
        if (before.current) revert();
        else if (key === "y" || event.shiftKey) history.redo();
        else history.undo();
      }}
    >
      <div>
        <div className="mb-1.5 text-[0.6875rem] text-muted-foreground">
          기본색
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            ref={colorInput}
            type="color"
            aria-label="기본색 선택"
            className="h-7 w-9 shrink-0 cursor-pointer p-0.5"
            value={values.color.toLowerCase()}
            onChange={(event) => preview({ color: event.target.value })}
          />
          {/* key: 값이 밖에서 바뀌면(undo·색상 창) 입력 중이던 텍스트를 버리고 새 값을 보인다 */}
          <Input
            key={values.color}
            aria-label="기본색 hex"
            className="font-mono uppercase tabular-nums"
            defaultValue={values.color.toUpperCase()}
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              else if (event.key === "Escape") {
                event.currentTarget.value = values.color.toUpperCase();
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              const color = normalizeHex(event.currentTarget.value);
              if (!color) {
                event.currentTarget.value = values.color.toUpperCase();
                return;
              }
              preview({ color });
              commit();
            }}
          />
        </div>
      </div>

      {SLIDERS.map(({ key, label }) => (
        <div key={key}>
          <div className="mb-2 flex items-center justify-between text-[0.6875rem] text-muted-foreground">
            <span>{label}</span>
            <span className="text-foreground tabular-nums">
              {values[key].toFixed(2)}
            </span>
          </div>
          <Slider
            aria-label={label}
            min={0}
            max={1}
            step={0.01}
            // 배열로 넘긴다 — 숫자 하나를 넘기면 shadcn Slider가 thumb을 두 개 그린다
            value={[values[key]]}
            onValueChange={(value) => preview({ [key]: firstValue(value) })}
            onValueCommitted={commit}
          />
        </div>
      ))}
    </div>
  );
}
