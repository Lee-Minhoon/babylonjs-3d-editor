import { expect, type Page } from "@playwright/test";

/*
 * E2E 공용 도우미. 화면 조작은 사용자가 보는 것(사이드바 목록·메뉴·속성 패널)으로 확인한다.
 * 씬 내부(Babylon 객체)는 들여다보지 않는다 — 그건 단위 테스트(src/**\/*.test.ts)의 몫.
 */

export async function openEditor(page: Page) {
  await page.goto("/");
  // 씬이 준비되면 프리셋 버튼이 활성화된다
  await expect(page.getByRole("button", { name: /^Box/ }).first()).toBeEnabled({
    timeout: 20_000,
  });
}

/** 뷰포트 캔버스 중심 기준 좌표 (dx, dy)를 페이지 좌표로 */
export async function viewportPoint(page: Page, dx = 0, dy = 0) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("canvas not found");
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
}

/** 커서를 옮겨 미리보기를 갱신한 뒤 클릭 */
export async function clickViewport(page: Page, dx = 0, dy = 0) {
  const { x, y } = await viewportPoint(page, dx, dy);
  await page.mouse.move(x - 5, y - 5);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
}

/** 숫자 키로 프리셋 배치 모드를 켜고 한 번 놓은 뒤 끈다 */
export async function placePreset(page: Page, digit: string, dx = 0, dy = 0) {
  await page.keyboard.press(digit);
  await clickViewport(page, dx, dy);
  await page.keyboard.press("Escape");
}

/** 사이드바 씬 목록의 메쉬 이름들 */
export function sceneList(page: Page) {
  return page.locator("aside li");
}

export async function expectScene(page: Page, names: string[]) {
  await expect(sceneList(page)).toHaveText(names);
}

export async function selectMesh(page: Page, name: string) {
  await sceneList(page)
    .filter({ hasText: name })
    .getByRole("button", { name, exact: true })
    .click();
}

/** 배치 상태 안내 문구 (사이드바) */
export function placementHint(page: Page) {
  return page.locator("aside section p").first();
}

/** 편집 메뉴의 "실행 취소" 항목 라벨 (예: "실행 취소Box 1 추가⌘Z") */
export async function undoMenuText(page: Page) {
  await page.getByRole("menuitem", { name: "편집", exact: true }).click();
  const text = await page
    .getByRole("menuitem", { name: /^실행 취소/ })
    .textContent();
  await page.keyboard.press("Escape");
  return text ?? "";
}

export function axisInput(page: Page, axis: "X" | "Y" | "Z", field: string) {
  return page.locator(`input[aria-label='${axis} ${field}']`);
}

/**
 * File System Access API를 메모리 파일로 바꾼다 (헤드리스에선 파일 창을 조작할 수 없다).
 * window.__files[name] = 내용, window.__nextOpen = 열기 창에서 고를 파일 이름.
 */
export async function mockFileSystem(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & {
      __files: Record<string, string>;
      __nextOpen: string | null;
    };
    w.__files = {};
    w.__nextOpen = null;
    const handle = (name: string) => ({
      name,
      kind: "file",
      getFile: async () => new File([w.__files[name] ?? ""], name),
      createWritable: async () => {
        let buffer = "";
        return {
          write: async (text: string) => void (buffer += text),
          close: async () => void (w.__files[name] = buffer),
        };
      },
    });
    w.showSaveFilePicker = async ({
      suggestedName,
    }: {
      suggestedName: string;
    }) => handle(suggestedName);
    w.showOpenFilePicker = async () => {
      if (!w.__nextOpen) throw new DOMException("cancelled", "AbortError");
      return [handle(w.__nextOpen)];
    };
  });
}

export function readMockFile(page: Page, name: string) {
  return page.evaluate(
    (fileName) =>
      (window as unknown as { __files: Record<string, string> }).__files[
        fileName
      ],
    name,
  );
}

export function writeMockFile(page: Page, name: string, text: string) {
  return page.evaluate(
    ([fileName, content]) => {
      const w = window as unknown as {
        __files: Record<string, string>;
        __nextOpen: string | null;
      };
      w.__files[fileName] = content;
      w.__nextOpen = fileName;
    },
    [name, text] as const,
  );
}

/** 한글 입력 상태의 키 입력 (key는 한글, code는 물리 키) */
export function pressHangul(
  page: Page,
  key: string,
  code: string,
  modifiers: { metaKey?: boolean; shiftKey?: boolean } = {},
) {
  return page.evaluate(
    ([k, c, m]) =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: k,
          code: c,
          bubbles: true,
          cancelable: true,
          ...m,
        }),
      ),
    [key, code, modifiers] as const,
  );
}
