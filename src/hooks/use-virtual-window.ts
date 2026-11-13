"use client";

import { useEffect, useState } from "react";

/** 처음 그릴 때(높이를 재기 전) 가정하는 보이는 높이 */
const INITIAL_HEIGHT = 1000;

export type VirtualWindow = {
  /** 스크롤되는 요소에 붙인다 (목록이 나중에 생겨도 따라간다) */
  ref: (element: HTMLElement | null) => void;
  /** 그릴 줄 범위 [start, end) */
  start: number;
  end: number;
  /** 그리지 않은 위·아래 줄이 차지할 높이 (px) */
  before: number;
  after: number;
};

/**
 * 긴 목록에서 보이는 줄(과 위아래 overscan줄)만 그리기. 줄 간격(stride)이 모두 같아야 한다.
 * 스크롤·크기 변화를 따라 범위를 다시 정한다 — 수천 줄을 모두 DOM에 두면 레이아웃 한 번이 수백 ms가 된다.
 */
export function useVirtualWindow(
  count: number,
  stride: number,
  overscan = 10,
): VirtualWindow {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [view, setView] = useState({ top: 0, height: INITIAL_HEIGHT });

  useEffect(() => {
    if (!element) return;
    const update = () =>
      setView((previous) =>
        previous.top === element.scrollTop &&
        previous.height === element.clientHeight
          ? previous
          : { top: element.scrollTop, height: element.clientHeight },
      );
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [element]);

  return { ref: setElement, ...virtualRange(count, stride, overscan, view) };
}

/**
 * 보이는 범위 계산 (순수 함수). 목록이 줄어들면 스크롤 위치가 새 높이 밖에 있을 수 있는데, 그대로 쓰면
 * 빈 범위를 그려 콘텐츠가 더 줄고 브라우저가 scrollTop을 한 칸씩 당기며 수십 프레임 빈 화면이 남는다
 * — 그래서 먼저 스크롤 위치를 새 높이 안으로 당긴다.
 */
export function virtualRange(
  count: number,
  stride: number,
  overscan: number,
  view: { top: number; height: number },
): Omit<VirtualWindow, "ref"> {
  const top = Math.min(view.top, Math.max(0, count * stride - view.height));
  const start = Math.max(0, Math.floor(top / stride) - overscan);
  const end = Math.max(
    start,
    Math.min(count, Math.ceil((top + view.height) / stride) + overscan),
  );
  return {
    start,
    end,
    before: start * stride,
    after: Math.max(0, count - end) * stride,
  };
}
