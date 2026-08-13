# 0012: 地方(Region)を第一級のデータ構造にする

- ステータス: 決定
- 日付: 2026-08-13

## 背景(Context)

表の寝穴は8つの地方(design/regions.md、1地方=6階、全48階)に分かれ、
各地方は固有の階層範囲・固有ギミック・地方ボス・確定ドロップ素材を持つ。
この「地方」という概念そのものを表すデータ構造がこれまで存在せず、
同じ情報(階層範囲とボスの対応)が2つの平行なデータとして
`entities/species.ts` に手書きされていた。

```ts
// 変更前: entities/species.ts
export const REGION_BOSS_FLOORS: Readonly<Record<number, string>> = {
  6: "oonebosuke", 12: "nushigaeru", /* ... */ 48: "horikuiNoNushi",
};
export const REGION_BOSS_ORDER: readonly string[] = [
  "oonebosuke", "nushigaeru", /* ... */ "horikuiNoNushi",
];
```

両者は同じ8体の集合を、階数キーのマップと出現順の配列という別の形で
別々に列挙しており、ボスを1体追加するたびに両方を同期して更新する
必要があった。さらに `entities/dungeons.ts`(ダンジョン定義)が
`entities/species.ts`(種族カタログ)の `REGION_BOSS_ORDER` を参照する
という、本来の抽象度の向き(ダンジョン構造 → 種族データではなく、
種族カタログ → ダンジョン構造という逆向き)の依存も生まれていた。

加えて `game.ts` の `enterFloor` には、地方ごとの階層範囲を直書きした
if文が並んでいる(`depth >= 7 && depth <= 12` 等)。`REGION_SIZE = 6`
という定数がありながら、境界値は数値でハードコードされたままだった。

## 検討した選択肢

| 案 | 概要 | 評価 |
|---|---|---|
| **現状維持(平行データのまま手で同期)** | `REGION_BOSS_FLOORS`・`REGION_BOSS_ORDER` を今後も個別にメンテナンスする | ボス追加のたびに2箇所の同期漏れリスクが残る。地方という概念自体がコードに存在しないため、新しいメンバー(確定ドロップ・固有ギミックの参照)を足すたびに、また別の平行データが増えていく |
| **`RegionDef` の配列を単一の情報源にし、既存の派生データはそこから導出する** | `entities/regions.ts` に地方番号・名前・階層範囲・ボスidを持つ `RegionDef[]` を新設。`REGION_BOSS_FLOORS`・`REGION_BOSS_ORDER` はこの配列から `Object.fromEntries`/`map` で導出する。既存の export 名(`species.ts` からの `REGION_BOSS_FLOORS` 等)は re-export で維持し、呼び出し側は無修正にする | 「地方」という概念がコード上に実体を持ち、以後の地方固有情報(固有ギミックのフック等)もこの1箇所に追加していける。既存の import 文を書き換える必要がなく、移行コストが低い |

## 決定(Decision)

**`entities/regions.ts` に `RegionDef { index, name, floors: [from, to],
bossSpeciesId }` の配列 `REGIONS` を新設する。`REGION_BOSS_FLOORS`
(階数→ボスid)と `REGION_BOSS_ORDER`(出現順の配列)は、この
`REGIONS` から導出する派生データにする。**

- `entities/species.ts` は `export { REGION_BOSS_FLOORS, REGION_BOSS_ORDER }
  from "./regions";` という re-export だけを残す。`game.ts`・
  `entities/dungeons.ts`・テストコードなど、既存の `from
  "../entities/species"` という import 文は一切変更していない。
- `entities/dungeons.ts` は `REGION_BOSS_ORDER` を `./species` 経由では
  なく `./regions` から直接 import するよう変更した。ダンジョン構造の
  定義が種族カタログを経由して地方データを参照する逆向きの依存を解消した。
- 地方固有ギミックの階層範囲判定(`game.ts` の `regionGimmickApplies`
  呼び出し)を `RegionDef` 駆動にする作業は、本ADRの対象に含めない
  (フックの形が地方ごとに異なり調査に時間を要するため、別の変更単位
  として扱う)。

## 結果として生じるトレードオフ(Consequences)

- 良い点:
  - ボスの階数対応と出現順という同じ情報の平行管理が解消され、地方を
    1つ追加・変更する変更点が `REGIONS` の1エントリに集約される。
  - `entities/dungeons.ts` → `entities/species.ts` という不自然な依存が
    解消され、`entities/regions.ts` という地方専用の末端モジュールに
    置き換わった(循環importなし)。
  - 既存の `REGION_BOSS_FLOORS`・`REGION_BOSS_ORDER` という名前・
    呼び出し側を一切変えていないため、テスト(region-boss-*.test.ts
    6本、region-expansion.test.ts 含む)を無修正のまま通せた。
- 悪い点:
  - `RegionDef` は今のところ「階層範囲とボスid」しか持っておらず、
    `game.ts` に残る地方固有ギミックの配置ロジック・モンスターハウス
    倍率・こだまの尾根の物音ギミックはまだこのデータ構造に統合されて
    いない。地方の情報がまだ複数箇所(`regions.ts` と `game.ts`)に
    分かれている状態が過渡的に残る。
  - `species.ts` からの re-export という形は、将来 `REGION_BOSS_FLOORS`
    等を `species.ts` から直接 import している既存コードがある限り
    残しておく必要があり、恒久的な間接参照になる。
