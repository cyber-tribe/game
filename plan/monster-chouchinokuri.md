# ちょうちんおくり(chouchinokuri)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-chouchinokuri.md`で別途扱う)。

## 位置づけ

第7地方(わすれられた祭りの跡)・通常出現。出現階37〜(swarmSize 3-4)。

## 由来

消えかけた祭りの灯り。群れで漂い、倒されるたび周囲がふっと照らされる。数少ない、寂しさの中にわずかな温かさを残す存在。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `swarm` |
| maxHp / atk / def | 18 / 14 / 6 |
| exp | 22 |
| 出現weight | 4 |
| 備考 | 出現階37〜(swarmSize 3-4) |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
