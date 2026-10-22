import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";

let registered = false;

/**
 * glTF/OBJ/STL 등 내장 로더를 등록한다.
 * 각 로더는 실제로 해당 포맷을 로드할 때 동적으로 import 된다.
 */
export function ensureLoadersRegistered() {
  if (registered) return;
  registerBuiltInLoaders();
  registered = true;
}
