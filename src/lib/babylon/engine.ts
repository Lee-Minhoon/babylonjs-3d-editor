import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";

export type CreateEngineOptions = {
  antialias?: boolean;
  /** 스크린샷/썸네일 캡처가 필요하면 true */
  preserveDrawingBuffer?: boolean;
  /** false면 WebGPU를 시도하지 않고 바로 WebGL을 사용 */
  preferWebGPU?: boolean;
};

/**
 * 캔버스에 Babylon 엔진을 생성한다. WebGPU를 우선 시도하고, 미지원/초기화 실패 시 WebGL로 폴백.
 * 엔진 구현은 선택된 쪽만 동적으로 로드한다.
 * 브라우저에서만 호출해야 한다 (effect 내부 등).
 */
export async function createEngine(
  canvas: HTMLCanvasElement,
  {
    antialias = true,
    preserveDrawingBuffer = false,
    preferWebGPU = true,
  }: CreateEngineOptions = {},
): Promise<AbstractEngine> {
  if (preferWebGPU) {
    const { WebGPUEngine } =
      await import("@babylonjs/core/Engines/webgpuEngine");

    if (await WebGPUEngine.IsSupportedAsync) {
      const engine = new WebGPUEngine(canvas, {
        antialias,
        adaptToDeviceRatio: true,
        stencil: true,
      });
      try {
        await engine.initAsync();
        return engine;
      } catch (error) {
        console.warn(
          "[babylon] WebGPU 초기화 실패, WebGL로 폴백합니다.",
          error,
        );
        engine.dispose();
      }
    }
  }

  const { Engine } = await import("@babylonjs/core/Engines/engine");
  return new Engine(
    canvas,
    antialias,
    { preserveDrawingBuffer, stencil: true },
    true, // adaptToDeviceRatio
  );
}
