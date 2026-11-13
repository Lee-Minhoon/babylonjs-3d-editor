import { describe, expect, test } from "vitest";

import { virtualRange } from "./use-virtual-window";

describe("virtualRange", () => {
  test("보이는 줄과 overscan만, 위아래는 높이로 채운다", () => {
    const range = virtualRange(1000, 24, 10, { top: 2400, height: 480 });
    expect(range).toEqual({
      start: 90,
      end: 130,
      before: 90 * 24,
      after: 870 * 24,
    });
  });

  test("목록이 줄어 스크롤 위치가 새 높이 밖이면 끝으로 당겨 빈 범위를 만들지 않는다", () => {
    // 1만 줄 끝까지 내린 뒤 50줄만 남긴 경우
    const range = virtualRange(50, 24, 10, { top: 230_000, height: 480 });
    expect(range.start).toBeLessThan(range.end);
    expect(range.end).toBe(50);
    expect(range.after).toBe(0);
  });

  test("비어 있으면 아무것도 그리지 않는다", () => {
    expect(virtualRange(0, 24, 10, { top: 500, height: 480 })).toEqual({
      start: 0,
      end: 0,
      before: 0,
      after: 0,
    });
  });
});
