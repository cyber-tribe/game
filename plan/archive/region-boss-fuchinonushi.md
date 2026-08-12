> **実装済み。**
> `src/core/types.ts`(`Species.bossTelegraph.effect` に
> `"summonTorrent"` を追加。`Actor.summonedTorrentTiles?: { pos: Vec2;
> expiresIn: number }[]` を追加)、`src/entities/ai.ts`
> (`MonsterAction` に `{ type: "summonTorrent" }` を追加。ボス分岐で
> `effect === "summonTorrent"` のときは `summonTorrent` を返す)、
> `src/entities/species.ts`(`fuchiNoNushi` を追加、
> `REGION_BOSS_FLOORS[30]` / `REGION_BOSS_ORDER` に登録)、
> `src/items/catalog.ts`(`fuchiNoNushiNoUroko` を追加)、`src/game.ts`
> (`"summonTorrent"` ケースを追加。ボスのいる部屋の外周タイル
> (`TILE_ROOM` のもののみ)へ、部屋の中心方向を向いた `torrent` を設定し、
> `actor.summonedTorrentTiles` に記録する。`tickSummonedTorrentTiles` を
> 新設し `upkeep()` から毎ターン呼んで `expiresIn` を減らし、0になったら
> `torrent` を `undefined` に戻す)に実装した。既存の奔流タイルの押し流し
> 処理(`plan/waterfall-torrent.md` の `applyTorrentPush`)と、`explode()`
> の予兆解除処理(`plan/region-boss-oomadoromi.md`で追加済み、ボス種族を
> 問わない作り)はどちらも変更なしでそのまま効く。テストは
> `tests/region-boss-fuchinonushi.test.ts`(11件)。
>
> 実装時の判断:
> - **モデル**: 新規3Dモデルは作らず、第五地方雑魚最上位種
>   `urumiguma`(うるみぐま)と同じ `honegarami` を流用した(これまでの
>   地方ボスの前例に合わせた判断)。
> - **一時的な奔流タイルの配置パターン**: 未決事項どおり実装時に判断し、
>   「部屋の外周全周」を選んだ(壁際タイル全周のうち `TILE_ROOM` のものに
>   限定)。各タイルの向きは、部屋の中心へ向かう方向(`dirFromDelta`で
>   機械的に算出)にした。
> - **HP・攻撃力・防御力**: 第五地方雑魚最上位種(`urumiguma`:
>   HP60・atk22・def18)を基準に、共通仕様(HP1.8〜2.2倍・攻撃力1.3倍
>   程度)で算出した(HP114・atk29・def23)。

# 第五地方ボス: 淵の主

`plan/archive/region-bosses.md` の共通仕様の上に、第五地方(なみだの
滝つぼ・30階)のボス「淵の主」を実装可能な形で確定させる。
`plan/region-expansion.md`・`plan/waterfall-torrent.md`(奔流タイル)を
前提とする。`plan/region-boss-oomadoromi.md`・`plan/region-boss-
honezuka.md` が導入した `bossTelegraph.effect` 拡張パターンを踏襲する。

## 概要

滝つぼの底に長く沈んだ、古い悲しみが形を取った巨体。予兆つきの大技は
**奔流の呼び込み**で、発動されると部屋の広い範囲に `plan/waterfall-
torrent.md` の奔流タイルが一時的に生まれ、乗っていると流される。
`design/regions.md` の第五地方のギミックをそのままボス戦に持ち込む。

## 既存の仕組みとの差分(拡張ポイント)

`bossTelegraph.effect` に `"summonTorrent"` を追加する。

```ts
effect?: "targetedStrike" | "aoeSleep" | "aoeSeal" | "summonTorrent";
```

`"aoeSleep"`/`"aoeSeal"` が状態異常を対象へ**直接付与**するのに対し、
`"summonTorrent"` は**地形を一時的に書き換える**点が異なる。

- 発動すると、ボスのいる部屋の壁際のタイル(部屋の外周に沿った一周分。
  具体的な選び方は実装時に部屋の形状から機械的に決める)に、部屋の
  中心へ向かう `torrent`(`plan/waterfall-torrent.md` で定義した
  `Tile.torrent?: Dir`)を一時的に設定する。
- 一時的に設定した奔流タイルは、**3ターン経過で自動的に元に戻す**
  (`torrent` を `undefined` に戻す)。ボスを倒す・部屋を出るなどの
  中断条件は設けず、単純な経過ターン管理だけでよい。
- 一時的な奔流タイルの管理は、ボスの `Actor` に
  `summonedTorrentTiles?: { pos: Vec2; expiresIn: number }[]` を持たせ、
  ターン処理の末尾で毎ターン `expiresIn` を1減らし、0になったタイルを
  元に戻す、という形で実装する(`plan/waterfall-torrent.md` の
  恒常的な奔流タイルの押し流し処理はそのまま流用でき、一時設置か
  常設かの違いは押し流し処理側からは区別不要)。

## 立ち回り

`plan/waterfall-torrent.md` の「乾いた場所を選んで戦う」を、ボス戦
限定でさらに強く体験させる。予兆のメッセージ(例:「あたりの水面が
渦を巻きはじめた」)の1ターンの猶予で、部屋の中央付近(奔流の影響を
受けにくい位置)へ移動する、という対応が基本になる。新しい入力・UIは
増やさない。

## データ

```ts
{
  id: "fuchiNoNushi",
  ai: "melee",
  minFloor: Number.POSITIVE_INFINITY,
  weight: 0,
  isRegionBoss: true,
  bossTelegraph: {
    message: "あたりの水面が渦を巻きはじめた",
    multiplier: 1, // summonTorrentでは未使用
    cooldownTurns: 4,
    effect: "summonTorrent",
  },
  bossGuaranteedDrop: "fuchiNoNushiNoUroko", // 淵の主のうろこ(新規素材)
}
```

## 実装への影響の見積もり

- `src/core/types.ts`: `Species.bossTelegraph.effect` に
  `"summonTorrent"` を追加。`Actor.summonedTorrentTiles?: { pos: Vec2;
  expiresIn: number }[]` を追加。
- `src/entities/ai.ts`: `MonsterAction` に `{ type: "summonTorrent" }`
  を追加。
- `src/game.ts`: `"summonTorrent"` ケース(部屋外周タイルへの `torrent`
  設定)と、毎ターンの `summonedTorrentTiles` の経過処理・復元を追加。
  `plan/waterfall-torrent.md` で実装済みの押し流し処理はそのまま使う。

## 未決事項

- HP・攻撃力・防御力の具体値。
- `fuchiNoNushiNoUroko`(確定ドロップ素材)の用途。
- 一時的な奔流タイルの具体的な配置パターン(部屋の外周全周か、一部だけか)。
- 3Dモデルの新規制作要否。
