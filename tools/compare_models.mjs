/**
 * 2つのディレクトリにある .glb を「構造」で突き合わせる。
 *
 *   node tools/compare_models.mjs <基準ディレクトリ> <比較ディレクトリ>
 *
 * 何を比べ、何を比べないかは、実際に測って決めた。
 *
 * バイト単位:比べられない。同じマシンで同じスクリプトを2回走らせても一致しない。
 *   uv_sphere を含むモデルが毎回わずかに変わる(ファイルサイズは同じ)。
 *   PYTHONHASHSEED を固定しても揺れは残った。
 *
 * 頂点数:比べられない。Skin モディファイアの出力する位相そのものが安定しない。
 *   ツブテガエルを単体で4回作り直したところ 20678 / 21434 / 22490 と3通りに割れた。
 *   胴が太く四肢が広い角度で生えているため、皮の張り方の解決が数値的に際どいらしい。
 *   同じ理由で手元と CI でも食い違い、これを見ていたせいで CI が落ちた。
 *
 * バウンディングボックス:比べられる。上記4回すべてで小数点以下4桁まで完全に一致した。
 *   位相が揺れても輪郭は変わらないので、寸法を変えて作り直し忘れた場合は捕まる。
 *
 * というわけで、メッシュ数・マテリアル数・ノード数・スキン・クリップ名といった
 * 構造と、輪郭(bbox)を比べる。位相の揺れは無視しつつ、モデル制作スクリプトに
 * 手を入れて .glb を作り直し忘れた場合は落ちる。
 *
 * 内側だけの寸法変更(外形に出ない半径いじりなど)は、この網では捕まらない。
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

/** 座標の一致とみなす幅。位相が揺れても輪郭はこれよりずっと細かく一致する */
const EPSILON = 1e-3;

/** 形が変わったかどうかを表す指紋 */
function fingerprint(gltf) {
  return {
    meshes: (gltf.meshes ?? []).length,
    primitives: (gltf.meshes ?? []).reduce((n, m) => n + (m.primitives?.length ?? 0), 0),
    materials: (gltf.materials ?? []).length,
    nodes: (gltf.nodes ?? []).length,
    skins: (gltf.skins ?? []).length,
    joints: (gltf.skins ?? []).reduce((n, s) => n + (s.joints?.length ?? 0), 0),
    animations: (gltf.animations ?? []).map((a) => a.name).sort(),
    bounds: bounds(gltf),
  };
}

/** 全アクセサの min/max から求めた外形。頂点座標を持つものだけが min/max を持つ */
function bounds(gltf) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const accessor of gltf.accessors ?? []) {
    if (accessor.type !== "VEC3" || !accessor.min || !accessor.max) continue;
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], accessor.min[i]);
      hi[i] = Math.max(hi[i], accessor.max[i]);
    }
  }
  return lo.every(Number.isFinite) ? [...lo, ...hi] : null;
}

/** 構造が同じか。bbox だけは誤差を許して比べる */
function same(a, b) {
  const structural = (fp) => JSON.stringify({ ...fp, bounds: undefined });
  if (structural(a) !== structural(b)) return false;
  if (a.bounds === null || b.bounds === null) return a.bounds === b.bounds;
  return a.bounds.every((v, i) => Math.abs(v - b.bounds[i]) <= EPSILON);
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
  if (!same(left, right)) {
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
  const box = fp.bounds
    ? fp.bounds.map((v) => v.toFixed(3)).join(" ")
    : "なし";
  return (
    `メッシュ${fp.meshes} マテリアル${fp.materials} ノード${fp.nodes} ` +
    `スキン${fp.skins} 骨${fp.joints} クリップ[${fp.animations.join(",")}] 外形[${box}]`
  );
}
