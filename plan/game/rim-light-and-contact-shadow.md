# リムライトと接地影(キャラクターを背景から浮き立たせる)

## 経緯

`plan/game/toon-shading-pipeline.md`(段階陰影+輪郭線)・
`plan/game/post-processing-stack.md`(ブルーム・色調・AA)に続く
描画品質施策の第3弾。

トゥーン系の家庭用タイトルがほぼ例外なく使っているのに、この
リポジトリにまだ無いものが2つある。

- **リムライト(逆光の縁光)**: キャラクターの輪郭の内側に細い明るい
  縁を入れ、暗い背景から浮き立たせる技法。黒い輪郭線(外側)と
  リムライト(内側)の組で、トゥーンの「絵になる」立体感が完成する。
  このゲームは洞窟が舞台で背景が暗く、キャラクターが背景に沈みやすい
  ため、特に効果が大きい。
- **接地影(ブロブシャドウ)**: 足元の丸く濃い影。現状はシャドウマップ
  (`PCFSoftShadowMap`・1024px・平行光源)だけで、広い範囲を1枚で
  賄うため足元の影が淡く、キャラクターが「浮いて」見える。足元に
  濃い接地影を敷くだけで、立っている説得力が大きく変わる。

## 現状の土台

- キャラクターのマテリアルはトゥーン化計画で`MeshToonMaterial`になる
  前提。リムライトはその`onBeforeCompile`拡張として実装する
  (トゥーン化と同じ注入方式なので相性がよい)。
- `ActorView.root`がアクター1体の表示ルート。向き(yaw)はrootが持ち、
  上下の傾きは持たないため、rootの子に水平な板を置けば地面に沿う。
- `renderer.ts`の環境光は`MOOD_VISUALS`(気分)で差し替わる。リムの
  色を固定にすると気分の色調と喧嘩する可能性がある(未決事項)。

## 修正方針

### 1. リムライト(`MeshToonMaterial`への注入)

トゥーン化計画の`toToonMaterial()`に、フレネル項を発光として足す
`onBeforeCompile`を追加する。

```ts
material.onBeforeCompile = (shader) => {
  shader.uniforms.rimColor = { value: new THREE.Color(0x8090c0) };
  shader.uniforms.rimPower = { value: 3.0 };
  shader.uniforms.rimStrength = { value: 0.35 };
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;\nuniform float rimStrength;"
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        vec3 viewDir = normalize(vViewPosition);
        float rim = pow(1.0 - saturate(dot(normal, viewDir)), rimPower);
        totalEmissiveRadiance += rimColor * rim * rimStrength;
      }`
    );
};
```

- `totalEmissiveRadiance`への加算なので、ライティングの段階分けを
  壊さず、輪郭近くだけがふわっと明るくなる。
- 既に発光している部位(目など)は`emission`側が支配的なので実害なし。
- 被弾フラッシュ(`ActorView`の`emissive`書き換え)とも加算関係に
  なるだけで干渉しない。
- トゥーン化計画と同時に実装してよいし、トゥーン化のあとに足しても
  よい(`onBeforeCompile`の追記だけで独立に成立する)。

### 2. 接地影(ブロブシャドウ)

`ActorView`のコンストラクタで、放射状グラデーションの丸い板を
`root`の子として足元に敷く。

```ts
// テクスチャはコードから生成(モジュールスコープで1枚だけ)
function makeBlobTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.45)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: BLOB_TEXTURE,
    transparent: true,
    depthWrite: false,
  })
);
blob.rotation.x = -Math.PI / 2;
blob.position.y = 0.01;          // 床とのZファイティング回避
blob.renderOrder = 1;            // 床の後に描く
```

- 大きさはモデルのバウンディングボックス(XZ)から算出し、
  体格に応じて自動で変える(ぷるん小・ボス大)。
- `MeshBasicMaterial`なのでライティング・気分の色調の影響を受けず
  常に安定して見える。
- 既存のシャドウマップは**そのまま残す**(壁や樽への投影は今までどおり)。
  接地影は「足元の濃さ」だけを補う上乗せ。
- `ActorView.dispose()`でジオメトリを破棄する(テクスチャ・
  マテリアルは全アクター共有なので破棄しない)。

## 受け入れ基準

1. 暗い通路でキャラクターの輪郭内側に細い縁光が見え、背景から
   浮き立って見える(前後比較スクリーンショットで確認)。
2. 発光部位(目の光など)・被弾フラッシュの見え方が破綻しない。
3. 全キャラクターの足元に体格相応の丸い接地影が付き、移動・攻撃の
   踏み込みにも追従する。
4. 接地影が床のタイルとZファイティングでちらつかない。
5. 罠や落ちているアイテムの上に立ったとき、接地影が不自然に
   それらを覆い隠さない(renderOrderの調整で解決できる範囲を確認)。
6. `npm run test`・`npm run typecheck`・`npm run build`がすべてgreen。

## 対象外

- 壁・床・樽など非キャラクターへのリムライト適用(キャラクターを
  浮き立たせるのが目的なので、背景側には掛けない)。
- シャドウマップの解像度・範囲の変更。
- 村(拠点)画面の建物への適用。

## 未決事項

- リムの色を固定値にするか、`MOOD_VISUALS`に`rimColor`を追加して
  気分ごとに変えるか(まず固定で入れて、喧嘩する気分があれば拡張)。
- リムの強さ(`rimStrength`)・鋭さ(`rimPower`)の最終値。
- 接地影の濃さ(0.45は初期案)と、シャドウマップ側の影と二重に
  落ちたときの見え方の調整。
