> **実装済み。**
> `src/core/types.ts`(`Tile.crackWarning?: boolean` を追加。
> `Species.bossTelegraph.effect` に `"groundSpikes"` を追加。
> 唯一、床そのものに前兆が表示されるタイプ)、`src/core/events.ts`
> (`GameEvent` に `{ type: "crackWarning"; positions: Vec2[] }` を追加)、
> `src/entities/ai.ts`(`MonsterAction` に `{ type: "groundSpikes" }` を
> 追加。ボス分岐で`effect === "summonMirror"`の次に
> `effect === "groundSpikes"`の判定を追加)、`src/entities/species.ts`
> (`horikuiNoNushi` を追加、`REGION_BOSS_FLOORS[48]` /
> `REGION_BOSS_ORDER` の末尾に登録)、`src/items/catalog.ts`
> (`horikuiNoKuiSaki` を追加)、`src/game.ts` に実装した。
> テストは `tests/region-boss-horikuinonushi.test.ts`(13件)。
>
> `src/game.ts` の実装詳細:
> - これまで全ボス共通・メッセージのみだった`case "telegraph":`を、
>   `groundSpikes`のときだけ`markGroundSpikeWarnings(target.pos)`を
>   呼んで`crackWarning`を立てる分岐で拡張した(初めて予兆ターンに
>   タイル状態を変更するボス)。
> - ひび割れパターンは「未決事項」にあった4〜6マスの中から、
>   プレイヤーの現在位置を中心とした**十字型(中心+上下左右の5マス)**
>   に決定。`TILE_ROOM`のマスのみ対象とする。
> - `case "groundSpikes":`で全床タイルを走査し、`crackWarning`が
>   立っているマスにいるアクターにのみ`computeDamage`でダメージを
>   与え(未使用のタイルは何も起きない=回避可能)、判定後に
>   `crackWarning`を解除する。ダメージ量は`GROUND_SPIKES_DAMAGE = 26`
>   固定(`explode()`のタル爆発ダメージと同水準)。
> - プランには明記されていなかった追加対応として、`explode()`の
>   大技解除(タルによる`telegraphCharge`解除)ロジックに、同じ部屋の
>   `crackWarning`も一緒にクリアする処理を追加した。解除しないと、
>   発動されないまま`crackWarning`が床に残り続けるため。
>
> モデルは新規制作せず、`honegarami`(`yorishironozankyo`由来、本ボスで
> 4体目の流用)を使用。HP・攻撃力・防御力は`yorishironozankyo`
> (HP160・atk45・def32)を基準に共通仕様の係数(約1.9倍/約1.3倍)で
> 算出し、表の寝穴・全8地方ボスの中で最高値(HP304・atk59・def42)にした。
>
> 「山の芯」への接続(新規ダンジョンエントリ・解放条件)は本文書の
> スコープ外のまま未実装(プランに明記の通り、別文書に譲る)。また、
> `crackWarning`の3D描画(`view/`・`dungeonMesh.ts`側の可視化)も
> `plan/archive/festival-mirage.md`の前例に倣い、バックエンドの
> ゲームロジックのみのスコープとして今回は実装していない。

# 第八地方ボス: 掘り杭の主

`plan/archive/region-bosses.md` の共通仕様の上に、第八地方(めざめの
前庭・48階)のボス「掘り杭の主」を実装可能な形で確定させる。
`plan/region-expansion.md`・`plan/dream-garden-mosaic.md`(地方ギミック
の混在)を前提とする。第一〜第七地方ボス(`plan/region-boss-
nushigaeru.md` 〜 `plan/region-boss-misemonononushi.md`)に続く、
**表の寝穴・最後のボス**。

## 概要

近道屋が打ち込んだ杭が、ヨリシロの夢と混ざり合ってできた異形。
`design/story.md` の対立構造(近道屋の乱掘)を戦闘として初めて可視化する
存在。予兆つきの大技は**地面からの杭の突き上げ**で、床の特定パターン
(前もって地面のひび割れで示唆される)を避けて動く必要がある。

## これまでのボスとの違い: 目に見える予兆

第一〜第七地方ボスの予兆は、いずれもメッセージ(`bossTelegraph.message`)
だけで危険を伝えていた。掘り杭の主は**床そのものに前兆が表示される**、
初めての「地形を読む」タイプの大技にする。

