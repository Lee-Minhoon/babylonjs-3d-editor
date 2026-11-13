import { Kbd, KbdGroup } from "@/components/ui/kbd";

import { MOUSE_CONTROLS } from "../lib/camera-controls";
import { SHORTCUT_GROUPS } from "../lib/editor-reference";
import { getToolShortcut } from "../lib/editor-shortcuts";

/*
 * 단축키 목록과 마우스 조작표. 도움말 창(?)과 사용 설명서(/manual)가 같은 것을 보여준다.
 */

export function ShortcutGroups({ className = "" }: { className?: string }) {
  return (
    <div className={`grid gap-x-8 gap-y-5 sm:grid-cols-2 ${className}`}>
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} aria-label={`${group.title} 단축키`}>
          <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">
            {group.title}
          </h3>
          <dl className="space-y-1">
            {group.items.map((item) => (
              <div
                key={item.action}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <dt className="min-w-0">
                  {item.action}
                  {item.note && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {item.note}
                    </span>
                  )}
                </dt>
                <dd className="shrink-0">
                  <KbdGroup>
                    {item.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </KbdGroup>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function MouseControlsTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">마우스 조작</caption>
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-1.5 pr-4 font-medium">
              입력
            </th>
            <th scope="col" className="py-1.5 pr-4 font-medium">
              선택 도구 ({getToolShortcut("select")})
            </th>
            <th scope="col" className="py-1.5 font-medium">
              이동·회전·크기 도구
            </th>
          </tr>
        </thead>
        <tbody>
          {MOUSE_CONTROLS.map((row) => (
            <tr key={row.input} className="border-b last:border-0">
              <th scope="row" className="py-1.5 pr-4 font-normal">
                {row.input}
              </th>
              <td className="py-1.5 pr-4">{row.selectTool}</td>
              <td className="py-1.5">{row.otherTools}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
