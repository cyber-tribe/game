# AO(環境遮蔽)を頂点カラーへベイクして陰影の密度を上げる

## 経緯

描画品質を家庭用機水準へ近づける施策の第5弾(第1〜4弾: トゥーン化・
ポストプロセス・リムライト+接地影・戦闘VFX)。

現状のモデルは完全な単色ベタ塗り(`assign_material` /
`assign_materials_by_region`による面単位の塗り分けのみ)で、UVも
テクスチャも頂点カラーも持たない。このため、くぼみ・関節・パーツの
重なり(肋骨の隙間、耳の付け根、装甲の継ぎ目など)にも陰影の
「密度感」が出ず、のっぺりして見える。これが造形面での品質の
限界要因のひとつになっている。

家庭用機系のトゥーン作品でも、単色に見えるキャラクターは実際には
AO(環境遮蔽)を焼き込んで細部を締めていることが多い。UVアンラップと
テクスチャ制作は「スクリプトだけで完結する」この制作方針と相性が
悪いが、**頂点カラーへのAOベイクならUV不要・追加アセット不要・
`.glb`にそのまま乗る**ため、方針を壊さずに導入できる。

## 現状の土台

- `tools/models/common.py`の`build_skinned()`が体のメッシュを作り、
  `join()`が小物パーツと統合して1メッシュにする。頂点数はサブディビ
  ジョン適用後で数千(三角形1,800〜7,500)あり、頂点カラーの解像度
  として十分。
- Blender(bpy 5.0)のCyclesは、ベイク先を画像ではなく
  **カラー属性(頂点カラー)**にする機能を持つ
  (`scene.render.bake.target = "VERTEX_COLORS"`、ベイク種別`AO`)。
- glTFエクスポータは頂点カラーを`COLOR_0`属性として書き出せる。
- three.js側は`material.vertexColors = true`にすると`COLOR_0`を
  ベースカラーへ乗算する。`MeshToonMaterial`も対応している。
- `.glb`のバイト差分・頂点数の揺れは既に許容されている運用
  (README「バイトの揺れ・位相の揺れ」)。AOベイクのサンプリング
  ノイズが加わっても運用は変わらない。`tools/compare_models.mjs`は
  構造と外形だけを比べるので、頂点カラーの追加で壊れない。

## 修正方針

### 1. パイプライン側(`tools/models/common.py`)

`export_glb()`の前(または`join()`の直後)に共通処理として挟む:

```python
def bake_ao_to_vertex_colors(obj, samples: int = 64, distance: float = 0.25) -> None:
    """AOをカラー属性 'ao' に焼く。UV不要・全モデル共通で呼べる。"""
    mesh = obj.data
    if "ao" not in mesh.color_attributes:
        mesh.color_attributes.new("ao", type="BYTE_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = mesh.color_attributes["ao"]

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.render.bake.target = "VERTEX_COLORS"
    scene.world.light_settings.distance = distance  # 近距離の遮蔽だけ拾う

    activate(obj)
    bpy.ops.object.bake(type="AO")
```

- `distance`はローカル単位0.25前後(モデルの体高0.2〜1.0に対して、
  関節・隙間のような近距離の遮蔽だけを拾う値)から調整を始める。
- サンプル64は「頂点単位ならノイズが目立たない最小限」の初期案。
  ベイク時間は全84モデルの一括再生成に影響する(未決事項)。
- **モデル側スクリプト(`monsters.py`等)は1行も変えない。**
  共通基盤に足すだけで全モデルに効く。

### 2. 表示側(`src/view/assets.ts`)

トゥーン化計画の`toToonMaterial()`に1行足す:

```ts
vertexColors: "COLOR_0" in mesh.geometry.attributes ... // 属性がある場合のみ true
```

- **発光マテリアル(目の光など)では`vertexColors`を有効にしない。**
  発光部がAOで暗くなると「弱った光」に見えてしまう。マテリアルの
  `emissiveIntensity > 0`を判定条件にする。
- 頂点カラーを持たない旧`.glb`が混ざっていても、属性の有無で分岐する
  ので読み込みは壊れない(全モデル再生成前でも動く)。

### 3. 再生成の進め方

1. `common.py`にベイク処理を入れる(このPR相当の実装)。
2. `npm run models`で全モデルを作り直し、プレビューPNGで
   「くぼみが暗くなっているか」「ベタ塗りの清潔感が失われすぎて
   いないか」を確認する。
3. 効果が強すぎる場合はAOの寄与を弱める(ベイク値を0.6〜1.0の範囲に
   リマップしてから書き込む等)。

## 受け入れ基準

1. 肋骨の隙間・耳の付け根・装甲の継ぎ目・脚の付け根など、遮蔽の
   強い箇所が周囲より一段暗くなって見える(代表モデル数体の
   プレビュー前後比較で確認)。
2. 発光部位(目の光など)の明るさが変わらない。
3. 単色ベタ塗りの様式感は保たれている(全体が薄汚れて見えない)。
4. `tests/models.test.ts`・`tools/compare_models.mjs`がgreen
   (頂点カラー追加でファイルサイズ上限に当たらないことも含む)。
5. `npm run test`・`npm run typecheck`・`npm run build`がすべてgreen。

## 対象外

- UVアンラップ・画像テクスチャの導入(方針転換になるためやらない)。
- 画面空間AO(SSAO)。負荷が高く、ベイクで代替できるため
  ポストプロセス計画でも対象外にしている。
- 壁・床(`InstancedMesh`)へのAO。ジオメトリが単純な箱で効果が
  薄いため見送る。

## 未決事項

- サンプル数・遮蔽距離・リマップ範囲の最終値。
- 全84モデルの一括ベイクにかかる時間と、`models.yml`ワークフローの
  タイムアウトへの影響。
- `BYTE_COLOR`(8bit)で階調が足りるか(足りなければ`FLOAT_COLOR`)。