`Tile` に `crackWarning?: boolean` を追加する(`plan/waterfall-torrent.md`
の `torrent`、`plan/wetland-quagmire.md` の `quagmire` と同じ位置づけの
一時的な地形属性)。

## 大技の発動(groundSpikes)

`bossTelegraph.effect` に `"groundSpikes"` を追加する
(`"targetedStrike" | "aoeSleep" | "aoeSeal" | "summonTorrent" |
"summonEcho" | "summonMirror" | "groundSpikes"`)。

1. **予兆ターン**: メッセージ(例:「足もとの地面がひび割れはじめた」)
   に加え、ボスのいる部屋の中から4〜6マスをパターンで選び
   (例: プレイヤーの現在位置を中心とした十字型・ボスを中心とした
   輪状など、実装時に1パターンに決める)、`crackWarning: true` を
   設定する。既存の描画(`GameEvent`)にひび割れ位置を含める
   (新しいイベント種別 `crackWarning`(対象マスの配列)を追加する)。
2. **発動ターン**: `crackWarning` が立っている全マスについて、
   その上にいるアクター(プレイヤー・仲間・モンスター問わず)に
   `explode()` と同等のダメージ計算(既存の `computeDamage` を再利用)
   を適用する。その後、対象マスの `crackWarning` をすべて解除する。
   マスの上に誰もいなければ何も起きない(踏まなければ回避できる、
   という設計の核)。
3. `plan/region-boss-nushigaeru.md` で導入した `activateBelowHpRatio`
   は使わない(掘り杭の主は最初から大技を使う、`oonebosuke` と同じ
   常時有効パターン)。

## 立ち回り

予兆ターンに示された `crackWarning` のマスを避けて1手動くだけで
被害を防げる、という単純明快な読み合いにする。`design/balance-
philosophy.md` の「操作の複雑さを大きく崩さない」方針に従い、
新しい操作は増やさず、既存の移動入力で対応が完結する。

## データ

```ts
{
  id: "horikuiNoNushi",
  ai: "melee",
  minFloor: Number.POSITIVE_INFINITY,
  weight: 0,
  isRegionBoss: true,
  bossTelegraph: {
    message: "足もとの地面がひび割れはじめた",
    multiplier: 1, // groundSpikesでは未使用
    cooldownTurns: 4,
    effect: "groundSpikes",
  },
  bossGuaranteedDrop: "horikuiNoKuiSaki", // 掘り杭の杭先(新規素材)
}
```

## 「山の芯」への接続について

`plan/archive/region-bosses.md` は「撃破すると`plan/multiple-dungeons.md`
の『③山の芯』への道が開く」としているが、`plan/archive/multiple-
dungeons.md` の実装記録は**③山の芯を実装していない**(「章立て
(design/story.md)自体が未実装のため」と明記)。本文書では掘り杭の主
自体のボス戦仕様までをスコープとし、山の芯への接続(新しいダンジョン
エントリの追加・解放条件)は、山の芯自体を仕様化する別の `plan/` 文書に
譲る。掘り杭の主は`REGION_BOSS_FLOORS`に48階として登録するだけで、
表の寝穴の最終ボスとして単体で成立する。

## 実装への影響の見積もり

- `src/core/types.ts`: `Tile.crackWarning?: boolean`、
  `Species.bossTelegraph.effect` に `"groundSpikes"` を追加。
- `src/entities/ai.ts`: `MonsterAction` に `{ type: "groundSpikes" }` を
  追加。予兆ターンのマス選定ロジックを追加。
- `src/game.ts`: 予兆ターンでの `crackWarning` 付与・発動ターンでの
  ダメージ適用と解除を追加。新規 `GameEvent`(`crackWarning`)を追加。

## 未決事項

- HP・攻撃力・防御力の具体値(表の寝穴の最終ボスとして、既存の全ボスの
  中で最高水準にする)。
- `horikuiNoKuiSaki`(確定ドロップ素材)の用途。
- ひび割れパターンの具体的な形状・マス数(4〜6)。
- 「山の芯」自体の仕様化・`REGION_BOSS_FLOORS`への48階登録の実施
  タイミング(本文書と同時か、別PRに分けるかは実装セッションの判断に
  委ねる)。
- 3Dモデルの新規制作要否。
