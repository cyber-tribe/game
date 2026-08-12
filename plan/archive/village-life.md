# 村の暮らし(NPC・絆の基盤)

> **実装済み。** `src/entities/village.ts`(`VillageNpcId`・
> `VillageNpcDef`・`VILLAGE_NPCS`・`visibleVillageNpcs`)・`src/save.ts`
> (`SaveData.bonds`・`seenVillageEvents`・`lastGiftDates`、
> `raiseBond`・`markVillageEventSeen`・`giftMaterial`・
> `villageNpcBondStage`、`resolveQuests`が依頼達成数ぶんオトネの絆を
> 加算)・`src/ui/town.ts`(拠点に列16「NPCと話す」を新設。Enterで
> 話す(絆段階を初めて跨いだ会話を1回だけ再生)、Gキーで倉庫の素材
> (ほこら粉・刻印石)を献上)・`src/main.ts`(`onTalkToNpc`・
> `onGiftMaterial`コールバックの配線)。
>
> テストは `tests/village-life.test.ts`(新規14件)。既存の
> `tests/hidden-dungeon.test.ts`・`tests/save-compat.test.ts`
> (新規フィクスチャ`v7-village-life.json`)も新フィールドに合わせて
> 更新した。`npx tsc --noEmit`・`npx vitest run`(548件全て通過)・
> `npm run build`を確認済み。
>
> 実装にあたって次の判断をした。
>
> - **絆の段階(`BondStage`)の閾値は、本文が挙げた「中3・高8・最高20」
>   ではなく、既存の`bondStage`関数(仲間のなじみと同じ、中5・高15・
>   最高30)をそのまま流用した。** 本文自身が「新しい型を増やさない」
>   方針を掲げていたため、既存の閾値を変えずに使い回す方を優先した。
> - **「話す」操作は絆を上げない。** 絆は依頼達成(オトネ)・素材献上
>   だけで上がり、Enterで話す操作は「段階を初めて跨いだ会話を1回だけ
>   再生する」既読フラグの確認・記録だけを行う。
> - **NPCごとの専用のせりふプール(`DialoguePool`、`plan/flavor-and-
>   dialogue.md`)はまだ実装しない。** 段階を跨いだ瞬間の会話は
>   `onTalkToNpc`の配線だけを用意し、実際の会話文言(flavor-and-
>   dialogue.md側の仕事)は本PRのスコープ外とした。現状は
>   `seenVillageEvents`への記録のみが動く状態で、実際の会話テキスト
>   表示はflavor-and-dialogue.md実装時に追加する想定。
> - **素材献上のUIは、倉庫にある最初のほこら粉・刻印石を自動選択して
>   渡す簡易な形にした。** 未決事項どおり、献上する素材を選ぶサブ
>   メニューは作らず、Gキー1つで即座に献上する形に単純化した。

`design/village-life.md` を実装可能な形に確定させる。**この文書は
土台(絆の仕組み・NPCの配置)を扱い、`plan/archive/side-stories.md`
(参照時点ではまだ書かれていないが同名の構想を指す)・`plan/side-
stories-part2.md`が前提としている`SaveData.bonds`・
`seenVillageEvents`は、実はこの土台がまだ`plan/`側で実装可能な形に
なっていなかったことが判明したため、本文書で先に固める。**
(`plan/side-stories-part2.md`は`design/village-life.md`の仕組みを
「既存」として扱っていたが、正しくは design/ 止まりの構想だった。
本文書がその土台を初めて`plan/`に引き上げる)

## 配置するNPC(既存設計の再掲)

- **モグラ婆**・**樽転がしのゲンド**(`design/characters.md`で既に
  役割が決まっている、当初からの拠点NPC)
- **肝いりのオトネ**・**物知りのおキヨ**・**ひよっこのポチ**
  (`design/village-life.md`で新設)
- **目覚めたおたま**(`design/story.md`第二章の救出イベント後にのみ
  出現する、進行状況で出現が変わるNPCの最初の例)

