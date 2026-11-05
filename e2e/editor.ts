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

/** 사이드바 씬 목록의 항목들 (속성 패널의 여러 개 선택 목록과 구분) */
export function sceneList(page: Page) {
  return page.getByRole("list", { name: "씬 메쉬" }).getByRole("listitem");
}

export async function expectScene(page: Page, names: string[]) {
  // 비어 있으면 목록 자체가 없고 안내 문구가 나온다
  if (names.length === 0) {
    await expect(page.getByText("아직 추가된 메쉬가 없습니다.")).toBeVisible();
  } else {
    await expect(sceneList(page)).toHaveText(names);
  }
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

/**
 * 열린 메뉴를 Esc로 닫는다. 메뉴가 열려 포커스를 가져간 뒤에 누른다 — 열리는 중(포커스가 아직 트리거)에 누른 Esc는
 * 메뉴를 닫지 못하고 에디터로 가서 선택을 푼다. 닫히는 중인 메뉴의 항목도 locator에 잡히므로 열림(data-open)으로 본다.
 */
export async function closeMenu(page: Page) {
  const menu = page.locator("[role=menu][data-open]");
  await expect(menu).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
}

/** 편집 메뉴의 "실행 취소" 항목 라벨 (예: "실행 취소Box 1 추가⌘Z") */
export async function undoMenuText(page: Page) {
  const menu = page.locator("[role=menu][data-open]");
  // 바로 전에 닫은 메뉴가 다 닫힌 뒤에 연다 (닫히는 중에 다른 트리거를 누르면 열리지 않는다)
  await expect(menu).toHaveCount(0);
  await page.getByRole("menuitem", { name: "편집", exact: true }).click();
  const text = await menu
    .getByRole("menuitem", { name: /^실행 취소/ })
    .textContent();
  await closeMenu(page);
  return text ?? "";
}

export function axisInput(page: Page, axis: "X" | "Y" | "Z", field: string) {
  return page.locator(`input[aria-label='${axis} ${field}']`);
}

/**
 * File System Access API를 메모리 파일로 바꾼다 (헤드리스에선 파일 창을 조작할 수 없다).
 * window.__files[name] = 텍스트 내용, window.__blobs[name] = 바이너리(GLB·PNG),
 * window.__nextOpen = 열기 창에서 고를 파일 이름.
 */
export async function mockFileSystem(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & {
      __files: Record<string, string>;
      __blobs: Record<string, Blob>;
      __nextOpen: string | null;
    };
    w.__files = {};
    w.__blobs = {};
    w.__nextOpen = null;
    const handle = (name: string) => ({
      name,
      kind: "file",
      getFile: async () =>
        new File([w.__blobs[name] ?? w.__files[name] ?? ""], name),
      createWritable: async () => {
        let buffer = "";
        let blob: Blob | null = null;
        return {
          write: async (data: string | Blob) => {
            if (data instanceof Blob) blob = data;
            else buffer += data;
          },
          close: async () => {
            if (blob) w.__blobs[name] = blob;
            else w.__files[name] = buffer;
          },
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

/** 바이너리로 저장된 파일의 크기·종류와 앞 4바이트 (예: "glTF", "\x89PNG"). 없으면 null */
export function readMockBlob(page: Page, name: string) {
  return page.evaluate(async (fileName) => {
    const blob = (window as unknown as { __blobs: Record<string, Blob> })
      .__blobs[fileName];
    if (!blob) return null;
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return {
      size: blob.size,
      type: blob.type,
      magic: String.fromCharCode(...head),
    };
  }, name);
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

/** 다음 "열기" 창이 이 바이너리 파일을 고르게 한다 (모델·이미지·zip) */
export function writeMockBytes(page: Page, name: string, bytes: Uint8Array) {
  return page.evaluate(
    ([fileName, base64]) => {
      const w = window as unknown as {
        __blobs: Record<string, Blob>;
        __nextOpen: string | null;
      };
      const binary = atob(base64);
      w.__blobs[fileName] = new Blob([
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ]);
      w.__nextOpen = fileName;
    },
    [name, Buffer.from(bytes).toString("base64")] as const,
  );
}

/** 저장된 바이너리 파일 내용 (없으면 null) */
export async function readMockBytes(
  page: Page,
  name: string,
): Promise<Uint8Array | null> {
  const base64 = await page.evaluate(async (fileName) => {
    const blob = (window as unknown as { __blobs: Record<string, Blob> })
      .__blobs[fileName];
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, name);
  return base64 === null ? null : new Uint8Array(Buffer.from(base64, "base64"));
}

/** 다음 "열기" 창이 이미 저장된 파일을 고르게 한다 */
export function setNextOpen(page: Page, name: string) {
  return page.evaluate((fileName) => {
    (window as unknown as { __nextOpen: string | null }).__nextOpen = fileName;
  }, name);
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

/** 파일 메뉴의 항목을 누른다 */
export async function fileMenu(page: Page, item: string | RegExp) {
  await page.getByRole("menuitem", { name: "파일", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** 저장된 PNG를 읽어 크기·배경색·위/아래 절반의 "배경이 아닌" 픽셀 수를 센다 */
export function inspectPng(page: Page, name: string) {
  return page.evaluate(async (fileName) => {
    const blob = (window as unknown as { __blobs: Record<string, Blob> })
      .__blobs[fileName];
    const image = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const background = [...data.slice(0, 3)];
    const half = (image.height / 2) * image.width;
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < image.width * image.height; i++) {
      const differs = [0, 1, 2].some(
        (c) => Math.abs(data[i * 4 + c] - background[c]) > 24,
      );
      if (differs) {
        if (i < half) top++;
        else bottom++;
      }
    }
    const viewport = document.querySelector("canvas")!;
    return {
      size: [image.width, image.height],
      canvas: [viewport.width, viewport.height],
      background,
      top,
      bottom,
    };
  }, name);
}
