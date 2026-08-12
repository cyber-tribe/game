> **実装済み。**
> `src/core/types.ts`(`Species.bossTelegraph.activateBelowHpRatio` /
> `Species.hidesInQuagmire` を追加)、`src/entities/ai.ts`
> (`decideMonsterAction` のボス分岐に `activateBelowHpRatio` 判定を追加)、
> `src/entities/species.ts`(`nushigaeru` を追加、`REGION_BOSS_FLOORS[12]` /
> `REGION_BOSS_ORDER` に登録)、`src/items/catalog.ts`
> (`nushigaeruUroko` を追加)、`src/game.ts` に実装した。
> テストは `tests/region-boss-nushigaeru.test.ts`(12件)。
>
> 実装時の判断:
> - **モデル**: 新規3Dモデルは作らず、本文書が許容していた妥協案どおり
>   `tsubute` をそのまま(色調変更もせず)流用した。`oonebosuke` が
>   `purun` を丸ごと流用した前例に合わせた判断。
> - **STATUS_INVISIBLEの実際の効果範囲**: 本文書は「既存の判定
>   `hasStatus(target, STATUS_INVISIBLE)` がそのまま効く」と想定していたが、
>   実装時に調査したところ既存の `STATUS_INVISIBLE` は
>   `src/entities/ai.ts` の `attemptSight`(モンスターがプレイヤーを
>   発見できるかの判定)にしか効いておらず、プレイヤーからモンスターへの
>   近接攻撃を防ぐ効果は存在しなかった。そのため `resolvePlayerAttack`
>   (`src/game.ts`)に、対象が `STATUS_INVISIBLE` を持つ場合は攻撃が
>   空振りする分岐を新規に追加した。
> - **Statusのturnsの寿命**: 深みタイルの上で毎ターン `turns` を
>   上書きする際、本文書どおり `1` にすると、同じ `command()` 呼び出し内で
>   直後に走る `upkeep()` の `tickStatuses()` が即座に0まで減らして
>   ステータスを消してしまい、次のプレイヤーターン開始時点(その日の
>   `resolvePlayerCommand` が自分の `runActors` より前に判定するタイミング)
>   では既に効果が切れているというバグがあった。`turns: 2` を設定する
>   ことで、1回の `tickStatuses()` を挟んでも `turns > 0` を維持し、
>   次ターン開始時点でも有効な状態を保てるようにした。

# 第二地方ボス: ヌシガエル

`plan/archive/region-bosses.md` が定義した地方ボスの共通仕様
(予兆つきの大技・ボス階の専用生成・確定ドロップ・夢あわせの特別ルール)
の上に、第二地方(忘れ潮の湿地・12階)のボス「ヌシガエル」を実装可能な
形で確定させる。`plan/region-expansion.md`(48階への拡張)・
`plan/wetland-quagmire.md`(深みタイル)を前提とする。

## 概要

巨大なツブテガエル。HPが半分を切ると、深みタイルに身を潜める2フェーズ制。
`plan/archive/region-bosses.md` の「地方ごとのボス(初期案)」に挙げた
構想を、既存の実装(`oonebosuke`)が使っている単一の `bossTelegraph`
機構を最小限だけ拡張して再現する。

## 既存の仕組みとの差分(拡張ポイント)

`oonebosuke` は `bossTelegraph` が**戦闘開始から常に有効**(隣接した
瞬間から予兆→大技のサイクルが回る)だった。ヌシガエルは**HPが一定割合を
切るまでは大技を使わない**(フェーズ1は既存の `ranged` AIの強化版だけで
戦う)。この一点だけを、既存の型に**1フィールド追加**することで表現する。

```ts
export interface Species {
  // ...既存のフィールド
  bossTelegraph?: {
    message: string;
    multiplier: number;
    cooldownTurns: number;
    /**
     * この割合(0〜1、maxHpに対する比率)までHPが減るまでは
     * 予兆→大技のサイクルに入らない。省略時は1(常に有効。
     * 既存のoonebosukeの挙動と完全互換)。
     */
    activateBelowHpRatio?: number;
  };
}
```

