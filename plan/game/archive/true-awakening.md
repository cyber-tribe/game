> **実装済み。** `isTrueAwakeningUnlocked(save)`(`src/save.ts`)を新設し、
> 本文書どおり3系統のAND(図鑑コンプリート・全地方ボス撃破・実績数)で
> 判定する。`DungeonDef.unlock`の型は本文書の方針どおり汚さず、専用の
> `TRUE_AWAKENING_ID`ダンジョンは`unlock: "always"`のまま定義しつつ、
> `src/ui/town.ts`側で明示的に通常の一覧から除外し、
> `isTrueAwakeningUnlocked`を満たしたときだけ末尾に追加する隠し要素として
> 扱った。3件目(実績数のしきい値)は未決事項だったため、実装時の判断で
> 「trueAwakening自身を除く実績総数15件の6〜7割」を目安に**10件**とした。
>
> 舞台は`plan/mountain-core.md`と同じ「短い固定的なダンジョン(3階)+
> 既存の乱数生成の流用(floorOffset: 42で第八地方相当のテーブル)」の
> 方針を踏襲。最終階に新種族「はじめの夢」(`isRegionBoss`は立てない。
> `REGION_BOSS_ORDER`・`SaveData.defeatedRegionBosses`が前提とする
> 「地方ボス8体」を汚さないため)を1体だけ配置し、`bossTelegraph.effect`
> は本文書の指示どおり既存の`"summonEcho"`(こだまの主と同じ、分身・HP
> 共有)を再利用した。HPが0になった瞬間、通常の`killActor`(討伐・
> ドロップ・経験値)には進まず、`trueAwakeningEnding`という専用の
> 締めくくり処理に分岐する(討伐メッセージや経験値は一切出さない)。
>
> **実装時に見つけて修正した設計上の循環**: 「はじめの夢」をモンスター
> 図鑑(`SPECIES`)に加えたところ、既存の`isCompendiumComplete`が全種の
> 捕獲を要求する実装だったため、「図鑑を完成させないとこの局面に入れず、
> かつこの局面でしか出会えない種族がいる」という循環が生まれてしまった。
> `isCompendiumComplete`の判定対象から「はじめの夢」だけを明示的に除外し、
> 循環を解消した(捕獲自体は、他の地方ボスと同様にタルで弱らせて吸い込む
> ことで可能なままにしてあるので、文字どおりの完全制覇を狙うプレイヤー
> 向けのおまけとして残る)。
>
> 締めの一言は、`this.allies`(現在連れている仲間)のうち絆(なじみ、
> `plan/archive/companion-bond-growth.md`の`BondStage`)が最も深い個体の
> 段階で4パターン+仲間なしの場合の専用の1パターンに出し分けた。台詞の
> 実際の執筆は本文書のスコープ外だったため、実装時に新規に書き下ろした。
>
> 報酬は本文書どおり、実績帳への「trueAwakening」実績追加(称号「最古の
> 夢に寄り添う者」)と、かがやきの夢のかけら出現率の恒久ボーナス(図鑑
> コンプリートの1.5倍に代えて2.0倍、基準1%換算で実質+0.5%上乗せ)のみ。
> 新たな圧倒的パワーは与えていない。
>
> ついでに、`main.ts`の`checkStoryChapterTransition`が`storyChapter`の
> 第2引数を`false`に固定したままだった(`plan/mountain-core.md`実装時の
> 見落とし。`SaveData.storyCleared`は既に存在するのに未配線だった)のを
> `this.save.storyCleared`を渡すよう修正した。これにより終章(第五章)の
> 導入メッセージが実際に流れるようになる。
>
> テストは `tests/true-awakening.test.ts`(解放条件・ボス配置・専用の
> 締めくくり処理・絆による一言の出し分け・recordRunのマージ・実績解放)
> と `tests/save-compat.test.ts`のv10フィクスチャ追加分で検証した。
> 起動後の拠点画面で「はじめの夢」が通常状態では一覧に出ないことも
> ブラウザで目視確認済み。

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