## 絆(きずな)の仕組み

```ts
export interface SaveData {
  // ...既存フィールド
  bonds: Record<string, number>; // NPCのid → 絆レベル(0始まり)
  seenVillageEvents: string[];   // 一度見た挿話のid(演出の再生防止)
}
```

- NPCのidは`"mogurababa" | "gendo" | "otone" | "okiyo" | "pochi" |
  "otama"`の6種を初期セットとする。
- 絆は**数値をプレイヤーに逐一見せない**(`design/village-life.md`の
  方針どおり)。上昇要因は当面2つに絞る:
  1. `plan/archive/quest-board.md`の依頼を達成する(達成した依頼の
     `defId`に応じて対応するNPCの絆を+1する。当面はオトネに一律で
     加算する単純な割り当てにする)
  2. 特定の素材を渡す(`plan/archive/equipment-forging.md`のほこら粉・
     刻印石を、NPCごとに1日1回まで「渡す」コマンドで献上でき、+1する)
- 絆レベルの段階は`plan/archive/companion-bond-growth.md`の
  `BondStage`(`"none" | "familiar" | "close" | "irreplaceable"`、
  閾値: 中3・高8・最高20 目安)をNPC向けにもそのまま流用する(仲間の
  絆と同じ関数`bondStage(count)`を、モンスターだけでなくNPCの絆にも
  使う。新しい型を増やさない)。

## 段階解放の会話

- 各NPCの絆が段階を跨いだ最初のタイミングで、短い会話(数行)を1回
  だけ表示する。表示済みのidを`seenVillageEvents`に積み、以後は
  再生しない。
- `plan/side-stories-part2.md`(オトネ・おキヨ・ポチ)・design/village-
  life.mdの「目覚めたおたま」サイドストーリーは、この基盤の上に乗る
  **追加の会話段**として扱う(絆段階だけでなく依頼達成数・図鑑進捗等の
  複合条件を課す会話は、それぞれの文書側の`seenVillageEvents`のidを
  個別に定義する)。

## 目覚めたおたまの出現条件

`design/story.md`第二章の救出イベント後に出現する。本文書時点では
「章立て」自体が実装されていないため(`plan/village-development.md`の
実装ノートが既に明記している簡略化)、**暫定的に`deepest >= 12`
(第二地方クリア、`plan/village-stage-rebalance.md`の村段階2条件と
同じ基準)を出現条件とする**。`plan/story-chapters.md`(本文書のあとに
計画する、章立ての実装)が完成した時点で、章クリアを直接の条件に
差し替える余地を残す。

## 拠点UIとの関係

`src/ui/town.ts`の拠点画面に、既存の一覧UIパターン(倉庫・ねむり小屋・
ゲンドの工房・依頼板と並ぶ形)で「NPCと話す」列を追加する。奥行きのある
村の3D表現は作らない(`design/village-life.md`の記述どおり、簡易な
一覧選択で足りる)。

## 実装への影響の見積もり

- `src/save.ts`: `SaveData.bonds`・`seenVillageEvents`を追加。
  `raiseBond(save, npcId)`・`markVillageEventSeen(save, eventId)`関数を
  新設。既存のsanitize処理・save-compat新フィクスチャ。
- `src/entities/village.ts`(既存ファイル、`plan/village-stage-
  rebalance.md`で扱ったもの): NPC一覧(`VILLAGE_NPCS`)を追加。
- `src/entities/companionBond.ts`の`bondStage`をそのままNPCの絆にも
  再利用(import元を共有するだけで、新しい実装は不要)。
- `src/ui/town.ts`: 「NPCと話す」列、絆段階での会話表示。

## 未決事項

- 依頼達成→絆上昇の割り当てを、依頼の種類ごとに個別のNPCへ振り分ける
  か(当面はオトネへの一律加算に留める)。
- 素材献上のUI・1日1回制限の具体的な実装方法。
- 目覚めたおたまの出現条件を`plan/story-chapters.md`実装後にどう
  差し替えるかの移行手順。