`decideMonsterAction`(`src/entities/ai.ts`)のボス分岐は、この
`activateBelowHpRatio`(省略時1)を現在のHP比率と比較し、条件を満たす
までは**予兆に入らず、通常の`ai: "ranged"`と同じ判断に委ねる**だけの
1条件分岐を追加すればよい。`Actor` 側のフィールド追加は不要
(既存の `telegraphCharge`/`telegraphCooldown` をそのまま使う)。

## フェーズ1(HP > 50%): 強化版の遠隔攻撃

- `ai: "ranged"` をそのまま使う。既存の `tsubute`(ツブテガエル)と同じ
  挙動で、射程・攻撃力だけがボスとしての基準値(雑魚最上位種のHP1.8〜
  2.2倍・攻撃力1.3倍程度、`plan/archive/region-bosses.md` の共通仕様)
  になる。新規のAI分岐は不要。

## フェーズ2(HP ≤ 50%): 深みへの潜伏と跳躍

- `bossTelegraph.activateBelowHpRatio: 0.5` により、HPが半分を切った
  時点から予兆→大技のサイクルが有効になる。
- **深みタイル(`plan/wetland-quagmire.md`)の上にいる間、ヌシガエルは
  `STATUS_INVISIBLE` を毎ターン自身に付与する**(既存の
  `STATUS_INVISIBLE` をそのまま流用。プレイヤー側から狙われなくなる
  効果は既存の判定 `hasStatus(target, STATUS_INVISIBLE)` がそのまま
  効く)。深みタイルを離れると次のターンで自然に効果が切れる
  (`Status.turns` を毎ターン1で上書きし続けるだけで、追加の解除処理は
  不要)。
- 予兆(`bossTelegraph.message`, 例:「水面が大きく揺れた」)の次のターンに
  発動する大技は、既存の `empowered` 攻撃(隣接攻撃の強化版)をそのまま
  使う。「乾いた地面に留まれば回避しやすい」という設計意図は、深みタイル
  に乗っていないとボスが `STATUS_INVISIBLE` を維持できず(＝隠れられず)
  接近を許しやすくなる、という間接的な誘導で表現する。新しい当たり判定・
  範囲攻撃は実装しない(`plan/archive/region-bosses.md` の
  「新規UIを増やさない」方針を踏襲)。

## データ

```ts
{
  id: "nushigaeru",
  // model: 新規モデルが必要(tsubuteの拡大流用は見送り推奨。理由は後述)
  ai: "ranged",
  minFloor: Number.POSITIVE_INFINITY, // oonebosukeと同じくREGION_BOSS_FLOORS経由でのみ配置
  weight: 0,
  isRegionBoss: true,
  bossTelegraph: {
    message: "水面が大きく揺れた",
    multiplier: 2,
    cooldownTurns: 3,
    activateBelowHpRatio: 0.5,
  },
  bossGuaranteedDrop: "nushigaeruUroko", // ヌシガエルのうろこ(新規素材)
}
```

HP・攻撃力・防御力の具体値は、実装時点の第二地方雑魚最上位種
(`tsubute` 系統)の基準値から `plan/archive/region-bosses.md` の
共通仕様(HP1.8〜2.2倍・攻撃力1.3倍程度)で算出する(未決事項参照)。

## モデルについて

`oonebosuke` は3Dモデルを新規に作らず `purun` を流用したが、ヌシガエルは
`tsubute`(ツブテガエル)を単純拡大しただけだと「大きいだけの同じ姿」に
なり、`design/balance-philosophy.md` の「ボス戦ごとに理不尽さの質が
変わらない」という体感面の狙いと弱く噛み合わない。新規モデルの制作
(README記載のBlenderパイプライン)を推奨するが、コスト超過時は
`tsubute` の色違い(色調変更のみ)で妥協する案も許容する
(最終判断は実装時に譲る)。

## 未決事項

- HP・攻撃力・防御力の具体値。
- `nushigaeruUroko`(確定ドロップ素材)の用途
  (`plan/equipment-forging.md` 側でどの装備の素材にするか)。
- 深みタイルが存在しない状態でボス部屋に入った場合(実装順序によっては
  `plan/wetland-quagmire.md` が先に必要)のフォールバック。本文書は
  `plan/wetland-quagmire.md` 実装後に着手する前提とし、フォールバックは
  用意しない。
- 3Dモデルを新規制作するか `tsubute` の色違いで妥協するかの最終判断。
