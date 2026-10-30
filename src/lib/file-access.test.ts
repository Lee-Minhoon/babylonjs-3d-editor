import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { saveTextFile } from "./file-access";

const TYPE = {
  description: "씬 파일",
  mimeType: "application/json",
  extension: ".json",
};

describe("saveTextFile — File System Access API가 없을 때 (다운로드)", () => {
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
    const saved = await saveTextFile("{}", {
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
