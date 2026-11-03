import { describe, expect, test } from "vitest";

import { SHORTCUT_GROUPS } from "./editor-reference";
import {
  getPresetShortcut,
  SHORTCUT_LABELS,
  VIEW_SHORTCUTS,
} from "./editor-shortcuts";
import { MESH_PRESETS } from "./mesh-presets";

const documented = new Set(
  SHORTCUT_GROUPS.flatMap((group) => group.items.flatMap((item) => item.keys)),
);

describe("단축키 목록 (도움말·설명서)", () => {
  test("모든 단축키 라벨이 목록에 있다 — 새 단축키를 넣으면 여기서 알려준다", () => {
    const labels = [
      ...Object.values(SHORTCUT_LABELS),
      ...Object.values(VIEW_SHORTCUTS),
      ...MESH_PRESETS.flatMap((preset) => getPresetShortcut(preset.id) ?? []),
    ];
    expect(labels.filter((label) => !documented.has(label))).toEqual([]);
  });

  test("도구 단축키 Q/W/E/R", () => {
    const tools = SHORTCUT_GROUPS.find((group) => group.title === "도구");
    expect(tools?.items.map((item) => item.keys[0])).toEqual([
      "Q",
      "W",
      "E",
      "R",
    ]);
  });
});
