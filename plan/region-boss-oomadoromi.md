# 第三地方ボス: オオマドロミ

`plan/archive/region-bosses.md` の共通仕様の上に、第三地方(まどろみの
茸林・18階)のボス「オオマドロミ」を実装可能な形で確定させる。
`plan/region-expansion.md`・`plan/spore-grove.md`(眠りの胞子)を前提
とする。

## 概要

巨大なマドロミダケ。予兆つきの大技は**部屋全体への眠りの胞子放出**。
`plan/spore-grove.md` で定めた「ばくはつタルで胞子を吹き飛ばせる」を、
**予兆の解除**という形でボス戦にも持ち込む。`plan/archive/
region-bosses.md` が「タル活用の集大成」と位置づけていたものを、
既存の仕組みの組み合わせだけで実現する。

## 既存の仕組みとの差分(拡張ポイント)

`oonebosuke`・`plan/region-boss-nushigaeru.md` のヌシガエルは、大技の
効果が「隣接攻撃の強化版(`empowered`)」に固定されていた。オオマドロミの
大技は**隣接攻撃ではなく、部屋全体への睡眠付与**なので、`bossTelegraph`
に効果種別を1つ追加する。

```ts
export interface Species {
  bossTelegraph?: {
    message: string;
    multiplier: number; // aoeSleepでは未使用(既存互換のため型は変えない)
    cooldownTurns: number;
    activateBelowHpRatio?: number; // plan/region-boss-nushigaeru.mdで追加済み
    /**
     * 大技の効果種別。省略時は"targetedStrike"(既存の隣接攻撃強化、
     * oonebosuke/nushigaeruと完全互換)。"aoeSleep"は自分のいる部屋の
     * 全アクター(敵味方問わず)に睡眠を付与する、隣接攻撃を伴わない
     * 発動に変わる。
     */
    effect?: "targetedStrike" | "aoeSleep";
  };
}
```

## 大技の発動(aoeSleep)

- 既存の予兆状態機械(`decideMonsterAction`)はそのまま使う。
  `telegraphCharge` が立った次のターン、`effect: "aoeSleep"` の場合は
  `MonsterAction` を新設の `{ type: "boomAoeSleep" }` にする(既存の
  `"attack"` + `empowered` は使わない。隣接している必要がないため)。
- `game.ts` の新しい `"boomAoeSleep"` ケースは、`plan/spore-grove.md` の
  胞子パルスと同じ判定ロジック(部屋の在室者全員に `chance`/`turns` で
  睡眠付与)を、ボスの現在の部屋に対して1回だけ即時実行する
  (胞子パルスの `sporeTimer` とは独立。ボス部屋は `spored` を持たない
  ため両者は競合しない)。
- 通常攻撃(隣接時の素の`melee`相当)は据え置きで、大技はあくまで
  クールダウン(既定3ターン)ごとの特別な一手として扱う
  (`plan/archive/region-bosses.md` の共通仕様どおり)。

## 大技の解除(ばくはつタルによる無効化)

- `plan/spore-grove.md` で `explode()` に追加する「爆心の部屋の`spored`を
  解除する」処理の隣に、**爆心と同じ部屋に、予兆中(`telegraphCharge:
  true`)のボスがいれば `telegraphCharge` を `false` に戻し、
  `telegraphCooldown` はそのまま(再度予兆からやり直しになるが、
  連発を防ぐクールダウン自体は消費済み扱いにする)という1条件を追加する。
- 発動が解除された際のメッセージ(例:「大技の気配が霧散した!」)を
  `explode()` の既存メッセージ列に追加する。
- 予兆が出ていない(まだ`telegraphCharge`が立っていない)タイミングで
  ばくはつタルを当てても、この解除処理は発生しない(通常の爆発ダメージ
  だけが入る)。「予兆が出た直後に」というタイミング limiting は、
  `telegraphCharge` フラグの有無で自然に表現できる。

## データ

```ts
{
  id: "oomadoromi",
  ai: "melee",
  minFloor: Number.POSITIVE_INFINITY,
  weight: 0,
  isRegionBoss: true,
  bossTelegraph: {
    message: "身体中から胞子が立ちのぼりはじめた",
    multiplier: 1, // aoeSleepでは未使用
    cooldownTurns: 4,
    effect: "aoeSleep",
  },
  bossGuaranteedDrop: "oomadoromiHoushi", // オオマドロミの胞子玉(新規素材)
}
```

## 実装への影響の見積もり

- `src/core/types.ts`: `Species.bossTelegraph.effect?: "targetedStrike" |
  "aoeSleep"` を追加。
- `src/entities/ai.ts`: `MonsterAction` に `{ type: "boomAoeSleep" }` を
  追加。ボス分岐で `effect === "aoeSleep"` のときの発動アクションを
  切り替える1条件を追加(それ以外の分岐は変更しない)。
- `src/game.ts`: `"boomAoeSleep"` ケースを追加(`plan/spore-grove.md` の
  部屋内睡眠付与ロジックを関数として共有できるとよい)。`explode()` に
  「同じ部屋の予兆中ボスの `telegraphCharge` を解除する」処理を追加。

## 未決事項

- HP・攻撃力・防御力の具体値(`plan/archive/region-bosses.md` の
  共通仕様の基準から算出)。
- `oomadoromiHoushi`(確定ドロップ素材)の用途。
- 睡眠付与の`chance`/`turns`の具体値(`plan/spore-grove.md` の通常の
  胞子部屋と同じにするか、ボス戦用に強めにするかは実装時の体感で
  調整する)。
- 3Dモデルの新規制作要否(`madoromi` の拡大流用で妥協するかの判断)。
