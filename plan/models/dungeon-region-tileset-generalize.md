# 地方タイルセットの選択を汎用化し、第二地方(忘れ潮の湿地)を追加する

## 経緯

`dungeon-region1-tileset.md`(実装済み・アーカイブ)で第一地方の
「コンクリート」からの脱却が完了した。次は`dungeon-dreamscape.md`
(実装済み・アーカイブ)が既に定めている残り7地方の展開を進める。
一度にやると1PRの規模を超えるため、引き続き**地方ごとに1つずつ**
進める。本書はまず、**選択の仕組みを地方1専用のハードコードから
汎用化**したうえで、**第二地方(忘れ潮の湿地)**を追加する。

## 現状

`src/view/dungeonMesh.ts`の`build()`は、地方1かどうかを個別に
判定するハードコードになっている:

```ts
const isRegion1 = regionIndexForFloor(dungeonId, floor.depth) === 1;
const wallModels = isRegion1 ? REGION1_WALL_MODELS : ["wall"];
const floorModels = isRegion1 ? REGION1_FLOOR_MODELS : ["floor"];
...
const stairs = this.assets.instantiate(isRegion1 ? "stairs_region1" : "stairs").root;
```

このまま地方ごとに`isRegion2`, `isRegion3`...を積み増すと、
展開が進むほどコードが分岐だらけになる。

## 変更内容

### 1. 選択の仕組みを汎用化する

- 地方番号→タイルセット名の対応表を1つのデータ構造にまとめる:

```ts
const REGION_TILESETS: Partial<Record<number, {
  wall: readonly string[];
  floor: readonly string[];
  stairs: string;
}>> = {
  1: {
    wall: ["wall_region1_v1", "wall_region1_v2", "wall_region1_v3"],
    floor: ["floor_region1_v1", "floor_region1_v2", "floor_region1_v3"],
    stairs: "stairs_region1",
  },
  // 今後、地方が増えるたびにここへ追加するだけでよい
};
```

- `build()`側は`REGION_TILESETS[regionIndexForFloor(dungeonId, floor.depth)]`を
  引き、無ければ既定の`["wall"]`/`["floor"]`/`"stairs"`にフォールバック
  する1本の処理に置き換える(`isRegion1`のような専用フラグを
  地方ごとに増やさない)。
- この変更は**見た目に一切影響しない**(第一地方の現行の見え方を
  変えずに済むことを、リファクタ後の比較スクリーンショットで
  確認する)。

### 2. 第二地方(忘れ潮の湿地)のタイルセットを追加する

`dungeon-dreamscape.md`が定めた意匠をそのまま作る:

- **壁**: 葦の束と泥の土手(束ねた葦の質感、太さ・傾きを変える
  3バリアント)。
- **床**: ぬかるみ+点在する水たまり(頂点カラーで水面の反射を
  簡易に表現。水たまりの位置を変える3バリアント)。
- **階段**: 泥に沈む丸太(第一地方の「根の段々」と同じ踏み面+
  蹴上げの構成を流用し、素材を丸太に差し替える)。
- ポリゴン予算・AOベイクの基準は第一地方と同じ
  (`texture-pipeline-adoption.md`/`visual-quality-uplift.md`)。
  頂点カラーのまま(テクスチャ化は対象外、`texture-rollout-
  unblock.md`のモンスター優先方針を継続)。
- `REGION_TILESETS`に`2`のエントリを追加するだけで組み込める
  (上記の汎用化により、`dungeonMesh.ts`側の追加コードは不要)。

## 受け入れ基準

1. 第二地方のフロアが、第一地方と明確に異なる形(葦・泥の土手)に
   見える。
2. 第一地方の見た目・当たり判定・ミニマップに変化がない
   (汎用化のリファクタが既存動作を壊していない)。
3. 地方1・2以外のダンジョンの見た目に変化がない(既定セットへの
   フォールバックが機能している)。
4. モバイル実機で60fpsを維持する。

## 対象外

- 第三〜八地方のタイルセット(本書の汎用化により、以後は
  `REGION_TILESETS`へのエントリ追加+造形だけで済むため、
  地方ごとに軽量な追加PRで進められる)
- 壁の呼吸・ヨリシロの記憶の断片(`dungeon-dreamscape.md`が
  既に対象外とした項目のまま)

## 未決事項

- なし(第一地方の実装パターンをそのまま踏襲する)
