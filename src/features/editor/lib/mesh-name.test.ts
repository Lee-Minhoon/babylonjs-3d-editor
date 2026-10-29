import { afterEach, describe, expect, test, vi } from "vitest";

import { createRenameCommand, onMeshNameChange } from "./mesh-name";
import { addPresetMesh, findPreset, resetMeshNames } from "./mesh-presets";
import { createTestScene } from "./test-scene";

const scene = createTestScene();
const addBox = () => addPresetMesh(scene, findPreset("box")!);
afterEach(() => {
  for (const mesh of [...scene.meshes]) mesh.dispose();
  resetMeshNames(scene);
});

describe("createRenameCommand", () => {
  test("실행·되돌리기, 라벨은 바꾸기 전 이름", () => {
    const box = addBox();
    const command = createRenameCommand(box, "  문  ")!;
    expect(command.label).toBe("Box 1 이름 변경");
    command.execute();
    expect(box.name).toBe("문"); // 앞뒤 공백 제거
    command.undo();
    expect(box.name).toBe("Box 1");
  });

  test("그대로이거나 빈 이름이면 Command를 만들지 않는다", () => {
    const box = addBox();
    expect(createRenameCommand(box, "Box 1")).toBeNull();
    expect(createRenameCommand(box, "   ")).toBeNull();
  });

  test("이름이 바뀌면 그 메쉬 구독자에게 알린다", () => {
    const box = addBox();
    const listener = vi.fn();
    onMeshNameChange(box, listener);
    createRenameCommand(box, "창문")!.execute();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("'Box 9'로 바꾸면 다음 새 박스는 Box 10", () => {
    createRenameCommand(addBox(), "Box 9")!.execute();
    expect(addBox().name).toBe("Box 10");
  });
});
