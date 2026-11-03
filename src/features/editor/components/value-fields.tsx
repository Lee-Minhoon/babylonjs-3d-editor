"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

import { handleFieldHistoryKey } from "../lib/editor-shortcuts";
import type { History } from "../lib/history";

/*
 * 속성 패널의 값 입력 (머티리얼·씬 설정 공통). 미리보기·커밋은 부모의 usePreviewEdit가 맡고,
 * 여기는 입력 방식별로 언제 미리보고 언제 커밋하는지만 정한다.
 * mixed: 여러 메쉬의 값이 서로 다르다 → "—"로 보이고, 값을 넣으면 모두 그 값이 된다.
 */

/** 여러 메쉬의 값이 다를 때 보이는 글자 */
export const MIXED_LABEL = "—";

/** "#abc123" / "abc123" → "#ABC123". 잘못된 값이면 null */
function normalizeHex(text: string): string | null {
  const hex = text.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
}

const firstValue = (value: number | readonly number[]) =>
  Array.isArray(value) ? (value[0] as number) : (value as number);

export function FieldLabel({
  children,
  value,
}: {
  children: ReactNode;
  value?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between text-[0.6875rem] text-muted-foreground">
      <span>{children}</span>
      {value !== undefined && (
        <span className="text-foreground tabular-nums">{value}</span>
      )}
    </div>
  );
}

/**
 * 색 고르기 창 + hex 입력. 창에서 고르는 중엔 미리보기, 창을 닫거나 hex를 Enter/blur 하면 커밋.
 * hex 칸의 Esc는 입력 중인 글자를 버린다.
 */
export function ColorField({
  label,
  value,
  mixed = false,
  history,
  disabled,
  onPreview,
  onCommit,
  onCancel,
}: {
  label: string;
  /** 색 고르기 창에 보일 값 (mixed면 첫 메쉬의 값) */
  value: string;
  mixed?: boolean;
  history: History;
  disabled?: boolean;
  onPreview: (color: string) => void;
  onCommit: () => void;
  /** 미리보기 중이면 취소하고 true */
  onCancel: () => boolean;
}) {
  const colorInput = useRef<HTMLInputElement>(null);

  // <input type="color">: React onChange는 고르는 중(input 이벤트)마다 오고,
  // 네이티브 change는 색상 창을 닫아 값이 확정될 때 온다 → 그때 커밋
  useEffect(() => {
    const input = colorInput.current;
    if (!input) return;
    input.addEventListener("change", onCommit);
    return () => input.removeEventListener("change", onCommit);
  });

  const shown = mixed ? "" : value.toUpperCase();

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-1.5">
        <Input
          ref={colorInput}
          type="color"
          aria-label={`${label} 선택`}
          className="h-7 w-9 shrink-0 cursor-pointer p-0.5"
          disabled={disabled}
          value={value.toLowerCase()}
          onChange={(event) => onPreview(event.target.value)}
        />
        {/* key: 값이 밖에서 바뀌면(undo·색상 창) 입력 중이던 텍스트를 버리고 새 값을 보인다 */}
        <Input
          key={mixed ? MIXED_LABEL : value}
          aria-label={`${label} hex`}
          className="font-mono uppercase tabular-nums"
          disabled={disabled}
          defaultValue={shown}
          placeholder={MIXED_LABEL}
          spellCheck={false}
          onKeyDown={(event) => {
            const input = event.currentTarget;
            if (event.key === "Enter") input.blur();
            else if (event.key === "Escape") {
              input.value = shown;
              input.blur();
            } else if (
              // 입력 중인 글자가 있으면 ⌘Z는 그 글자만 되돌린다 (히스토리 undo가 아니라)
              handleFieldHistoryKey(event, history, () => {
                if (
                  (normalizeHex(input.value) ?? input.value.trim()) !== shown
                ) {
                  input.value = shown;
                  return true;
                }
                return onCancel();
              })
            ) {
              event.stopPropagation(); // 바깥 onKeyDown이 한 번 더 undo 하지 않게
            }
          }}
          onBlur={(event) => {
            const color = normalizeHex(event.currentTarget.value);
            if (!color) {
              event.currentTarget.value = shown;
              return;
            }
            onPreview(color);
            onCommit();
          }}
        />
      </div>
    </div>
  );
}

/** 0~1 같은 범위 값. 끄는 중엔 미리보기, 놓으면 커밋 */
export function SliderField({
  label,
  value,
  mixed = false,
  min = 0,
  max = 1,
  step = 0.01,
  disabled,
  onPreview,
  onCommit,
}: {
  label: string;
  /** 슬라이더 위치 (mixed면 첫 메쉬의 값) */
  value: number;
  mixed?: boolean;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onPreview: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <div>
      <FieldLabel value={mixed ? MIXED_LABEL : value.toFixed(2)}>
        {label}
      </FieldLabel>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        // 배열로 넘긴다 — 숫자 하나를 넘기면 shadcn Slider가 thumb을 두 개 그린다
        value={[value]}
        onValueChange={(next) => onPreview(firstValue(next))}
        onValueCommitted={onCommit}
      />
    </div>
  );
}

/** 여러 값 중 첫 값과, 서로 다른 값이 섞였는지 (색은 대소문자 무시) */
export function sharedValue<T, V>(
  items: readonly T[],
  read: (item: T) => V,
): { value: V; mixed: boolean } {
  const normalize = (value: V) =>
    typeof value === "string" ? value.toLowerCase() : value;
  const value = read(items[0]);
  const mixed = items.some(
    (item) => normalize(read(item)) !== normalize(value),
  );
  return { value, mixed };
}
