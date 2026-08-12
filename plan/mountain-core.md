# 山の芯(対近道屋の決着ダンジョン)

`plan/archive/multiple-dungeons.md` が「③山の芯」として実装を見送り、
「詳細な中身・決着の演出は本仕様の対象外とし、別途ストーリー実装側の
仕様書を立てて詰める」としていた宿題に着手する。`design/story.md` の
第四章「めざめの階段の、その先」、`plan/region-boss-horikuinonushi.md`
(第八地方ボス「掘り杭の主」)の撃破後に開く道、という位置づけ。

## 概要

- `design/story.md` 第四章の記述通り、通常なら地方の「めざめの階段」で
  引き返す夢の最奥、ヨリシロの意識の核に近道屋が直接手を出そうとしている
  ことが分かる場面。ガルドが仲間と共に、普段より深い特別な夢(山の芯)に
  潜って近道屋(マサカリのドンズル)と対峙する。
- `design/story.md` のトーン指針・`design/world.md` の対立構造の
  基本線どおり、**「倒す」より「山の正体を思い知らせ、出て行かせる/
  山と向き合わせる」方向を決着にする**。したがって山の芯は、新しい
  スタッツを持つボス戦(通常の地方ボスと同格の敵)としては実装せず、
  **短い固定的なダンジョン+到達時の会話イベント**として組み立てる。
  戦闘的な達成目標ではなく、物語上の到達点として設計する。

## ダンジョンとしての扱い

`plan/archive/multiple-dungeons.md` の `DungeonDef` にもう1件追加する。

```ts
export const MOUNTAIN_CORE_ID = "mountainCore";
{
  id: MOUNTAIN_CORE_ID,
  name: "山の芯",
  description: "ヨリシロの意識の核に近い、特別な夢。近道屋との決着の場。",
  maxDepth: 3,
  unlock: { afterBossDefeated: "horikuiNoNushi" },
}
```

- **「③山の芯は手作りの固定フロアを想定」としていた`multiple-
  dungeons.md`の未決事項は、既存の乱数生成をそのまま使う方向で解消する**
  (固定フロアの新規ツールを作るコストを避ける。`plan/dream-garden-
  mosaic.md`までの全ギミック実装で地形生成は十分に成熟している前提)。
  出現モンスールプールは第八地方(めざめの前庭)と同じものを流用し、
  `floorOffset`で難度だけ底上げする(`plan/archive/multiple-dungeons.md`
  の「近道屋の裏穴」と同じ仕組みの再利用)。
- `maxDepth: 3` の短いダンジョン。「普段より深い特別な夢」という位置づけ
  だが、実際の階数は短く保つ(`design/balance-philosophy.md` の
  プレイ時間目標を圧迫しないため)。

## 解放条件: `{ afterBossDefeated: string }`

`DungeonDef.unlock` の型に新しいバリアントを追加する。

```ts
unlock: "always" | { minDeepest: number } | { minVillageStage: number }
  | { afterBossDefeated: string };
```

判定には新規の `SaveData.defeatedRegionBosses: string[]` を使う
(`speciesId` を保持する配列。初出のIDだけ追加し、重複しない)。
`isDungeonUnlocked` に `"afterBossDefeated" in dungeon.unlock` の分岐を
追加し、`defeatedRegionBosses.includes(dungeon.unlock.afterBossDefeated)`
で判定する。

`SaveData.defeatedRegionBosses` は、`killActor`(`src/game.ts`)が
`isRegionBoss` な種族を倒した際に、既存の `bossGuaranteedDrop` 処理の
隣に「まだ記録されていなければ追加する」処理を足すだけで実装できる。
この記録は**`design/postgame.md` が「真の目覚め」の解放条件の1つに
挙げている「全地方ボス撃破」の判定にもそのまま使い回せる**(未実装
だった判定手段を、山の芯の実装が副産物として提供する形になる)。

## 最終フロア(3階)到達時のイベント

- 3階の階段部屋に到達すると、通常の階段処理の代わりに**固定の会話
  イベント**(既存の `GameEvent`(`type: "message"`)の連続再生で実装
  できる、新しいUIコンポーネントは増やさない)が発生する。
- 内容の骨子(`design/characters.md` の頭目マサカリのドンズルを踏まえる):
  ドンズルが山を「ただの資源」として掘り続けようとする→ガルドが
  ヨリシロの正体・山が生きていることを伝える→ドンズルが動揺し、
  掘削をやめて村を去る(または改心を示唆する)、という短い掛け合い。
  台詞の実際の執筆は本文書のスコープ外とし、`design/characters.md`・
  `design/flavor-details.md` を参照して別途詰める。
- イベント終了後、そのダイブは自動的に「踏破」扱いになり、拠点へ戻る
  (既存の踏破処理をそのまま流用)。
- **`SaveData` に `storyCleared: boolean` を新設し、このイベントを
  経験した時点で `true` にする。** `design/postgame.md` が前提とする
  「物語クリア」の判定手段として使う(現状は`villageStage`を代替指標に
  していたが、山の芯の実装によって初めて「物語クリア」を直接判定できる
  ようになる)。

## 実装への影響の見積もり

- `src/entities/dungeons.ts`: `MOUNTAIN_CORE_ID`・`DUNGEONS`への追加・
  `unlock`型への`{ afterBossDefeated: string }`追加・
  `isDungeonUnlocked`への分岐追加。
- `src/save.ts`: `SaveData.defeatedRegionBosses: string[]`・
  `SaveData.storyCleared: boolean` を追加。`initialSave()`・
  `loadSave()`のsanitize処理・save-compat用の新フィクスチャ
  (`plan/archive/save-compat-testing.md`の手順に従う)を追加。
- `src/game.ts`: `killActor`にボス撃破の記録処理を追加。3階到達時の
  会話イベント発火処理を追加(既存の階段処理と分岐)。
- `src/main.ts`: 会話イベント再生後の踏破処理・`storyCleared`の保存を
  追加。

## 未決事項

- 会話イベントの実際の台詞・掛け合いの執筆。
- ドンズルの手下(穴掘りのソバカス、`design/characters.md`)がこの場面に
  同席するか、既に退場している設定にするかの物語上の詳細。
- `storyCleared` が既存の `villageStage: 4`(`plan/village-stage-
  rebalance.md`)と厳密に同時に立つかどうか(山の芯は表の寝穴
  完全踏破+掘り杭の主撃破が前提のため、実質的にほぼ同じタイミングに
  なる見込みだが、両者を別フィールドとして持たせておくことで将来の
  ズレ(例: 村の発展を後回しにするプレイ)に対応できる余地を残す)。
