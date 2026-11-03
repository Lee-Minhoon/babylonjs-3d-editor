import { describe, expect, test, vi } from "vitest";

import { ADD_MENU_ITEMS, createAddMenu, searchAddMenu } from "./add-menu";
import { MESH_PRESETS } from "./mesh-presets";

const ids = (query: string) => searchAddMenu(query).map((item) => item.id);

describe("검색형 추가 메뉴", () => {
  test("빈 검색어면 전부, 프리셋 순서대로", () => {
    expect(ids("")).toEqual(MESH_PRESETS.map((preset) => preset.id));
    expect(ADD_MENU_ITEMS).toHaveLength(MESH_PRESETS.length);
  });

  test("이름은 대소문자·공백 무시, 이름이 그 글자로 시작하는 것이 먼저", () => {
    expect(ids("CY")).toEqual(["cylinder"]);
    expect(ids("ico s")).toEqual(["ico-sphere"]);
    // sphere(이름 시작) → ico-sphere(들어 있음)
    expect(ids("sph")).toEqual(["sphere", "ico-sphere"]);
  });

  test("한글 검색어로도 찾는다", () => {
    expect(ids("원뿔")).toEqual(["cone"]);
    expect(ids("도넛")).toEqual(["torus"]);
    expect(ids("구")).toEqual(["sphere", "ico-sphere"]);
  });

  test("맞는 게 없으면 빈 목록", () => {
    expect(ids("teapot")).toEqual([]);
  });

  test("열고 닫기", () => {
    const menu = createAddMenu();
    const listener = vi.fn();
    menu.subscribe(listener);
    menu.open({ x: 10, y: 20 });
    expect(menu.getState()).toEqual({ open: true, at: { x: 10, y: 20 } });
    menu.close();
    menu.close();
    expect(menu.getState()).toEqual({ open: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
