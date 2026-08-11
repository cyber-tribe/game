# ヨリシロの気分

`plan/floor-gimmicks.md`(1フロア単位)、`design/regions.md`(地方単位で
固定)に続く、3つ目の変化のレイヤーとして、**そのダイブ全体にかかる
「今日のヨリシロの気分」** を導入する。人間も眠りが浅い日・深い日が
あるように、ヨリシロの眠りの質もその日ごとに違う、という設定にする。

## 決め方

**実行中の端末の日付から一意に決まる**(`YYYY-MM-DD` をハッシュして
気分IDを選ぶ)。サーバーを持たないこのゲーム(README記載の通り
`localStorage` だけで動く)でも、追加インフラなしに「今日はこの気分」を
全プレイヤー共通で提示できる。日付が変わるまで、その日の全ダイブは
同じ気分で統一される。

## 気分の一覧(初期案)

いずれも「難しくなる代わりに得るものが増える/易しくなる代わりに
得るものが減る」の**帳尻を必ず合わせる**(`design/balance-philosophy.md`
のリスク・リターン原則)。「今日は損な日」にしないことが重要。

| 気分 | 効果 | 帳尻 |
|---|---|---|
| おだやかな寝息(既定) | 補正なし | ― |
| 浅い眠り | モンスターがプレイヤーに気づく距離が縮む(遭遇しにくい) | ドロップ量がやや少なめ。安全運転向けの日 |
| 深い眠り | モンスターの気づきが遅い代わりに、気づいたあとの攻撃力が上がる | 不意打ちのチャンスが広がる。じっくり戦略を練るプレイに向く |
| 寝苦しい夜 | `plan/floor-gimmicks.md` の出現率、`plan/monster-house.md` の出現率がともに上昇 | 金・ドロップ率も上昇。「今日は荒れるが稼げる日」 |
| 虫の知らせ | `plan/monster-compendium.md` の「かがやきの夢のかけら」出現率が上昇 | 通常ドロップはやや控えめ。図鑑・レア狙いの日 |
| 近道屋の気配 | `plan/shops-and-thieves.md` の店・泥棒の出現率がともに上昇 | 店の品揃えが良くなる。金策と警戒を同時に迫られる日 |

## 表示

拠点(ネンネ村)の出発前画面に、今日の気分を短いフレーバー文とアイコンで
表示する。強制ではなく、**行くかどうかをプレイヤーが選べる情報**として
出す。「今日は寝苦しい夜だから、荒れるの覚悟で稼ぎに行こう」といった
判断材料にする。

## データ構造

```ts
export type MoodId =
  | "calm" | "shallow" | "deep" | "restless" | "omen" | "chikamichi";

export interface MoodDef {
  id: MoodId;
  name: string;
  flavorText: string;
  awareDistanceMul?: number;
  monsterAtkMulAfterAware?: number;
  floorGimmickRateMul?: number;
  monsterHouseRateMul?: number;
  rareSpawnRateMul?: number;
  shopRateMul?: number;
  thiefRateMul?: number;
  dropRateMul?: number;
  goldRateMul?: number;
}

export function moodForDate(dateKey: string): MoodId { /* ハッシュして選ぶ */ }
```

`plan/multiple-dungeons.md` の `DungeonDef` が持つ `monsterHouseRateMul`
`shopRateMul` などと**同じ名前・同じ意味の係数**を使い、実装側は
「地方の基礎値 × 気分の係数 × (フロアギミックがあればさらにその係数)」
という単純な掛け算で全レイヤーを合成できるようにする。仕組みを増やすたびに
専用の分岐を増やさない、という実装コスト面の配慮でもある。

## この機能が担う役割

`design/balance-philosophy.md` で掲げた「深く潜る以外の目的を常に併存させる」
「同じ地方・同じ階でも潜るたびに何かが変わる」という2つの方針の、
**最も上位のレイヤー**にあたる。地方(固定)→気分(日替わり)→
フロアギミック(毎回抽選)という3層構造にすることで、同じ地方を
何度潜っても「今日はどんな日か」という体感の違いが常にある状態を作る。

## 未決事項

- 各気分の係数の具体値は実装後の体感で調整する。
- 日付をまたいでダイブ中だった場合の扱い(そのダイブ内は開始時の気分で
  固定する、という単純なルールを基本線とする)。
- 気分そのものを図鑑的に記録して「まだ見ていない気分」を可視化するかは
  今後の検討課題とする。
