/*
 * E2E용 GLB를 코드로 만든다 (바이너리 파일을 저장소에 두지 않으려고).
 * 상자 두 개 — 왼쪽은 빨강, 오른쪽은 파랑 머티리얼 — 를 노드 둘로. 크기 1, 바닥(y=0) 위.
 */

/** 크기 1 상자의 면별 정점 (24개, 법선 포함)과 인덱스 */
function cube() {
  const faces = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach(({ n, u, v }, face) => {
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      for (let i = 0; i < 3; i++) {
        positions.push(
          (n[i] + su * u[i] + sv * v[i]) / 2 + (i === 1 ? 0.5 : 0),
        );
        normals.push(n[i]);
      }
    }
    const base = face * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { positions, normals, indices };
}

export function createTestGlb(): Buffer {
  const { positions, normals, indices } = cube();
  const positionBytes = Buffer.from(new Float32Array(positions).buffer);
  const normalBytes = Buffer.from(new Float32Array(normals).buffer);
  const indexBytes = Buffer.from(new Uint16Array(indices).buffer);
  const bin = Buffer.concat([positionBytes, normalBytes, indexBytes]);
  const binPadded = Buffer.concat([
    bin,
    Buffer.alloc((4 - (bin.length % 4)) % 4),
  ]);

  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { mesh: 0, translation: [-0.5, 0, 0], name: "left" },
      { mesh: 1, translation: [0.5, 0, 0], name: "right" },
    ],
    meshes: [0, 1].map((material) => ({
      primitives: [
        { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material },
      ],
    })),
    materials: [
      { pbrMetallicRoughness: { baseColorFactor: [0.8, 0.1, 0.1, 1] } },
      { pbrMetallicRoughness: { baseColorFactor: [0.1, 0.2, 0.8, 1] } },
    ],
    buffers: [{ byteLength: binPadded.length }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positionBytes.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: positionBytes.length,
        byteLength: normalBytes.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: positionBytes.length + normalBytes.length,
        byteLength: indexBytes.length,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [-0.5, 0, -0.5],
        max: [0.5, 1, 0.5],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: normals.length / 3,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
  };
  let jsonBytes = Buffer.from(JSON.stringify(json));
  jsonBytes = Buffer.concat([
    jsonBytes,
    Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20),
  ]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binPadded.length, 8);
  const chunk = (type: number, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  return Buffer.concat([
    header,
    chunk(0x4e4f534a, jsonBytes),
    chunk(0x004e4942, binPadded),
  ]);
}
