> **実装済み。**
> `src/view/assets.ts` の `Assets.load()`(`.glb` 読み込みの唯一の
> チョークポイント)に、段階陰影(`MeshToonMaterial` + `gradientMap`)と
> 輪郭線(Inverted Hull法)の両方を実装した。他ファイルは変更していない
> (`ActorView` の被弾フラッシュは無改修で動作を確認、`village.ts`・
> `tools/models/` は対象外のまま未変更)。
>
> 実装時の判断(未決事項への回答):
> - **`gradientMap`の階調値**: 本文書の初期案 `[80, 150, 255]` を
>   ヘッドレスブラウザのスクリーンショットで確認したところ、最暗部
>   (`80`)がモンスターの陰の面をほぼ黒く潰し、配色の見分けがつきにくい
>   個体があった。最暗部だけ `90` に持ち上げ、最終的に `[90, 170, 255]`
>   (影/中間/ハイライトの3階調)を採用した。中間値も`150→170`へ寄せ、
>   3段階の明度差をやや均等寄りにしている。
> - **輪郭線の太さ(`outlineThickness`)**: モデルごとの動的計算はせず、
>   固定値 `0.012`(既存モデルのスケール帯0.2〜1.0に対して初期案の`0.01`
>   よりわずかに太め)を全モデル共通で採用した。ヘッドレスブラウザで
>   ズームインしたスクリーンショットを見比べ、`0.01`では小型モンスター
>   (ぷるん系など)の輪郭がやや細く途切れ気味に見えたため、`0.012`まで
>   太くした。プレイヤー・大型モンスターまで含めて輪郭が破綻したり
>   顔まわりの造形を潰したりする様子は見られなかったため、モデルごとの
>   個別調整は行わないことにした。
> - **Zファイティング**: 実機確認(後述)では輪郭線と本体のちらつきは
>   確認できなかった。`side: THREE.BackSide` で背面のみを描画し、かつ
>   頂点シェーダーで法線方向に確実に押し出しているため、深度がほぼ
>   一致する状況が起きにくいことが理由と考えられる。`polygonOffset`等の
>   追加対応は不要と判断し、実装していない(将来、特定モデルで再発したら
>   そのモデル限定で追加を検討する)。
>
> 検証: `npx tsc --noEmit`・`npx vitest run`(既存1283件すべてgreen。
> このレンダリング変更は純粋なロジックとして切り出せる単体テスト向きの
> 部分が薄いため、新規ユニットテストは追加していない)・`npm run build`
> に加え、ヘッドレスChromium(Playwright)で実機相当の確認をした:
> ダンジョンに入って`globalThis.__app.renderer.scene`をトラバースし、
> 読み込まれた全マテリアルが`MeshToonMaterial`(輪郭線用の
> `MeshBasicMaterial`を除く)になっていること、スキン付きメッシュ36個
> それぞれに輪郭線メッシュが1対1で追加され同じスケルトンにbindされて
> いること、歩行・攻撃アニメーション中も輪郭線が本体から外れないこと、
> 被弾時に赤いフラッシュ(`emissive`)が`MeshToonMaterial`上でも問題なく
> 発火すること、コンソールエラーが0件であることを確認した。

# 3D表示をトゥーン描画にする(段階陰影+輪郭線)

## 経緯

「3Dモデルの品質が製品としてお粗末」という指摘を受け、`src/view/`と
`tools/models/`を実際に調査した。結論として、**問題の主因はモデルの
造形そのものではなく、レンダラーがトゥーン向けの描画をしていないこと**
だった。

- `src/view/actorView.ts`のマテリアルはすべて`THREE.MeshStandardMaterial`
  (標準PBR)。影は`renderer.ts`の`PCFSoftShadowMap`による連続グラデーション。
- `src/view/`一帯を検索しても`EffectComposer`・`OutlinePass`・
  `MeshToonMaterial`・`gradientMap`は1つも存在しない。**段階陰影も
  輪郭線も無い。**

