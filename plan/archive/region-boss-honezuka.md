> **実装済み。**
> `src/core/types.ts`(`Species.bossTelegraph.effect` に `"aoeSeal"` を
> 追加)、`src/entities/ai.ts`(`MonsterAction` に `{ type: "boomAoeSeal" }`
> を追加。ボス分岐で `effect === "aoeSeal"` のときは `boomAoeSeal` を
> 返す)、`src/entities/species.ts`(`honezukaNoNushi` を追加、
> `REGION_BOSS_FLOORS[24]` / `REGION_BOSS_ORDER` に登録)、
> `src/items/catalog.ts`(`honezukaKotsuban` を追加)、`src/game.ts`
> (`"boomAoeSeal"` ケースを追加。本文書が提案したとおり、
> `applySleepPulse` を `applyRoomWideStatus(occupants, kind, chance,
> turns, verb, events)` に一般化し、`tickSporeRooms`・`"boomAoeSleep"`・
> `"boomAoeSeal"` の3箇所で共有)に実装した。`explode()` の
> 予兆解除処理(`plan/region-boss-oomadoromi.md`で追加済み)はボス種族を
> 問わず`telegraphCharge`を見る作りだったため、変更なしでそのまま
> このボスにも効く。テストは `tests/region-boss-honezuka.test.ts`
> (11件)。
>
> 実装時の判断:
> - **モデル**: 新規3Dモデルは作らず、`honegarami` をそのまま流用した
>   (`oonebosuke`/`nushigaeru`/`oomadoromi`の前例に合わせた判断)。
> - **共有関数のリネーム**: 本文書の提案どおり、既存の`applySleepPulse`を
>   `applyRoomWideStatus`という汎用名に改名・一般化した(睡眠専用だった
>   引数を`kind`/`chance`/`turns`/`verb`に開いた)。
> - **HP・攻撃力・防御力**: 防御特化という位置づけを反映し、第四地方
>   雑魚最上位種(`honegarami`: HP48・atk20・def16)を基準に、HPは
>   共通仕様どおり2倍程度(96)、攻撃力は控えめに1.2倍(24)、防御力は
>   共通仕様の目安を超えて2.5倍(40)に振った。
> - **封じのchance/turns**: 未決事項どおり、`plan/spore-grove.md`/
>   `plan/region-boss-oomadoromi.md`と同じ値(chance0.6・turns3)を
>   そのまま使い、ボス戦専用に強めの値は設けなかった。

# 第四地方ボス: ホネヅカのぬし

`plan/archive/region-bosses.md` の共通仕様の上に、第四地方(骨積みの
回廊・24階)のボス「ホネヅカのぬし」を実装可能な形で確定させる。
`plan/region-expansion.md`・`plan/bonepile-corridor.md`(狭い回廊)を
前提とする。`plan/region-boss-oomadoromi.md` が `bossTelegraph.effect`
に導入した拡張の仕組みをそのまま流用する。

## 概要

無数のホネガラミが積み重なってできた巨体。防御力が高く、通常攻撃だけで
削るには時間がかかる。予兆つきの大技は**部屋全体への封じ(seal)付与**で、
発動されると一定ターン道具・杖が使えなくなる。回廊の狭さもあって
`plan/archive/companion-orders.md` の「そこで待て」(`AllyStance:
"hold"`)で仲間に足止めさせ、隙を作る立ち回りが機能する場を意識する。

## 既存の仕組みとの差分(拡張ポイント)

`plan/region-boss-oomadoromi.md` で `bossTelegraph.effect` に
`"aoeSleep"` を追加したのと同じ形で、`"aoeSeal"` を追加する。

```ts
effect?: "targetedStrike" | "aoeSleep" | "aoeSeal";
```

発動時の対象・判定は `"aoeSleep"` と同じ(ボスのいる部屋の全アクターに
付与)で、付与する状態が `STATUS_SLEEP` ではなく既存の `STATUS_SEAL`
になるだけの違い。`MonsterAction` に `{ type: "boomAoeSeal" }` を追加し、
`game.ts` 側は `"boomAoeSleep"` ケースとほぼ同じ処理を `STATUS_SEAL` で
行う(実装時、2ケースを1つの共通関数
`applyRoomWideStatus(kind, chance, turns)` にまとめてよい)。

## 立ち回りとの接続

- `plan/archive/companion-orders.md` の「そこで待て」で、狭い回廊の
  入り口に仲間を置けば、ホネヅカのぬしの接近・退路を部分的に塞げる
  (`plan/bonepile-corridor.md` の1マス幅回廊が前提)。**新しい仕組みは
  追加しない**――既存の`hold`スタンスと、既存の狭い通路の生成が
  組み合わさった結果として立ち回りが生まれる、という設計にする。
- 封じ(seal)状態は既存の効果(道具・杖が使えなくなる)をそのまま使う。
  ボス戦専用の特別な封じ効果は作らない。

## データ

```ts
{
  id: "honezukaNoNushi",
  ai: "melee",
  minFloor: Number.POSITIVE_INFINITY,
  weight: 0,
  isRegionBoss: true,
  // 防御力を雑魚最上位種(honegarami)よりさらに高めに設定する
  // (未決事項の数値算出を参照)
  bossTelegraph: {
    message: "古い骨がガタガタと震えはじめた",
    multiplier: 1, // aoeSealでは未使用
    cooldownTurns: 5, // 封じは行動権を奪う強い効果のため、他ボスより長めのクールダウンにする
    effect: "aoeSeal",
  },
  bossGuaranteedDrop: "honezukaKotsuban", // ホネヅカの骨盤(新規素材)
}
```

`cooldownTurns` を他ボス(3〜4)より長い5にしているのは、封じが
「行動そのものを奪う」強い妨害効果であるため、`plan/archive/
region-bosses.md` の「理不尽さの質が変わらない」方針に沿って頻度を
下げるための調整。

## 実装への影響の見積もり

- `src/core/types.ts`: `Species.bossTelegraph.effect` の型に `"aoeSeal"`
  を追加(`plan/region-boss-oomadoromi.md` で追加した型をさらに拡張)。
- `src/entities/ai.ts`: `MonsterAction` に `{ type: "boomAoeSeal" }` を
  追加。ボス分岐で `effect` に応じて `boomAoeSleep`/`boomAoeSeal` を
  切り替える。
- `src/game.ts`: `"boomAoeSeal"` ケースを追加(`STATUS_SEAL` を対象範囲へ
  付与するだけで、既存の封じ処理・メッセージをそのまま使う)。

## 未決事項

- HP・攻撃力・防御力の具体値(防御特化という位置づけを反映した配分)。
- `honezukaKotsuban`(確定ドロップ素材)の用途。
- 封じの`chance`/`turns`の具体値。
- 3Dモデルの新規制作要否(`honegarami` を積み上げたような造形が本文の
  意図に近いが、既存モデルの流用で妥協するかは実装時の判断に譲る)。
