import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_CLIPS,
  VILLAGER_CLIPS,
  VILLAGER_MODELS,
  animatedModelNames,
  modelNames,
} from "../src/modelList";
import { MODEL_HEIGHT_BASELINE, SINK_EXCEPTIONS } from "./helpers/modelBaseline";

const MODEL_DIR = join(import.meta.dirname, "..", "public", "models");

/**
 * 1体あたりの予算。**役どころで変える**。
 *
 * もとは全キャラ一律700KB/12,000三角形だったが、主人公は常時画面に
 * 1体だけ映り、会話やカットで一番カメラに寄る。そこへ雑魚と同じ枠を
 * 掛けると、顔テクスチャの解像度が足りずに目がドットになり、口の線が
 * にじむ(実測: 顔1,212 texels/unit では口の線が保てない)。
 * 同時に十数体描かれるモンスター・村人の枠は据え置く。
 */
const SIZE_BUDGET: Record<string, number> = { garudo: 2600 * 1024 };
const TRI_BUDGET: Record<string, number> = {
  garudo: 24000,
};
const DEFAULT_SIZE_BUDGET = 700 * 1024;
const DEFAULT_TRI_BUDGET = 12000;

const sizeBudget = (name: string) => SIZE_BUDGET[name] ?? DEFAULT_SIZE_BUDGET;
const triBudget = (name: string) => TRI_BUDGET[name] ?? DEFAULT_TRI_BUDGET;

/**
 * .glb は「ヘッダ + チャンクの並び」という単純な容器で、最初のチャンクが
 * glTF の JSON、2つ目が頂点データ等のバイナリ(BIN)。ライブラリを
 * 持ち込まなくても、この2つを読めば中身を検査できる。
 */
interface GltfAccessor {
  count: number;
  componentType: number;
  type: string;
  bufferView?: number;
  byteOffset?: number;
  min?: number[];
  max?: number[];
}

interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  /** モデル側のカスタムプロパティ(まばたきの指定など) */
  extras?: Record<string, unknown>;
}

interface Gltf {
  meshes?: {
    primitives?: {
      attributes: Record<string, number>;
      indices?: number;
    }[];
  }[];
  materials?: { name?: string }[];
  skins?: unknown[];
  animations?: {
    name?: string;
    channels?: { sampler: number; target: { node?: number; path: string } }[];
    samplers?: { input: number; output: number; interpolation?: string }[];
  }[];
  accessors?: GltfAccessor[];
  bufferViews?: { byteOffset?: number; byteStride?: number }[];
  nodes?: GltfNode[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
}

function readGlb(name: string): Gltf {
  return readGlbChunks(name).gltf;
}

function readGlbChunks(name: string): { gltf: Gltf; bin: Buffer | null } {
  const buffer = readFileSync(join(MODEL_DIR, `${name}.glb`));
  expect(buffer.subarray(0, 4).toString("ascii"), `${name}: glTF のヘッダではない`).toBe("glTF");
  expect(buffer.readUInt32LE(4), `${name}: glTF のバージョンが 2 ではない`).toBe(2);
  expect(buffer.readUInt32LE(8), `${name}: ファイル長がヘッダと合わない`).toBe(buffer.length);

  const chunkLength = buffer.readUInt32LE(12);
  // 0x4E4F534A = "JSON"
  expect(buffer.readUInt32LE(16), `${name}: 最初のチャンクが JSON ではない`).toBe(0x4e4f534a);
  const gltf = JSON.parse(buffer.subarray(20, 20 + chunkLength).toString("utf8")) as Gltf;

  let bin: Buffer | null = null;
  let offset = 20 + chunkLength;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    // 0x004E4942 = "BIN"
    if (buffer.readUInt32LE(offset + 4) === 0x004e4942) {
      bin = buffer.subarray(offset + 8, offset + 8 + length);
    }
    offset += 8 + length;
  }
  return { gltf, bin };
}

/** 列優先(glTFの流儀)の4x4行列の積 */
function multiply(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/** ノードのローカル変換(matrixがあればそれ、無ければTRS) */
function nodeMatrix(node: GltfNode): number[] {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  // クォータニオン → 回転行列(列優先)
  const r = [
    1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qz * qw), 2 * (qx * qz - qy * qw),
    2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw),
    2 * (qx * qz + qy * qw), 2 * (qy * qz - qx * qw), 1 - 2 * (qx * qx + qy * qy),
  ];
  return [
    r[0] * sx, r[1] * sx, r[2] * sx, 0,
    r[3] * sy, r[4] * sy, r[5] * sy, 0,
    r[6] * sz, r[7] * sz, r[8] * sz, 0,
    tx, ty, tz, 1,
  ];
}

