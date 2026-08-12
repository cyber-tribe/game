> **実装済み。**
> `src/core/types.ts`(`Actor.mirrorOf?: number` / `Actor.mirrorTurnsLeft?:
> number` を追加。`Species.bossTelegraph.effect` に `"summonMirror"` を
> 追加)、`src/entities/ai.ts`(`MonsterAction` に `{ type: "summonMirror" }`
> を追加。`decideMonsterAction` の冒頭で `monster.mirrorOf !== undefined`
> のときは常に`{ type: "wait" }`を返すガードを追加し、幻影が自分からは
> 一切行動しないようにした。ボス分岐で`effect === "summonMirror"`の
> ときは`summonMirror`を返す)、`src/entities/species.ts`
> (`misemonoNoNushi` を追加、`REGION_BOSS_FLOORS[42]` /
> `REGION_BOSS_ORDER` に登録)、`src/items/catalog.ts`
> (`misemonoNoOmen` を追加)、`src/game.ts` に実装した。
> テストは `tests/region-boss-misemonononushi.test.ts`(13件)。
>
> `src/game.ts` の実装詳細:
> - `"summonMirror"`ケース: `freeSpotNear`で本体の周囲に幻影を1体ずつ
>   生成しては即座に`floor.actors`へ積む(3体まとめて座標計算してから
>   一括で積むと、まだ配置していない座標同士が衝突する恐れがあるため、
>   1体ごとに配置→登録を繰り返す形にした)。`actor.mirrorTurnsLeft`を
>   5にセットする。
> - `resolvePlayerAttack`のヒット判定ループに、対象が`mirrorOf`を
>   持つ幻影だった場合の分岐(即座に`floor.actors`から除去・
>   「――そっちは幻だった!」・本体からプレイヤーへの反撃1回)を追加。
>   本体への命中時は、命中処理の直後に`mirrorOf === target.id`の
>   幻影を全除去する処理を追加。
> - `tickMirrors`を新設し、`upkeep()`から毎ターン呼んで
>   `mirrorTurnsLeft`を減らし、0になったら残っている幻影を自然消滅
>   させる(膠着状態を防ぐ安全弁)。
>
> モデルは新規制作せず、第七地方雑魚最上位種`kazaridaruma`と同じ
> `honegarami`を流用した。HP・攻撃力・防御力は`kazaridaruma`
> (HP80・atk24・def26)を基準に共通仕様で算出した(HP152・atk31・def34)。

# 第七地方ボス: 見世物のぬし

`plan/archive/region-bosses.md` の共通仕様の上に、第七地方(わすれられた
祭りの跡・42階)のボス「見世物のぬし」を実装可能な形で確定させる。
`plan/region-expansion.md`・`plan/festival-mirage.md`(偽の階段・タル)
を前提とする。`plan/region-boss-kodamanonushi.md`(こだまの主、HP共有の
分身)とは異なる、**「本物を選び当てる」当てもの**の駆け引きを実装する。

## 概要

かつての賑わいの記憶が歪んでできた、祭りの呼び込みのような姿の異形。
予兆つきの大技は**見世物の入れ替わり**で、発動されると自分そっくりの
幻影が周囲に並ぶ。本物を選んで攻撃しないと大技が発動し、外すと反撃を
受ける。`plan/festival-mirage.md`(偽の階段・タル)と同じ「見た目では
区別できない偽物」というモチーフを、ボス戦の駆け引きに昇華させたもの。

## こだまの主(分身・HP共有)との違い

`plan/region-boss-kodamanonushi.md` の分身は**どれを攻撃しても等しく
共有HPにダメージが入る**(区別に意味がない)のに対し、見世物のぬしの
幻影は**本物と偽物が明確に区別され、外すと反撃を受ける**。似た「複数体
出現」の演出だが、駆け引きの性質が逆になるよう意図的に書き分けている。

## 仕組み

`Actor` に `mirrorOf?: number`(本物のactor id。幻影に設定する)を
追加する。

- 大技が発動すると、本体の周囲に幻影を3体生成する(本体+幻影3体の
  計4体が並ぶ)。各幻影は `mirrorOf: <本体のactor id>` を持つ。見た目・
  ステータス表示は本体と同一にする(`plan/festival-mirage.md` と同じ
  「見た目だけでは区別できない」設計)。
- **幻影を攻撃すると**: ダメージは一切発生させず、その幻影は消える
  (`alive: false` 相当の即時除去)。代わりに、**本体からプレイヤーへ
  反撃**(既存の通常攻撃と同じダメージ計算を1回、本体視点で発動)が
  入り、「――そっちは幻だった!」というメッセージを出す。
- **本体を攻撃すると**: 通常通りダメージが入り、残っている幻影は
  すべて即座に消える(「見破られた」演出として、`mirrorOf` を持つ
  アクターを全除去する)。
- 幻影は自分からは攻撃してこない(`ai`判定に幻影用の分岐は作らず、
  行動そのものをスキップする単純な待機状態にする。新しいAI種別は
  増やさない)。
- 一定ターン(目安5ターン)経過しても本体を当てられない場合は、幻影が
  自然に消え通常状態へ戻る(膠着状態を防ぐ安全弁)。

## データ

```ts
{
  id: "misemonoNoNushi",
  ai: "melee",
  minFloor: Number.POSITIVE_INFINITY,
  weight: 0,
  isRegionBoss: true,
  bossTelegraph: {
    message: "呼び込みの声がいくつにも分かれて聞こえた",
    multiplier: 1, // summonMirrorでは未使用
    cooldownTurns: 5, // 外すと反撃を受ける強い駆け引きのため、他ボスより長めに
    effect: "summonMirror",
  },
  bossGuaranteedDrop: "misemonoNoOmen", // 見世物の面(新規素材)
}
```

`bossTelegraph.effect` に `"summonMirror"` を追加する
(`"targetedStrike" | "aoeSleep" | "aoeSeal" | "summonTorrent" |
"summonEcho" | "summonMirror"`)。

## 実装への影響の見積もり

- `src/core/types.ts`: `Actor.mirrorOf?: number` を追加。
  `Species.bossTelegraph.effect` に `"summonMirror"` を追加。
- `src/entities/ai.ts`: `MonsterAction` に `{ type: "summonMirror" }` を
  追加。幻影(`mirrorOf` を持つアクター)は行動決定そのものをスキップし
  常に待機する分岐を追加。
- `src/game.ts`:
  - `"summonMirror"` ケース(幻影3体の生成)。
  - プレイヤーの攻撃処理に、対象が `mirrorOf` を持つ幻影だった場合の
    分岐(ダメージ無効化・対象の除去・本体からの反撃1回)を追加。
  - 本体への命中時、残る幻影を全除去する処理を追加。
  - 5ターン経過での幻影の自然消滅処理を追加。

## 未決事項

- HP・攻撃力・防御力の具体値。
- `misemonoNoOmen`(確定ドロップ素材)の用途。
- 幻影の並び方(本体を含む4体をどう配置するか。プレイヤーから見て
  完全にランダムな順にするか、規則的に並べるかは実装時の判断に譲る)。
- 3Dモデルの新規制作要否。幻影は本体と全く同じ見た目でよい(区別
  できないことが前提のため、専用モデルは不要)。
