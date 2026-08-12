# 忘れ物蔵(わすれものぐら)

`plan/archive/hidden-dungeon.md` が「①忘れ物蔵は実装しなかった」として
見送っていた宿題に着手する。見送り理由(「8地方すべての隠し通路を
1回ずつ見つける」という解放条件が前提とする8地方の床構造が未実装
だった)は `plan/region-expansion.md` によって解消済みなので、当時の
未決事項だった「隠し通路の具体的な仕掛け方」だけを詰めて、実装可能な
形にする。

## コンセプト(既存設計の再掲)

ヨリシロの夢の隅に溜まった、誰の記憶とも紐づかない半端な品々、という
設定の、戦闘よりも探索・資源管理に寄せた短いダンジョン(全5階)。
野生モンスターは少なめ、満腹度の減りはやや早め(目安1.5倍)、報酬は
`plan/equipment-forging.md` の刻印石・ほこら粉が中心。これらは
`plan/archive/hidden-dungeon.md` の記述をそのまま踏襲する(変更なし)。

## 隠し通路の仕掛け(新規に確定させる部分)

- 各地方(`design/regions.md` の8地方)につき1本、**特定の壁タイルを
  「隠し壁」としてマークする**。`Tile` に `secretPassage?: boolean` を
  追加する(`plan/wetland-quagmire.md` が `Tile.quagmire` を追加したのと
  同じ設計:`TileKind` 自体は増やさず、既存の壁タイルに属性を1つ足す
  だけ)。
- 各地方の**固定の1階**(地方の2階目。第一地方なら2階、第二地方なら
  8階、……というように「地方境界+1」の階に統一する)の生成時、既存の
  部屋・通路生成が終わったあと、部屋に隣接する壁タイルを1つ選んで
  `secretPassage: true` にする後処理パスを追加する(`plan/wetland-
  quagmire.md` の深みタイル付与パスと同じ位置に実装できる)。
- **発見の仕掛けは「気配のヒント→バンプで探る」の2段階にする。**
  1. プレイヤーが隠し壁タイルに隣接するマスへ初めて足を踏み入れた
     ターンに、一度だけ短いメッセージ(例:「――かすかに隙間の風を
     感じる」)を出す。既存の `GameEvent`(`type: "message"`)の枠組みを
     そのまま使う。新しいUIは増やさない。
  2. その隠し壁へ向かって移動しようとする(＝ぶつかる)たびに、
     一定確率(目安25%)で崩れて通路になる。崩れると
     `SaveData.foundVaultPassages` にその地方のidを追加する(既に
     見つけていれば何もしない)。崩れたタイルは以後そのダイブの中で
     ずっと通行可能(壁→通路への恒久的な書き換え。既存のタイル書き換え
     処理――例えば `plan/floor-gimmicks.md` の「おちあなの階」で床が
     変化する処理――と同じ枠組みで実装できる)。
- ヒントが無い他の壁を無差別にバンプしても何も起きない(通常の壁の
  ままで、無駄足を誘発しない)。8地方それぞれ1本だけなので、1回の
  本編踏破の中で毎回同じ手間が発生するわけではなく、めざめの階段の
  仕組み(`plan/region-expansion.md`)により**既知の地方境界から
  再開すれば、該当階だけをピンポイントで再訪できる**。

## 忘れ物蔵への入口の解放条件

`DungeonDef.unlock` にもう1つバリアントを追加する。

```ts
unlock: "always" | { minDeepest: number } | { minVillageStage: number }
  | { afterBossDefeated: string } | { allPassagesFound: true };
```

`isDungeonUnlocked` の判定用に、既存のシグネチャ拡張の前例
(`plan/archive/hidden-dungeon.md` で `villageStage` を追加したのと
同じやり方)に倣い、`foundPassageCount: number` を引数に追加する。
`"allPassagesFound" in dungeon.unlock` のときは
`foundPassageCount >= 8`(8地方すべて)で判定する。

```ts
export const LOST_AND_FOUND_VAULT_ID = "lostAndFoundVault";
{
  id: LOST_AND_FOUND_VAULT_ID,
  name: "忘れ物蔵",
  description: "誰の記憶とも紐づかない半端な品々が眠る、小さな蔵。",
  maxDepth: 5,
  unlock: { allPassagesFound: true },
}
```

## データ構造

```ts
export interface SaveData {
  // ...既存フィールド
  foundVaultPassages: string[]; // 見つけた隠し通路の地方id。例: ["region1", ...]
}
```

地方には現状専用のidが無いため(`design/regions.md` は名前だけの設定
資料)、`plan/region-expansion.md` の地方境界表の並び順に対応する
`"region1"`〜`"region8"` を暫定のidとして採用する。

## 実装への影響の見積もり

- `src/core/types.ts`: `Tile.secretPassage?: boolean` を追加。
- `src/dungeon/generate.ts`: 地方境界+1階での隠し壁付与パスを追加。
- `src/game.ts`: 隠し壁隣接時のヒントメッセージ、バンプ時の崩壊判定・
  `foundVaultPassages` への追加処理を追加。
- `src/entities/dungeons.ts`: `LOST_AND_FOUND_VAULT_ID`・`DUNGEONS`への
  追加・`unlock`型への`{ allPassagesFound: true }`追加・
  `isDungeonUnlocked`のシグネチャに`foundPassageCount`を追加(呼び出し側
  `src/ui/town.ts`の追従が必要)。
- `src/save.ts`: `SaveData.foundVaultPassages: string[]` を追加。
  `initialSave()`・`loadSave()`のsanitize処理・save-compat用の新
  フィクスチャ(`plan/archive/save-compat-testing.md`の手順)を追加。

## 未決事項

- 忘れ物蔵5階分の具体的な地形生成パラメータ(モンスター数の削減率、
  満腹度減少倍率1.5倍の最終調整)。
- 崩壊確率25%の具体的な調整(実装後の体感で変える余地を残す)。
- 忘れ物蔵内部の報酬(刻印石・ほこら粉)の具体的なドロップテーブル。
