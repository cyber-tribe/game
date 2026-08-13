# ユメクイモグラ(yumekuimogura)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/model-yumekuimogura.md`で別途扱う)。

## 位置づけ

第3地方(まどろみの茸林)・通常出現。出現階13〜。

## 由来

浅い眠りの中の夢食い。地面に潜って進み、不意にプレイヤーの近くへ顔を出す。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `burrow` |
| maxHp / atk / def | 32 / 18 / 8 |
| exp | 30 |
| 出現weight | 5 |
| 備考 | 出現階13〜 |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
