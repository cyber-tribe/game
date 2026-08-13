# はじめの夢(hajimeNoYume)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-hajimeNoYume.md`で別途扱う)。

## 位置づけ

第8地方(真の目覚め)・隠し最終局面。HAJIME_NO_YUME_ID定数、通常のkillActorを経由しない専用の締めくくり。

## 由来

ヨリシロがこの世でいちばん最初に見た夢そのものが、ひとり分の姿を取ったもの。他のすべての夢のかけらは、この最初の夢から枝分かれして生まれた。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `melee` |
| maxHp / atk / def | 260 / 50 / 38 |
| exp | 0 |
| 出現weight | 0 |
| 備考 | HAJIME_NO_YUME_ID定数、通常のkillActorを経由しない専用の締めくくり |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