/**
 * バインドポーズでの外接箱のY範囲(モデル空間)。
 *
 * 各メッシュのPOSITIONはそのノードのローカル空間にあるので、**ノードの
 * ワールド変換を掛けてから**合成する。生のmin/maxをそのまま比べると、
 * 原点を部品の中心へ置いた剛体パーツ(まばたきする目など、原点をずらすと
 * スケールが正しく効く)が原点付近の値を持ち込み、身長・接地の判定を
 * 壊す(実測: 目パッチのローカル-0.025が「床下」と誤検出された)。
 */
function boundsY(gltf: Gltf): { minY: number; maxY: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  const nodes = gltf.nodes ?? [];
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  const visit = (index: number, parent: number[]): void => {
    const node = nodes[index];
    if (!node) return;
    const world = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes?.[node.mesh]?.primitives ?? []) {
        const pos = gltf.accessors?.[prim.attributes.POSITION];
        // glTFの仕様でPOSITIONアクセサはmin/max必須
        if (!pos?.min || !pos.max) continue;
        for (let corner = 0; corner < 8; corner++) {
          const x = corner & 1 ? pos.max[0] : pos.min[0];
          const y = corner & 2 ? pos.max[1] : pos.min[1];
          const z = corner & 4 ? pos.max[2] : pos.min[2];
          const wy = world[1] * x + world[5] * y + world[9] * z + world[13];
          minY = Math.min(minY, wy);
          maxY = Math.max(maxY, wy);
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? nodes.map((_, i) => i)) visit(root, identity);
  return { minY, maxY };
}

/** 全プリミティブの三角形数の合計 */
function triangleCount(gltf: Gltf): number {
  let tris = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const count =
        prim.indices !== undefined
          ? (gltf.accessors?.[prim.indices]?.count ?? 0)
          : (gltf.accessors?.[prim.attributes.POSITION]?.count ?? 0);
      tris += count / 3;
    }
  }
  return tris;
}

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/**
 * ウェイト合計がほぼ0の頂点(どのボーンにも属さない頂点)の数。
 * Bone Heat失敗の残骸で、動かすと置き去りになったり、全滅すると
 * エクスポータがスキンごと落としたりする(ツブテガエルで実際に起きた)。
 */
function zeroWeightVertexCount(gltf: Gltf, bin: Buffer): number {
  let zero = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const idx = prim.attributes.WEIGHTS_0;
      if (idx === undefined) continue;
      const acc = gltf.accessors?.[idx];
      if (!acc || acc.bufferView === undefined) continue;
      const view = gltf.bufferViews?.[acc.bufferView];
      const start = (view?.byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const stride = view?.byteStride ?? COMPONENT_BYTES[acc.componentType] * TYPE_COMPONENTS[acc.type];
      for (let v = 0; v < acc.count; v++) {
        let sum = 0;
        for (let c = 0; c < 4; c++) {
          const at = start + v * stride + c * COMPONENT_BYTES[acc.componentType];
          if (acc.componentType === 5126) sum += bin.readFloatLE(at);
          else if (acc.componentType === 5121) sum += bin.readUInt8(at) / 255;
          else if (acc.componentType === 5123) sum += bin.readUInt16LE(at) / 65535;
        }
        if (sum < 1e-4) zero++;
      }
    }
  }
  return zero;
}

