import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { GridMaterial } from "@babylonjs/materials/grid/gridMaterial";

const SIZE = 100;

/**
 * 바닥 격자: 0.1 / 1 / 10 유닛 3단계.
 * GridMaterial은 한 장에 2단계(minor·major)만 그리므로 두 장을 겹친다.
 *   - 바닥(불투명):  0.1 유닛 얇은 선 + 1 유닛 선
 *   - 오버레이(linesOnly): 10 유닛 굵은 선 — 선이 아닌 픽셀은 버려서 아래가 보인다
 * 촘촘한 선은 셰이더가 화면상 밀도에 따라 자동으로 흐려지므로 멀리서 모아레가 생기지 않는다.
 * 배치·선택 레이캐스트는 바닥(ground)만 맞도록 오버레이는 pick 불가.
 */
export function createGroundGrid(scene: Scene): Mesh {
  const ground = CreateGround("ground", { width: SIZE, height: SIZE }, scene);
  const fine = new GridMaterial("ground Material", scene);
  fine.mainColor = new Color3(0.13, 0.13, 0.15);
  fine.lineColor = new Color3(0.36, 0.36, 0.42);
  fine.gridRatio = 0.1;
  fine.majorUnitFrequency = 10; // 0.1 × 10 = 1 유닛마다 선
  fine.minorUnitVisibility = 0.3; // 0.1 유닛 선은 옅게
  fine.backFaceCulling = false;
  ground.material = fine;

  const overlay = CreateGround(
    "ground Major Lines",
    { width: SIZE, height: SIZE },
    scene,
  );
  overlay.isPickable = false;
  const major = new GridMaterial("ground Major Lines Material", scene);
  major.lineColor = new Color3(0.55, 0.55, 0.62);
  major.gridRatio = 10;
  major.majorUnitFrequency = 1; // 모든 선을 굵은 선으로
  major.linesOnly = true; // 선 외 픽셀 discard → 아래 바닥이 보인다 (Babylon 9: opacity가 아니라 이 플래그)
  major.backFaceCulling = false;
  major.zOffset = -1; // 같은 평면의 바닥과 z-fighting 방지
  overlay.material = major;

  return ground;
}
