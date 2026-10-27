/*
 * 브라우저 파일 열기/저장.
 * File System Access API(Chrome·Edge)가 있으면 파일 핸들을 받아 같은 파일에 덮어쓸 수 있고,
 * 없으면 <input type="file"> 열기 / 다운로드 저장으로 대신한다 (핸들은 null).
 */

/** TS lib.dom에 아직 없는 File System Access API 부분 */
type FilePickerType = { description: string; accept: Record<string, string[]> };
type FilePickerWindow = Window & {
  showOpenFilePicker?: (options: {
    types?: FilePickerType[];
    multiple?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: {
    types?: FilePickerType[];
    suggestedName?: string;
  }) => Promise<FileSystemFileHandle>;
};

export type FileTypeOptions = {
  /** 피커에 보일 설명 (예: "씬 파일") */
  description: string;
  mimeType: string;
  /** 점 포함 (예: ".json") */
  extension: string;
};

export type OpenedFile = {
  name: string;
  text: string;
  handle: FileSystemFileHandle | null;
};

export type SavedFile = {
  name: string;
  handle: FileSystemFileHandle | null;
};

function pickerTypes({ description, mimeType, extension }: FileTypeOptions) {
  return [{ description, accept: { [mimeType]: [extension] } }];
}

/** 사용자가 피커를 닫은 경우 */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function pickWithInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/** 파일 하나를 골라 텍스트로 읽는다. 취소하면 null */
export async function openTextFile(
  type: FileTypeOptions,
): Promise<OpenedFile | null> {
  const picker = (window as FilePickerWindow).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({ types: pickerTypes(type) });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }

  const file = await pickWithInput(`${type.extension},${type.mimeType}`);
  return file
    ? { name: file.name, text: await file.text(), handle: null }
    : null;
}

async function writeToHandle(handle: FileSystemFileHandle, text: string) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

function download(name: string, text: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * 텍스트를 파일로 저장한다. 취소하면 null.
 * @param handle 있으면 묻지 않고 그 파일에 덮어쓴다 (없으면 저장 위치를 묻거나 다운로드)
 */
export async function saveTextFile(
  text: string,
  {
    handle,
    suggestedName,
    type,
  }: {
    handle: FileSystemFileHandle | null;
    suggestedName: string;
    type: FileTypeOptions;
  },
): Promise<SavedFile | null> {
  if (handle) {
    await writeToHandle(handle, text);
    return { name: handle.name, handle };
  }

  const picker = (window as FilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const picked = await picker({ suggestedName, types: pickerTypes(type) });
      await writeToHandle(picked, text);
      return { name: picked.name, handle: picked };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }

  download(suggestedName, text, type.mimeType);
  return { name: suggestedName, handle: null };
}
