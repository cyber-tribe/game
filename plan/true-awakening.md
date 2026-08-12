# 真の目覚め(隠し最終局面)

`design/postgame.md` が「真の目覚め」として構想していた、ごく一部の
プレイヤー向けの追加局面を実装可能な形に仕様化する。`plan/mountain-
core.md`(物語本編の決着)より後、複数のやり込み系統(図鑑・地方ボス・
実績)をまたいだ到達点として設計する。

## 概要

`design/world.md` のトーンを保ったまま、近道屋という人間側の問題を
片付けたあとに残る、**ヨリシロ自身のいちばん古い夢**――誰もいない頃の
記憶――を扱う局面。正体は絶対悪ではなく、ただ寂しいだけの記憶であり、
`plan/mountain-core.md`(倒すより向き合わせる決着)とは異なり、
**通常のボス戦の枠組みは使うが、決着は「もう独りではない」と伝わる
方向にする**(`design/postgame.md` の記述どおり)。

## 対象の名前: 「はじめの夢」

`design/characters.md` のモンスター命名の流儀(擬音・生態をそのまま
名前にする素朴さ)に倣い、固有名詞めいた大仰な名前を避け、**「はじめの
夢」**と呼ぶ。ヨリシロそのものではなく、ヨリシロが最初に見た夢が
ひとり分の姿を取ったもの、という位置づけにする。

## 解放条件

`design/postgame.md` の記述どおり、3系統のANDにする。

1. `plan/monster-compendium.md` の図鑑コンプリート
   (`isCompendiumComplete(save)`。既存の実装済み関数をそのまま使う)
2. `plan/mountain-core.md` で新設した `SaveData.defeatedRegionBosses`
   が8種すべて(全地方ボス撃破。`REGION_BOSS_ORDER.length === 8` に
   達した時点の全種)を含む
3. `SaveData.achievements` の達成数が一定数以上(具体的な件数は未決事項)

この局面専用のダンジョンエントリ(`DungeonDef`)は作らない。3条件の
ANDは`deepest`/`villageStage`のような単純な数値比較に収まらないため、
既存の`isDungeonUnlocked`(`plan/archive/multiple-dungeons.md`)の
汎用の仕組みには乗せず、**専用の判定関数
`isTrueAwakeningUnlocked(save: SaveData): boolean`** を新設し、拠点UI
側でこの局面だけ個別に解放判定する(`DungeonDef.unlock`の型を
汚さない)。

## 舞台とボス戦

- `plan/mountain-core.md` と同じ「短い固定的な進行+既存の乱数生成の
  流用」という方針を踏襲した、専用の短いダンジョン(3階程度)として
  実装する。最終階に「はじめの夢」を配置する。
- ボス戦の枠組みは`plan/archive/region-bosses.md`の共通仕様
  (`isRegionBoss`・`bossTelegraph`)をそのまま使う。`bossTelegraph.effect`
  は新設せず、既存の`"summonEcho"`(`plan/region-boss-kodamanonushi.md`
  で実装済みの、分身・HP共有)を再利用する。「ひとりで、自分自身の
  こだまとしか話せない」という孤独さの表現に、既存の仕組みがそのまま
  意味的に合致するため。
- **HPが0になった時点で、通常の`killActor`(討伐・ドロップ)処理には
  進まない。** `plan/mountain-core.md`の会話イベントと同じ枠組みで、
  専用の締めくくりイベントに分岐する。

## 締めくくりの分岐(絆による差分)

- `SaveData.hut` 内の各仲間が持つ絆段階(`plan/archive/companion-bond-
  growth.md`の`BondStage`)を参照し、**現在連れている仲間のうち
  最も絆が高い個体の段階**に応じて、締めの一言メッセージを3〜4段階で
  出し分ける(`"irreplaceable"`なら最も踏み込んだ一言、`"none"`に
  近ければ簡素な一言、という程度の差分に留める)。仲間を1体も連れて
  いない場合の一言も用意する。
- 具体的な文面の執筆は本文書のスコープ外とし、`design/characters.md`・
  `design/flavor-details.md`側で別途詰める。

## 報酬

- `plan/achievements.md`の実装済みの枠組みに、専用の実績・称号(例:
  「最古の夢に寄り添う者」)を1件追加する。
- `design/postgame.md`の方針どおり、新たな圧倒的パワーは与えない。
  `plan/monster-compendium.md`の「かがやきの夢のかけら」出現率を
  わずかに(例: 基準1%→1.5%からさらに+0.5%程度)上げる恒久効果を
  唯一の実利的な報酬とする。

## 実装への影響の見積もり

- `src/save.ts`: `isTrueAwakeningUnlocked(save)` 関数を追加
  (`isCompendiumComplete`・`defeatedRegionBosses`・`achievements`の
  件数を参照する)。専用の実績IDを追加。
- `src/entities/dungeons.ts`または`src/game.ts`: 専用の短いダンジョン
  進行(`plan/mountain-core.md`の実装パターンを踏襲)。
- `src/ui/town.ts`: この局面への入り口は、通常のダンジョン一覧とは
  別枠で表示する(3条件がすべて揃うまでは一覧にすら出さない、という
  隠し要素らしい扱いを想定。表示方法の詳細は実装時の判断に委ねる)。

## 未決事項

- 実績の必要達成数の具体的な件数。
- 締めの一言メッセージの実際の執筆(3〜4段階ぶん)。
- かがやきの夢のかけら出現率ボーナスの具体的な上乗せ幅。
- 「はじめの夢」のHP・攻撃力・防御力の具体値。
