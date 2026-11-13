import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { saveFile } from "./file-access";

const TYPE = {
  description: "씬 파일",
  mimeType: "application/json",
  extension: ".json",
};

describe("saveFile — File System Access API가 없을 때 (다운로드)", () => {
  const link = { href: "", download: "", click: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {}); // showSaveFilePicker 없음 (Safari·Firefox)
    vi.stubGlobal("document", { createElement: () => link });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:scene");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("다운로드를 시작한 뒤에 blob URL을 해제한다 (클릭 직후 해제하면 다운로드가 끊길 수 있다)", async () => {
    const saved = await saveFile("{}", {
      handle: null,
      suggestedName: "scene.json",
      type: TYPE,
    });

    expect(saved).toEqual({ name: "scene.json", handle: null });
    expect(link).toMatchObject({ href: "blob:scene", download: "scene.json" });
    expect(link.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:scene");
  });
});

describe("saveFile — 파일 핸들", () => {
  const writable = { write: vi.fn(), close: vi.fn() };
  const handleOf = (
    name: string,
    createWritable: () => Promise<unknown> = async () => writable,
  ) => ({ name, createWritable }) as unknown as FileSystemFileHandle;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("핸들이 있으면 묻지 않고 그 파일에 쓴다", async () => {
    const picker = vi.fn();
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    const handle = handleOf("level.json");

    const saved = await saveFile("{}", {
      handle,
      suggestedName: "scene.json",
      type: TYPE,
    });
    expect(saved).toEqual({ name: "level.json", handle });
    expect(writable.write).toHaveBeenCalledWith("{}");
    expect(picker).not.toHaveBeenCalled();
  });

  test("핸들의 파일이 사라졌으면 위치를 다시 묻는다 (그 뒤 저장이 모두 실패하지 않게)", async () => {
    const picked = handleOf("moved.json");
    const picker = vi.fn(async () => picked);
    vi.stubGlobal("window", { showSaveFilePicker: picker });
    const gone = handleOf("level.json", async () => {
      throw new DOMException("missing", "NotFoundError");
    });

    const saved = await saveFile("{}", {
      handle: gone,
      suggestedName: "level.json",
      type: TYPE,
    });
    expect(saved).toEqual({ name: "moved.json", handle: picked });
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: "level.json" }),
    );
  });

  test("쓰다 실패하면 스트림을 버리고(abort) 오류를 던진다 (임시 파일·잠금이 남지 않게)", async () => {
    vi.stubGlobal("window", { showSaveFilePicker: vi.fn() });
    const stream = {
      write: vi.fn(async () => {
        throw new DOMException("full", "QuotaExceededError");
      }),
      close: vi.fn(),
      abort: vi.fn(async () => {}),
    };
    const handle = handleOf("level.json", async () => stream);
    await expect(
      saveFile("{}", { handle, suggestedName: "x.json", type: TYPE }),
    ).rejects.toThrow("full");
    expect(stream.abort).toHaveBeenCalledOnce();
    expect(stream.close).not.toHaveBeenCalled();
  });

  test("다른 쓰기 오류는 그대로 던진다", async () => {
    vi.stubGlobal("window", { showSaveFilePicker: vi.fn() });
    const broken = handleOf("level.json", async () => {
      throw new DOMException("disk", "QuotaExceededError");
    });
    await expect(
      saveFile("{}", { handle: broken, suggestedName: "x.json", type: TYPE }),
    ).rejects.toThrow("disk");
  });
});
