> **実装済み(コード変更なし)。** `src/entities/species.ts`の`id:
> "honezukanotsukai"`エントリを確認し、本文書のデータ表(AI/maxHp/atk/def/
> exp/weight/出現階/range/満腹度削り)がすべて一致することを検証した。
> 差分なし。本文書はコードを伴わない記録用の文書のため、追加の実装は
> 行わない。

# ホネヅカのつかい(honezukanotsukai)のモンスター実装

`src/entities/species.ts`にすでに実装済みの内容を、正式なplanとして
書き起こす(3Dモデルは`plan/models/archive/model-honezukanotsukai.md`で別途扱う)。

## 位置づけ

第4地方(骨積みの回廊)・通常出現。出現階22〜、range2、満腹度を削る。

## 由来

ホネヅカのぬしに仕える小さな使い。オイテケボシと同じく満腹度を削る攻撃を放つが、忠実な分だけ間合いは近い。

(`design/characters.md`に同内容を掲載済み)

## データ(実装済み)

| 項目 | 値 |
|---|---|
| AI | `ranged` |
| maxHp / atk / def | 28 / 18 / 8 |
| exp | 34 |
| 出現weight | 4 |
| 備考 | 出現階22〜、range2、満腹度を削る |

## 図鑑

`src/entities/speciesLore.ts`の生態解説文は`plan/species-lore-expansion.md`で
追加済み(未マージの場合はそちらを先に取り込む)。

## 未決事項

なし(`src/entities/species.ts`に実装済みの内容を記録した文書のため)。