ドラゴンクエストモンスターズのような「トゥーン系の意匠で成立している
3Dモンスターゲーム」は、色数を絞ったシンプルな造形に加えて、
**2〜3階調のトゥーンシェーディングと黒い輪郭線**という定番の描画技法を
必ず併用している(Inverted Hull法による輪郭線は、モバイル向けの
トゥーン系ゲームでも広く使われる軽量な定番手法)。今のリポジトリは
造形の作り込み(`tools/models/`)には投資してきたが、**描画側の
トゥーン化には一切手を付けていなかった**。これが「お粗末」に見える
最大の原因だと判断し、造形の個体差調整より先にこちらを直す。

## 現状の土台

`src/view/assets.ts`の`Assets.load()`が、モンスター・プレイヤー・壁・床・
階段・罠・アイテム・タルなど、**Blenderパイプラインで作った`.glb`
すべての読み込みを一手に引き受けている**唯一の場所である。

```ts
const gltf = await this.loader.loadAsync(`${baseUrl}/${name}.glb`);
gltf.scene.traverse((obj) => {
  if ((obj as THREE.Mesh).isMesh) {
    obj.castShadow = true;
    obj.receiveShadow = true;
  }
});
this.cache.set(name, { scene: gltf.scene, animations: gltf.animations });
```

`instantiate()`は`SkeletonUtils.clone()`でシーン全体(メッシュ・
スケルトン・マテリアル参照ごと)を複製して個々の表示インスタンスを
作る。マテリアルはこの複製で共有される(`ActorView.ensureOwnMaterials()`
が「初めて被弾したときだけ」個体専用に複製している事実からも分かる)。
**つまり`load()`の中でキャッシュ前の元シーンを1回だけ加工すれば、
そこから複製されるすべてのインスタンスに自動的に反映される。**

`village.ts`の拠点の建物群は`.glb`を経由せず`MeshStandardMaterial`を
直接コードで組んでおり、Blenderパイプラインの対象外。今回は対象外とする
(「対象外」参照)。

## 修正方針

### 1. 段階陰影(`MeshToonMaterial` + `gradientMap`)

`Assets.load()`のtraverseで、`.glb`から読み込んだ各メッシュの
マテリアルを`THREE.MeshToonMaterial`に差し替える。

```ts
// 全マテリアル共通で使う、3階調のグラデーションマップ(モジュールスコープで1回だけ作る)
const TOON_GRADIENT = (() => {
  const data = new Uint8Array([80, 150, 255]); // 影 / 中間 / ハイライトの3階調
  const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();

function toToonMaterial(source: THREE.MeshStandardMaterial): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: source.color,
    map: source.map,
    emissive: source.emissive,
    emissiveIntensity: source.emissiveIntensity,
    emissiveMap: source.emissiveMap,
    transparent: source.transparent,
    opacity: source.opacity,
    gradientMap: TOON_GRADIENT,
  });
}
```

- `gltf.scene.traverse()`のメッシュ判定に続けて、
  `mesh.material`(配列の場合は各要素)を`toToonMaterial()`で置き換える。
- `NearestFilter`必須。線形補間のままだと諧調が滑らかにボケてトゥーンに
  ならない(three.jsの`MeshToonMaterial`公式挙動)。
- `metalness`はトゥーンマテリアルに存在しないため単純に失われる
  (`honegarami`の剣などで`metallic=0.75`を指定している箇所があるが、
  トゥーン化すればそもそも金属光沢の表現方法自体が変わるため、
  実害ではなく想定内の変化として扱う)。
- **`ActorView`の被弾フラッシュ演出(`ensureOwnMaterials()`)は
  `standard.emissive`の有無だけをチェックしており、`MeshToonMaterial`も
  `emissive`を持つため無改修で動くはず**(要実機確認)。

### 2. 輪郭線(Inverted Hull法)

同じく`Assets.load()`で、スキン付きメッシュ(`SkinnedMesh`)ごとに
「法線を反転して背面だけを黒く少し膨らませて描く」複製メッシュを
兄弟ノードとして追加する。

