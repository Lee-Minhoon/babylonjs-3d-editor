import type { Scene } from "@babylonjs/core/scene";

/**
 * 개발 환경에서 Shift+Alt+I 로 Babylon Inspector를 토글한다.
 * Inspector는 무거우므로 처음 열 때 동적으로 로드한다.
 * 반환된 함수를 호출하면 리스너를 제거하고 열린 Inspector를 닫는다.
 */
export function attachInspectorToggle(scene: Scene): () => void {
  if (process.env.NODE_ENV !== "development") return () => {};

  let token: { dispose(): Promise<void> } | null = null;
  let pending = false;

  const toggle = async () => {
    if (pending) return;
    if (token) {
      const current = token;
      token = null;
      await current.dispose();
      return;
    }
    pending = true;
    try {
      const { ShowInspector } = await import("@babylonjs/inspector");
      if (!scene.isDisposed) token = ShowInspector(scene);
    } finally {
      pending = false;
    }
  };

  // 에디터 키맵 표(features/editor/lib/editor-shortcuts) 밖의 유일한 keydown 리스너 — 개발 전용이고
  // 공용 lib은 features를 import 할 수 없어서 여기 둔다. ⇧⌥I는 표의 어떤 단축키와도 겹치지 않는다.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "KeyI" && event.shiftKey && event.altKey) {
      event.preventDefault();
      void toggle();
    }
  };

  window.addEventListener("keydown", onKeyDown);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    void token?.dispose();
    token = null;
  };
}
