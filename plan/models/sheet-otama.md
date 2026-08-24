# おたま

plan/models/archive/character-design-language.mdのデザインシート
先行工程(1キャラ1枚、5項目)。村人。

1. **三語コンセプト**: 目覚めたばかり・かいまき・眠りの名残
2. **シルエットの記号**: 抱えた木の箱枕(`C.box`+bevel)を新規追加。
   現行(`build_otama`)はかいまきと肌のみで硬い部品を持たないため、
   plan/models/archive/silhouette-hard-surface-parts.mdの義務項目を
   満たしていない。この新規パーツで満たす
3. **図形と頭身**: かいまきで上半身が丸く大きい体、2頭身
4. **パレット**: `tools/models/villagers.py`の `OTAMA_KAIMAKI` /
   `OTAMA_SKIN` 等、既存定数をそのまま使用。箱枕は木の褐色
   `(0.44, 0.36, 0.28)`
5. **設定の見せ場**: design/village-life.mdの眠り病から目覚めたばかり
   という在り方を、まだ手放せない箱枕を抱えた姿で表す
