import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";

/** 단위 테스트용 씬 (렌더링 없음). 테스트가 끝나면 dispose 한다. */
export function createTestScene(): Scene {
  return new Scene(new NullEngine());
}