/** アクセサを float の配列(要素ごとに区切った形)で読む */
function readAccessor(gltf: Gltf, bin: Buffer, index: number): number[][] {
  const acc = gltf.accessors?.[index];
  if (!acc || acc.bufferView === undefined) return [];
  const view = gltf.bufferViews?.[acc.bufferView];
  const comps = TYPE_COMPONENTS[acc.type];
  const bytes = COMPONENT_BYTES[acc.componentType];
  const start = (view?.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view?.byteStride ?? bytes * comps;
  const out: number[][] = [];
  for (let i = 0; i < acc.count; i++) {
    const item: number[] = [];
    for (let c = 0; c < comps; c++) item.push(bin.readFloatLE(start + i * stride + c * bytes));
    out.push(item);
  }
  return out;
}

/** 単位クォータニオン2つのなす角(度) */
function quatAngleDeg(a: number[], b: number[]): number {
  const dot = Math.min(1, Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

/**
 * モデルはビルド済みの .glb をコミットしている。Blender を入れなくても遊べる代わりに、
 * 作り直しを忘れたり壊れたものを混ぜたりしても気づけない。
 * ここで中身を検査して、その穴を塞いでおく。
 */
describe("3Dモデル", () => {
  const names = modelNames();

  it("ゲームが必要とするモデルがすべて存在する", () => {
    const missing = names.filter((name) => !existsSync(join(MODEL_DIR, `${name}.glb`)));
    expect(missing, `モデルが足りない: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(names)("%s.glb が glTF として読める", (name) => {
    const gltf = readGlb(name);
    expect(gltf.meshes?.length ?? 0, `${name}: メッシュが無い`).toBeGreaterThan(0);
    expect(gltf.materials?.length ?? 0, `${name}: マテリアルが無い`).toBeGreaterThan(0);
  });

  it.each(animatedModelNames())("%s に5つのクリップとスキンがある", (name) => {
    const gltf = readGlb(name);
    const clips = (gltf.animations ?? []).map((a) => a.name);
    for (const required of REQUIRED_CLIPS) {
      expect(clips, `${name}: '${required}' クリップが無い (ある: ${clips.join(", ")})`).toContain(
        required,
      );
    }
    expect(gltf.skins?.length ?? 0, `${name}: スキンが無い。骨と皮が結びついていない`).toBe(1);
  });

  it("1体あたりのポリゴン数が予算内に収まっている", () => {
    for (const name of animatedModelNames()) {
      const bytes = statSync(join(MODEL_DIR, `${name}.glb`)).size;
      const limit = sizeBudget(name);
      expect(
        bytes,
        `${name}: ${Math.round(bytes / 1024)}KB は大きすぎる(上限 ${Math.round(limit / 1024)}KB)`,
      ).toBeLessThan(limit);
    }
  });

  it.each([...VILLAGER_MODELS])("村人 %s に idle と talk とスキンがある", (name) => {
    const gltf = readGlb(name);
    const clips = (gltf.animations ?? []).map((a) => a.name);
    // 村人は戦わないので、モンスターの5本ではなくこの2本に揃える。
    // 余計なクリップが混ざっていないことまで見る(村人8人で揃うのが大事)
    expect([...clips].sort(), `${name}: 村人のクリップは idle と talk の2本`).toEqual(
      [...VILLAGER_CLIPS].sort(),
    );
    expect(gltf.skins?.length ?? 0, `${name}: スキンが無い。骨と皮が結びついていない`).toBe(1);
  });

  it("村人も1体あたりの大きさが予算内に収まっている", () => {
    for (const name of VILLAGER_MODELS) {
      const bytes = statSync(join(MODEL_DIR, `${name}.glb`)).size;
      const limit = sizeBudget(name);
      expect(
        bytes,
        `${name}: ${Math.round(bytes / 1024)}KB は大きすぎる(上限 ${Math.round(limit / 1024)}KB)`,
      ).toBeLessThan(limit);
    }
  });

  // ---- モデル規格lint(plan/models/archive/garudo-quality-uplift.md 実装項目1) ----
  // 対象はキャラクター(主人公・モンスター・村人)。地形・小物は対象外

  const characters = [...new Set([...animatedModelNames(), ...VILLAGER_MODELS])];

  it.each(characters)("%s が床下へ沈んでいない", (name) => {
    if (name in SINK_EXCEPTIONS) return;
    const { minY } = boundsY(readGlb(name));
    // 接地キャラは0、浮遊キャラは正。負に振れるのは「床にめり込む」事故だけ
    expect(minY, `${name}: 最下端 ${minY.toFixed(3)} が床下にある`).toBeGreaterThan(-0.06);
  });

  it.each(characters)("%s の身長が基準値から無断で変わっていない", (name) => {
    const baseline = MODEL_HEIGHT_BASELINE[name];
    expect(baseline, `${name}: 基準身長が未登録。tests/helpers/modelBaseline.ts に追記する`).toBeDefined();
    const { minY, maxY } = boundsY(readGlb(name));
    const height = maxY - minY;
    // 意図した体格変更なら、このメッセージの実測値を基準表へ書き写す
    expect(
      Math.abs(height - baseline) / baseline,
      `${name}: 身長 ${height.toFixed(3)}(基準 ${baseline})が±5%を超えて変わった`,
    ).toBeLessThan(0.05);
  });

  it.each(characters)("%s の三角形数が予算内に収まっている", (name) => {
    // ファイルサイズとは別の予算。テクスチャを軽くしてポリゴンを湯水のように
    // 使う逃げ道を塞ぐ(描画は同時に十数体ぶん走る)
    const tris = triangleCount(readGlb(name));
    const limit = triBudget(name);
    expect(
      tris,
      `${name}: ${tris}三角形は多すぎる(上限 ${limit})`,
    ).toBeLessThanOrEqual(limit);
  });

  it("garudo の顔がまばたきのアトラスを持っている", () => {
    // テクスチャ切り替え方式(plan/models/archive/garudo-face-qa.md 第9段階)。
    // 目のためだけの板は貼らず、顔のUV島を別マテリアルにして
    // open/half/closed を横に並べてある。extrasが落ちると
    // src/view/blink.ts が対象を見つけられず、見た目は正常なのに
    // まばたきだけ静かに止まる
    const gltf = readGlb("garudo");
    const tagged = (gltf.nodes ?? []).filter((n) => n.extras?.blink === "eyelid");
    expect(tagged.length, "garudo: blink=eyelid のノードが1つ要る").toBe(1);
    const extras = tagged[0]!.extras!;
    expect(extras.blinkTiles, "コマ数(open/half/closed)").toBe(3);
    const faceMaterial = String(extras.blinkMaterial ?? "");
    expect(
      (gltf.materials ?? []).map((m) => m.name),
      `顔のマテリアル ${faceMaterial} が無い`,
    ).toContain(faceMaterial);
  });

  it("あくびとかげの口が、顎ボーンの開き角で顔アトラスを切り替えられる", () => {
    // 下顎を別メッシュに割って回す方式は、閉口時に口内が輪郭から
    // はみ出すため棄却した(handbook/cage-and-2d3d-split.md)。口は
    // 「閉じ / 半開き / 大あくび」の3コマを横に並べた顔アトラスで開く。
    // extras が落ちると src/view/mouth.ts が対象を見つけられず、
    // 見た目は正常なのにあくびだけ静かに口を開けなくなる
    const { gltf, bin } = readGlbChunks("akubitokage");
    expect(bin, "akubitokage: BINチャンクが無い").not.toBeNull();
    const tagged = (gltf.nodes ?? []).filter((n) => n.extras?.mouthTiles !== undefined);
    expect(tagged.length, "akubitokage: mouthTiles を持つノードが1つ要る").toBe(1);
    const extras = tagged[0]!.extras!;
    expect(extras.mouthTiles, "コマ数(閉じ/半開き/大あくび)").toBe(3);
    expect(
      (gltf.materials ?? []).map((m) => m.name),
      `顔のマテリアル ${extras.mouthMaterial} が無い`,
    ).toContain(String(extras.mouthMaterial ?? ""));

    // 顎ボーンが実在し、あくび(attack)が mouthOpenDeg 相当まで開くこと。
    // ここが開かないと、コマは0のまま = 口を閉じたままあくびをする
    const boneName = String(extras.mouthBone ?? "");
    const boneIndex = (gltf.nodes ?? []).findIndex((n) => n.name === boneName);
    expect(boneIndex, `顎ボーン ${boneName} が無い`).toBeGreaterThanOrEqual(0);
    const openDeg = Number(extras.mouthOpenDeg);
    expect(openDeg, "mouthOpenDeg が数値でない").toBeGreaterThan(0);

    const attack = (gltf.animations ?? []).find((a) => a.name === "attack");
    const channel = attack?.channels?.find(
      (c) => c.target.node === boneIndex && c.target.path === "rotation",
    );
    expect(channel, "attack に顎ボーンの回転チャンネルが無い").toBeDefined();
    const sampler = attack!.samplers![channel!.sampler]!;
    const quats = readAccessor(gltf, bin as Buffer, sampler.output);
    const rest = gltf.nodes![boneIndex]!.rotation ?? [0, 0, 0, 1];
    const angles = quats.map((q) => quatAngleDeg(q, rest));
    // 最大コマ(右端)へ量子化されるのは、開き角が mouthOpenDeg の 3/4 以上のとき
    expect(
      Math.max(...angles),
      `attack の顎の最大開き角 ${Math.max(...angles).toFixed(1)}° が小さすぎる`,
    ).toBeGreaterThan(openDeg * 0.75);
    // 閉じたコマにも必ず戻る(開きっぱなしのクリップになっていない)
    expect(Math.min(...angles), "attack が閉じ口から始まっていない").toBeLessThan(openDeg * 0.25);
  });

  it.each(characters)("%s にどのボーンにも属さない頂点が無い", (name) => {
    const { gltf, bin } = readGlbChunks(name);
    expect(bin, `${name}: BINチャンクが無い`).not.toBeNull();
    const zero = zeroWeightVertexCount(gltf, bin as Buffer);
    expect(zero, `${name}: ウェイト合計0の頂点が${zero}個ある(Bone Heat失敗の残骸)`).toBe(0);
  });

  it("壁と床は大量に並べるので、とりわけ小さい", () => {
    for (const name of ["wall", "floor"]) {
      const bytes = statSync(join(MODEL_DIR, `${name}.glb`)).size;
      expect(bytes, `${name}: ${Math.round(bytes / 1024)}KB は大きすぎる`).toBeLessThan(32 * 1024);
    }
  });
});
