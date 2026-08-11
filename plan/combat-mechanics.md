# 戦闘の深掘り(会心・不意打ち・身構え)

`src/systems/combat.ts` の既存実装を確認すると、ダメージ計算はすでに
「攻撃力 − 守備力/2」を基本に、**1/32の確率で守備力を無視する会心の
一撃**が実装済みだった。ここまでの文書(`plan/protagonist-weapons.md`
の双樽鉤の「会心率+15%」、`plan/monster-compendium.md` のホロホロチョウの
「flutterDodge」等)はこの上に乗る前提で書いていたので、**土台となる
戦闘の基礎ルールをここで一度明文化**し、既存の1/32という数値・計算式は
変えずに拡張する。

## 会心率の拡張

- 基準値は既存のまま **1/32(約3.1%)**。
- `plan/protagonist-weapons.md`(双樽鉤)・`plan/equipment-forging.md`
  (今後の印)などが加える会心率ボーナスは、この基準値に**単純加算**する。
- 合計値の上限を **20%** とする(`design/balance-philosophy.md` の
  パワーバジェット方針。会心が戦闘の主軸になりすぎないための歯止め)。
- 会心の処理自体(守備力を無視する)は既存の `computeDamage` の分岐を
  そのまま使い、確率(引数)だけを呼び出し側で調整できるようにする。

## 不意打ち(新規)

**まだプレイヤーに気づいていない(`aware: false`)モンスターへの攻撃は、
必ず会心の一撃として処理する。**

- 実装コストが低い: `computeDamage` を呼ぶ際、対象が `!aware` であれば
  `critical` を確定させるだけでよい(既存の会心処理をそのまま流用)。
- 世界観・既存ギミックとのつながりが強い:
  - `plan/monster-compendium.md` の `madoromi`(眠り付与)・`sleep`状態は、
    相手を `aware` から遠ざける効果としても機能する(眠っている相手は
    気づけない)。眠らせてから殴る、という手順に新しい報酬ができる。
  - `plan/floor-gimmicks.md` の「ざわめきの階」(モンスターが最初から
    `aware: true` で配置される)は、この不意打ちを**封じるための
    ギミック**として意味が一段深くなる。
  - `plan/monster-compendium.md` の `ambush`(奇襲)AIのモンスターは、
    逆に**向こうから不意打ちを狙ってくる**相手として際立つ。
- プレイヤーの `plan/protagonist-arts.md` にも接続できる: 将来
  「なだめの手つき」のような技を、不意打ち中にだけ成功率を上げる、
  といった調整の余地を残す(本文書では変更しない)。

## 身構え(新規、既存の「足踏み」を拡張)

新しいキーは増やさず、既存の**足踏み(`.` / テンキー5)** に軽い防御効果を
足す。

- 足踏みを選ぶと、次に被弾するまでの間だけ**被ダメージを2割軽減**する。
- 「攻めて確実に削るか、1手待って守りを固めるか」という選択を、
  既存のコマンドの意味を広げるだけで実現する(`design/balance-philosophy.md`
  の「操作の複雑さを大きく崩さない」方針)。
- `plan/protagonist-arts.md` の「樽受け身」(被弾無効)とは効果の強さで
  差別化する(身構えは常時使える軽い保険、樽受け身はクールダウンのある
  切り札)。

## 回避(ドッジ)は共通ルール化しない

`plan/monster-compendium.md` のホロホロチョウが持つ「flutterDodge」は
**その個体・特技だけの例外的な性質**のままにし、全アクター共通の
命中率・回避率パラメータは追加しない。現状の戦闘は「当たれば必ず
ダメージが発生する」という素直な手触りが土台にあり、そこに共通の
乱数判定をもう1つ足すと既存の会心・状態異常の乱数と絡み合って
バランス検証が難しくなるため(`design/balance-philosophy.md` の
「検証の考え方」に沿い、乱数要素は絞る)。

## データ構造

```ts
// computeDamage の呼び出し側(戦闘解決処理)に手を入れる
function resolveAttack(rng: Rng, attacker: Actor, target: Actor, critBonus: number): DamageResult {
  const forcedCritical = !target.aware; // 不意打ち
  const critRate = Math.min(0.20, 1 / 32 + critBonus);
  return computeDamage(rng, totalAttack(attacker), totalDefense(target), {
    forceCritical: forcedCritical,
    critRate,
  });
}

// Actor に追加
guarding?: boolean; // 足踏みによる身構え中フラグ(次の被弾まで有効)
```

`computeDamage` 自体の署名を広げる形になるが、既存の呼び出し(会心1/32・
守備力無視)という結果は変えないため、既存のテスト・バランスの前提を
壊さない。

## 未決事項

- 身構えの被ダメージ軽減率(2割)の妥当性
- 不意打ちの確定会心に加えて、追加のダメージ倍率を乗せるかどうか
- 会心率20%上限に対し、将来複数の会心率ボーナス系統(装備+印+特技)が
  揃った際、単純加算のままでよいか(`design/balance-philosophy.md` の
  パワーバジェットの「同種効果の合算」ルールと合わせて実装時に再確認)