- ジオメトリは複製不要(共有でよい)。マテリアルは頂点シェーダーで
  法線方向にオフセットをかける必要があるため、`MeshBasicMaterial`の
  `onBeforeCompile`でスキニング適用**後**の頂点座標に押し出しを注入する。

  ```ts
  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x0a0a0c,
    side: THREE.BackSide,
  });
  outlineMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: 0.01 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float outlineThickness;"
      )
      .replace(
        "#include <skinning_vertex>",
        "#include <skinning_vertex>\ntransformed += normalize(objectNormal) * outlineThickness;"
      );
  };
  ```

  **`#include <skinning_vertex>`の後に足すのが肝心**。スキニング適用前の
  ローカル法線でオフセットすると、ボーンが回転した状態で押し出し方向が
  ずれる。

- `SkinnedMesh`として複製し、元メッシュと**同じ`skeleton`インスタンスを
  共有**させる(`outlineMesh.bind(originalMesh.skeleton, originalMesh.bindMatrix)`)。
  新しいスケルトンを作らない。これにより`SkeletonUtils.clone()`が
  `instantiate()`で複製する際も、輪郭線メッシュと本体メッシュの追従関係が
  壊れない(`SkeletonUtils.clone`は「複数のSkinnedMeshが同じスケルトンを
  共有する」構成を正しく扱えるよう作られている)。
- 輪郭線の太さ(`outlineThickness`)はモデルのスケール(既存モデルは
  概ね高さ0.2〜1.0ローカル単位)に対して`0.01`前後を初期値の目安とし、
  実装時にプレビューで見ながら調整する(未決事項参照)。
- 壁・床などの`InstancedMesh`化される非スキン形状(`instancingSource()`
  経由)は、今回のInverted Hull実装(`SkinnedMesh`前提)の対象外とする。
  静的な地形パーツは輪郭線が無くてもシルエットの読み取りやすさへの
  影響が小さいため、段階陰影だけ適用すれば十分と判断する
  (「対象外」参照)。

## 受け入れ基準

1. ブラウザでダンジョンに入ったとき、モンスター・プレイヤー・タル等の
   影が連続グラデーションではなく段階的に切り替わって見える。
2. モンスター・プレイヤーの輪郭に黒い線が入り、背景・他のオブジェクトと
   シルエットがはっきり区別できる。
3. 攻撃を受けたときの被弾フラッシュ演出(赤く光る)が従来どおり機能する。
4. 歩行・攻撃などのアニメーション中も輪郭線がボーンの動きに追従し、
   胴体から外れたり貫通したりしない。
5. `npm run test`・`npm run typecheck`・`npm run build`がすべてgreen。
6. `tools/models/`側の`.glb`・Pythonスクリプトは変更しない
   (今回はレンダラー側だけの変更)。

## 対象外

- `village.ts`の拠点建物(`.glb`を経由しない直書きの`MeshStandardMaterial`)
  のトゥーン化。別途の決定として扱う。
- 壁・床など`InstancedMesh`化された地形パーツへの輪郭線付与。
- `tools/models/`側の造形・配色の作り直し(シルエット強化などの作り込みは
  今回のレンダラー変更を先に済ませたうえで、別の決定として個体ごとに
  進める)。
- 環境マップ(IBL)の導入。トゥーンマテリアルは金属光沢や反射を
  前提にしないため、今回は不要と判断する。

## 未決事項

- `gradientMap`の階調数・各段階の輝度値([80, 150, 255]は初期案)。
  実際のプレビューを見ながら調整する。
- 輪郭線の太さ(`outlineThickness`)。モデルごとにスケールが異なるため、
  固定値1つで全モデルに通用するか、モデルのバウンディングボックスに
  応じて動的に調整するかは実装時に判断する。
- 輪郭線と本体メッシュのZファイティング(奥行きの近い場所でチラつく
  現象)が実機で出た場合、`polygonOffset`等の追加対応が要るか。
