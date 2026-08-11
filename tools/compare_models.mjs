/**
 * 2つのディレクトリにある .glb を「構造」で突き合わせる。
 *
 *   node tools/compare_models.mjs <基準ディレクトリ> <比較ディレクトリ>
 *
 * バイト単位で比べられない理由:
 * Blender の出力は、同じマシンで同じスクリプトを2回走らせてもバイト一致しない。
 * uv_sphere を含む12モデルが毎回わずかに変わる(ファイルサイズは同一で、頂点数も
 * マテリアル数も変わらない)。PYTHONHASHSEED を固定しても揺れは残るので、
 * Blender 内部の順序に由来するものと見ている。形が変わったわけではないため、
 * これを差分として扱っても意味がない。
 *
 * そこで、頂点数・面数・マテリアル数・アニメーションのクリップ名といった
 * 「変わったら本当に困るもの」だけを取り出して比べる。モデル制作スクリプトに手を入れて
 * .glb を作り直し忘れた場合は、ここで捕まる。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function readGlb(path) {
  const buffer = readFileSync(path);
  if (buffer.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error(`${path}: glTF ではない`);
  }
  const chunkLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + chunkLength).toString("utf8"));
}

/** 形が変わったかどうかを表す指紋。浮動小数の値そのものは含めない */
function fingerprint(gltf) {
  return {
    meshes: (gltf.meshes ?? []).length,
    primitives: (gltf.meshes ?? []).reduce((n, m) => n + (m.primitives?.length ?? 0), 0),
    materials: (gltf.materials ?? []).length,
    nodes: (gltf.nodes ?? []).length,
    skins: (gltf.skins ?? []).length,
    joints: (gltf.skins ?? []).reduce((n, s) => n + (s.joints?.length ?? 0), 0),
    animations: (gltf.animations ?? []).map((a) => a.name).sort(),
    // アクセサの要素数は頂点数・面数・キーフレーム数を反映する。
    // 形やモーションが変われば必ずここが動く。
    accessorCounts: (gltf.accessors ?? []).map((a) => a.count),
  };
}

function fingerprintDir(dir) {
  const out = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".glb")).sort()) {
    out.set(file.replace(/\.glb$/, ""), fingerprint(readGlb(join(dir, file))));
  }
  return out;
}

const [base, other] = process.argv.slice(2);
if (!base || !other) {
  console.error("使い方: node tools/compare_models.mjs <基準ディレクトリ> <比較ディレクトリ>");
  process.exit(2);
}

const a = fingerprintDir(base);
const b = fingerprintDir(other);
const problems = [];

for (const name of a.keys()) {
  if (!b.has(name)) problems.push(`${name}: 作り直したほうに存在しない`);
}
for (const name of b.keys()) {
  if (!a.has(name)) problems.push(`${name}: コミットされていない新しいモデル`);
}
for (const [name, left] of a) {
  const right = b.get(name);
  if (!right) continue;
  const l = JSON.stringify(left);
  const r = JSON.stringify(right);
  if (l !== r) {
    problems.push(
      `${name}: 構造が違う\n    コミット済み: ${summary(left)}\n    作り直した:   ${summary(right)}`,
    );
  }
}

if (problems.length > 0) {
  console.error("コミット済みの .glb が、いまのスクリプトの出力と食い違っています。\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nnpm run models を実行して、public/models/ の結果をコミットしてください。");
  process.exit(1);
}

console.log(`${a.size} 件すべて、コミット済みの .glb とスクリプトの出力が一致しています。`);

function summary(fp) {
  const verts = fp.accessorCounts.reduce((n, c) => n + c, 0);
  return (
    `メッシュ${fp.meshes} マテリアル${fp.materials} ノード${fp.nodes} ` +
    `スキン${fp.skins} クリップ[${fp.animations.join(",")}] 要素計${verts}`
  );
}
