> **実装済み。** `src/entities/sideStories.ts`(新規)に、絆段階(+一部は
> 追加条件)で段が進むモグラ婆・ゲンドの`SideStoryDef`と、絆と無関係に
> 「会うたびに」進む目覚めたおたまの`OTAMA_VISIT_STORY`をデータとして
> 持たせ、判定ロジック本体(`talkToNpc(save, npcId)`)は`src/save.ts`に
> 置いた(`achievements.ts`/`checkAchievements`と同じ、循環importを
> 避ける切り分け)。
>
> **これまで存在しなかった「会話の実際の表示」を新設した**: 既存の
> `plan/village-life.md`の実装は、NPCと話す操作で`seenVillageEvents`に
> 既読フラグを立てるだけで、実際の台詞は一切表示されないスタブだった
> (本文書が前提としていた表示の仕組みが、実はまだ無かった)。
> `src/ui/town.ts`に`npcTalkMessage`(選択中NPCの説明欄に会話文を出す
> 一時状態)と`showNpcMessage()`を追加し、話しかけて新たに解放された
> 一言があれば拠点画面の説明欄に表示するようにした。
>
> 各段の判定は、絆段階だけでなく段ごとの追加条件(モグラ婆第2段は
> `deepest>=12`、第3段は`deepest>=18`)を素直にAND判定する形にした。
> 段の解放は`sideStory:${npcId}:${段番号}`という新しいeventIdで
> `seenVillageEvents`に一度だけ記録し、既存の「初めて跨いだときだけ
> 1回」という設計をそのまま踏襲した。
>
> **未決事項だった「まぼろしの一振り」の必要素材**を、実装時の判断で
> ほこら粉1個+ガジリねずみの印の刻印石1個(会心率に関わる印で、
> 「会心の一振り」という逸話に意味が通る組み合わせ)とし、第3段解放時に
> 消費するようにした。
>
> 専用武器2種(モグラ婆の形見のなた・まぼろしの大鉈)は、既存のなた系・
> 大鉈系と同じ性能でカタログに追加した。`flavorText`フィールドは
> `plan/flavor-and-dialogue.md`(未実装、かつそちらは`plan/yorishiro-
> moods.md`・`plan/yoimatsuri-festival.md`にも依存する)側の仕事のため、
> 今回は`description`のみとし、専用の外見・flavorTextは見送った
> (`flavorText`は省略可能フィールドとして設計されているため、後から
> 実装しても既存データを壊さない)。
>
> **ついでに見つけて修正したバグ**: `src/ui/town.ts`の
> `currentStoryChapter()`が、`plan/mountain-core.md`実装前の名残で
> `storyChapter`の第2引数を`false`に固定したままだった(`main.ts`側の
> 同種の見落としは`plan/true-awakening.md`実装時に修正済みだったが、
> `town.ts`側は見落とされていた)。これは目覚めたおたまの出現条件
> (`storyChapter>=2`)・第4段の条件(`storyChapter===3`)の両方に
> 直接影響するため、`this.save.storyCleared`を渡すよう修正した。
>
> テストは`tests/side-stories-part1.test.ts`(段の解放条件・報酬武器の
> 付与と素材消費・おたまの訪問回数ベースの進行・第2弾未実装NPCの沈黙)
> で検証。拠点画面での会話表示もブラウザで目視確認済み。

# NPCサイドストーリー(第1弾: モグラ婆・ゲンド・目覚めたおたま)

