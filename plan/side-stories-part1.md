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
