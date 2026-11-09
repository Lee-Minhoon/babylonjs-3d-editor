"use client";

import { usePerformanceState } from "../hooks/use-editor-state";
import type { EditorRuntime } from "../lib/editor-runtime";

const number = new Intl.NumberFormat("ko-KR");

/** 뷰포트 왼쪽 아래의 성능 표시 (보기 메뉴로 켜고 끈다) */
export function PerformanceOverlay({ runtime }: { runtime: EditorRuntime }) {
  const { visible, stats } = usePerformanceState(runtime);
  if (!visible) return null;
  const rows: [string, string][] = stats
    ? [
        ["FPS", `${stats.fps} (${stats.frameMs}ms)`],
        ["그리기 호출", number.format(stats.drawCalls)],
        ["객체", number.format(stats.objects)],
        ["삼각형", number.format(stats.triangles)],
      ]
    : [["FPS", "재는 중…"]];

  return (
    <dl
      aria-label="성능"
      className="pointer-events-none absolute bottom-3 left-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-md bg-background/80 px-2.5 py-1.5 font-mono text-[0.6875rem] text-muted-foreground tabular-nums"
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd className="text-right text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