`design/side-stories.md` を実装可能な形に確定させる。**この文書は
design/側の最初のサイドストーリー3件を扱う。実は`plan/side-stories-
part2.md`(#137)が「既存3人分」として前提にしていたこの3件が、
`plan/village-life.md`と同じく design/ 止まりで一度も`plan/`に昇格
されていなかった**ため、本文書で先に固める(`plan/side-stories-
part2.md`側の誤った参照は別途修正する)。

## 前提

`plan/village-life.md`(NPC・絆の基盤)・`plan/story-chapters.md`
(章立て)の実装後であることを前提にする。各段の条件は、design文書の
「第二地方到達」「第三地方クリア」「第四章直前」といった記述を、
以下のように既存の実装可能な指標へ対応させる。

| design文書の表現 | 実装上の判定 |
|---|---|
| 絆・中 / 高 / 最高 | `bondStage(save.bonds[npcId] ?? 0)` が `"familiar"` / `"close"` / `"irreplaceable"`(`plan/village-life.md`) |
| 第二地方到達 | `save.deepest >= 12`(`plan/region-expansion.md`の地方境界表) |
| 第三地方クリア | `save.deepest >= 18` |
| 第四章直前 | `storyChapter(save.deepest, save.storyCleared) === 3`(第三章、`plan/story-chapters.md`。「第四章に入る直前」を「第三章の間ずっと表示可能」と読み替える) |
| 第二章で救出 | `storyChapter(...) >= 2` に到達した時点で出現(`plan/village-life.md`が定めた「目覚めたおたま」の出現条件と同一) |

## モグラ婆:「若い頃の樽守り」(全3段、既存設計の再掲)

- 第1段(絆・中): 昔は自分も潜っていたことをぽつりと話す。
- 第2段(絆・高 + `deepest >= 12`): 相棒を深い階で失いかけた話。
- 第3段(絆・最高 + `deepest >= 18`): 専用アイテム**「モグラ婆の形見の
  なた」**(`plan/protagonist-weapons.md`のなた系専用個体。性能は通常の
  なたと同等、専用の外見と`flavorText`(`plan/flavor-and-dialogue.md`)
  だけが特別)を譲り受ける。

## ゲンド:「まぼろしの一振り」(全3段、既存設計の再掲)

- 第1段(絆・中): 会心の一振りの逸話を語る。
- 第2段(絆・高): 再現に必要な素材(通常より珍しいほこら粉・刻印石の
  組み合わせ、`plan/equipment-forging.md`)を教えてくれる。
- 第3段(絆・最高 + 素材を全部持ち込む): 専用武器**「まぼろしの大鉈」**
  (`plan/protagonist-weapons.md`の大鉈系。性能は通常品と同格)を
  作ってくれる。

## 目覚めたおたま:「思い出のかけら」(全4段、既存設計の再掲)

`plan/village-life.md`が定める出現条件(`storyChapter >= 2`)で登場する。
絆の仕組みとは独立に、**会うたびに**(訪問回数ベース、絆レベルは問わない)
記憶を1つずつ解放する。

- 第1〜3段: 眠り病の間の記憶を1つずつ思い出す短い一言。
- 第4段(`storyChapter(...) === 3`、第三章の間): 近道屋が本当は何を
  探していたのかのうろ覚えの手がかり。`design/story.md`第四章への伏線。
  専用報酬なし。

## `plan/side-stories-part2.md`との整合(修正が必要な点)

`plan/side-stories-part2.md`は「既存3人分と条件指標が重複しないよう
住み分けた」と書いているが、正しくは**本文書(第1弾)と条件指標が
重複しないよう住み分ける**という意味に読み替える。第1弾は絆段階+
地方到達/章立てを条件にし、第2弾(オトネ・おキヨ・ポチ)は依頼実績数・
図鑑進捗・章立てを条件にしており、実質的な住み分けそのものは
`plan/side-stories-part2.md`のPR時点の設計判断のまま矛盾なく成立する
(参照文書名の誤りだけが問題だった)。

## 実装への影響の見積もり

- `plan/village-life.md`・`plan/story-chapters.md`の実装が本文書の
  前提条件になる(先に実装される必要がある)。
- `src/entities/dialogue.ts`または専用ファイル: 各段の会話データ・
  条件判定。
- `src/items/catalog.ts`または`plan/protagonist-weapons.md`側:
  「モグラ婆の形見のなた」「まぼろしの大鉈」の専用アイテムデータ追加。

## 未決事項

- 各段の会話文の実際の執筆。
- 「まぼろしの一振り」に必要な具体的な素材の組み合わせ。
- 目覚めたおたまの「会うたびに」を、実際に何ターン/何回の訪問間隔で
  進めるか。
