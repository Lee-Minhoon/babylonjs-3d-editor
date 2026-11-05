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
  /** 점 포함 (예: ".json"). 저장할 때 붙는 확장자 */
  extension: string;
  /** 열 때 함께 받는 확장자 (예: ".jpeg") */
  otherExtensions?: readonly string[];
};

export type OpenedFile = {
  name: string;
  bytes: Uint8Array;
  handle: FileSystemFileHandle | null;
};

export type SavedFile = {
  name: string;
  handle: FileSystemFileHandle | null;
};

const extensionsOf = (type: FileTypeOptions) => [
  type.extension,
  ...(type.otherExtensions ?? []),
];

function pickerTypes(types: readonly FileTypeOptions[]): FilePickerType[] {
  return types.map((type) => ({
    description: type.description,
    accept: { [type.mimeType]: extensionsOf(type) },
  }));
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

const readBytes = async (file: File) =>
  new Uint8Array(await file.arrayBuffer());

/** 파일 하나를 골라 바이트로 읽는다 (types 중 하나). 취소하면 null */
export async function openFile(
  types: FileTypeOptions | readonly FileTypeOptions[],
): Promise<OpenedFile | null> {
  const list = Array.isArray(types) ? types : [types as FileTypeOptions];
  const picker = (window as FilePickerWindow).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({ types: pickerTypes(list) });
      const file = await handle.getFile();
      return { name: file.name, bytes: await readBytes(file), handle };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }

  const accept = list
    .flatMap((type) => [...extensionsOf(type), type.mimeType])
    .join(",");
  const file = await pickWithInput(accept);
  return file
    ? { name: file.name, bytes: await readBytes(file), handle: null }
    : null;
}

/** 저장할 내용: 텍스트(씬 파일) 또는 바이너리(GLB·PNG·zip) */
export type FileContent = string | Blob;

async function writeToHandle(
  handle: FileSystemFileHandle,
  content: FileContent,
) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

function download(name: string, content: FileContent, mimeType: string) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // 클릭 직후 바로 해제하면 일부 브라우저(Safari 등)에서 다운로드가 시작되기 전에 끊긴다
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * 내용을 파일로 저장한다. 취소하면 null.
 * @param handle 있으면 묻지 않고 그 파일에 덮어쓴다 (없으면 저장 위치를 묻거나 다운로드)
 */
export async function saveFile(
  content: FileContent,
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
    await writeToHandle(handle, content);
    return { name: handle.name, handle };
  }

  const picker = (window as FilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const picked = await picker({
        suggestedName,
        types: pickerTypes([type]),
      });
      await writeToHandle(picked, content);
      return { name: picked.name, handle: picked };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }

  download(suggestedName, content, type.mimeType);
  return { name: suggestedName, handle: null };
}
