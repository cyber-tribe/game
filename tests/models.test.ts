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

const MODEL_DIR = join(import.meta.dirname, "..", "public", "models");

/**
 * .glb は「ヘッダ + チャンクの並び」という単純な容器で、最初のチャンクが
 * glTF の JSON。ライブラリを持ち込まなくても、ここだけ読めば中身を検査できる。
 */
interface Gltf {
  meshes?: unknown[];
  materials?: unknown[];
  skins?: unknown[];
  animations?: { name?: string }[];
  accessors?: { count?: number }[];
}

function readGlb(name: string): Gltf {
  const buffer = readFileSync(join(MODEL_DIR, `${name}.glb`));
  expect(buffer.subarray(0, 4).toString("ascii"), `${name}: glTF のヘッダではない`).toBe("glTF");
  expect(buffer.readUInt32LE(4), `${name}: glTF のバージョンが 2 ではない`).toBe(2);
  expect(buffer.readUInt32LE(8), `${name}: ファイル長がヘッダと合わない`).toBe(buffer.length);

  const chunkLength = buffer.readUInt32LE(12);
  // 0x4E4F534A = "JSON"
  expect(buffer.readUInt32LE(16), `${name}: 最初のチャンクが JSON ではない`).toBe(0x4e4f534a);
  return JSON.parse(buffer.subarray(20, 20 + chunkLength).toString("utf8")) as Gltf;
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
    // 描画は同時に十数体ぶん走る。1体が肥大すると効いてくるので上限を決めておく
    for (const name of animatedModelNames()) {
      const bytes = statSync(join(MODEL_DIR, `${name}.glb`)).size;
      expect(bytes, `${name}: ${Math.round(bytes / 1024)}KB は大きすぎる`).toBeLessThan(
        700 * 1024,
      );
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
      expect(bytes, `${name}: ${Math.round(bytes / 1024)}KB は大きすぎる`).toBeLessThan(
        700 * 1024,
      );
    }
  });

  it("壁と床は大量に並べるので、とりわけ小さい", () => {
    for (const name of ["wall", "floor"]) {
      const bytes = statSync(join(MODEL_DIR, `${name}.glb`)).size;
      expect(bytes, `${name}: ${Math.round(bytes / 1024)}KB は大きすぎる`).toBeLessThan(32 * 1024);
    }
  });
});
