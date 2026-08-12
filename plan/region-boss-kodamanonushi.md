# 第六地方ボス: こだまの主

`plan/archive/region-bosses.md` の共通仕様の上に、第六地方(こだまの
尾根・36階)のボス「こだまの主」を実装可能な形で確定させる。
`plan/region-expansion.md`・`plan/echoing-ridge.md`(物音)を前提とする。
これまでの4体(`plan/region-boss-nushigaeru.md`〜`plan/region-boss-
fuchinonushi.md`)と異なり、大技の効果が**状態異常や地形ではなく、
分身の召喚**になる、初めてのパターン。

## 概要

物音がよく響く尾根に棲み着いた、繰り返す記憶そのもの。予兆つきの大技は
**こだまの分身**で、発動されると自分と同じ姿の分身を2体呼び出す。
本体と分身は**HPを共有**し、分身の攻撃力は低い。

## 分身とHP共有の実装方針

新しい仕組みとして `Actor.sharesHpWith?: number`(共有先のアクターid)
を追加する。

- 大技が発動すると、本体の隣接マスに2体の分身(`speciesId`は本体と
  同じ `kodamaNoNushi`、`sharesHpWith: <本体のactor id>`)を生成する。
- **ダメージ計算そのものは変更しない。** 分身に与えたダメージは、
  ダメージ適用処理(`src/game.ts` の `damageActor`)の冒頭で
  `sharesHpWith` を見て、実際に `hp` を減らす対象を本体側の `Actor`
  に差し替えるだけで実現する(分身自身の `hp` フィールドは表示用に
  本体と同じ値をミラーしておく程度で、実際の増減判定には使わない)。
- **単体attack**(通常のプレイヤーの1回の攻撃、大鉈の薙ぎ払いのような
  範囲攻撃を除く)は、命中した1体ぶんだけダメージが共有HPに入る。
  **範囲攻撃**(`plan/protagonist-weapons.md` の大鉈系、ばくはつタルの
  巻き込み等、複数アクターに同時ヒットする既存の仕組み)が本体+分身の
  複数体を同時に巻き込んだ場合は、**巻き込んだ体数ぶん、共有HPへの
  ダメージが複数回入る**(1体ずつ通常通りダメージ計算されるだけで、
  特別な合算処理は不要。既存の範囲攻撃の実装が「巻き込んだ全アクターに
  個別にダメージを適用する」形になっていれば、そのまま矛盾なく動く)。
  これが「本体を狙い続けるか、分身ごと巻き込む範囲攻撃で押し切るかの
  選択」を実装レベルで自然に成立させる。
- **共有HPが0になった時点で、本体・分身のすべてが同時に撃破される**
  (`sharesHpWith` で紐づく全アクターの生死判定を、本体の `hp` を基準に
  まとめて行う)。分身だけを個別に「倒す」という概念は作らない
  (分身はあくまで幻影で、実体を持たないという世界観上の理屈にも合う)。
- 分身の攻撃力は本体の50%程度(`plan/region-boss-nushigaeru.md` 等と
  同様、既存の攻撃力パラメータを分身生成時に下げるだけで実装できる)。
- クールダウン(既定4ターン程度)後、既存の分身がまだ生きていれば
  重複召喚はしない(最大2体までを維持する)、既に呼んだ分身が
  (何らかの理由で)場を離れていれば再度2体になるよう補充する、という
  単純な上限管理にする。

## データ

```ts
{
  id: "kodamaNoNushi",
  ai: "melee",
  minFloor: Number.POSITIVE_INFINITY,
  weight: 0,
  isRegionBoss: true,
  bossTelegraph: {
    message: "声がいくつにも重なって聞こえはじめた",
    multiplier: 1, // summonEchoでは未使用
    cooldownTurns: 4,
    effect: "summonEcho",
  },
  bossGuaranteedDrop: "kodamaNoKakera", // こだまのかけら(新規素材)
}
```

`bossTelegraph.effect` に `"summonEcho"` を追加する
(`"targetedStrike" | "aoeSleep" | "aoeSeal" | "summonTorrent" |
"summonEcho"`)。

## 実装への影響の見積もり

- `src/core/types.ts`: `Actor.sharesHpWith?: number` を追加。
  `Species.bossTelegraph.effect` に `"summonEcho"` を追加。
- `src/entities/ai.ts`: `MonsterAction` に `{ type: "summonEcho" }` を
  追加。
- `src/game.ts`:
  - `"summonEcho"` ケース(分身2体の生成、既存の`createMonster`相当の
    仕組みを流用し、`sharesHpWith`・攻撃力50%を設定するだけ)。
  - `damageActor` の冒頭に、`sharesHpWith` があればダメージ適用先を
    差し替える分岐を追加。
  - 死亡判定に、`sharesHpWith` で紐づく全アクターをまとめて処理する
    分岐を追加。

## 未決事項

- HP・攻撃力・防御力の具体値。
- `kodamaNoKakera`(確定ドロップ素材)の用途。
- 分身の見た目(半透明にする等の演出)は3Dモデル・描画側の対応が必要な
  可能性があり、本文書のスコープ外とする。見た目の差がなくても
  `sharesHpWith` の挙動自体は成立するため、演出は実装時の余力次第とする。
