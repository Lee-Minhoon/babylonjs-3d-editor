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
