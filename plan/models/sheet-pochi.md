# ぽち

plan/models/archive/character-design-language.mdのデザインシート
先行工程(1キャラ1枚、5項目)。村人。

1. **三語コンセプト**: 元気な子供・お下がり・遊び道具
2. **シルエットの記号**: 腰に挿した木の又枝のぱちんこ(`C.cylinder`+bevel、
   Y字に2本組む)を新規追加。現行(`build_pochi`)は服と肌のみで
   硬い部品を持たないため、
   plan/models/archive/silhouette-hard-surface-parts.mdの義務項目を
   満たしていない。この新規パーツで満たす
3. **図形と頭身**: 頭が大きく前のめりの立ち姿、2頭身
4. **パレット**: `tools/models/villagers.py`の `POCHI_SKIN` /
   `POCHI_COAT` 等、既存定数をそのまま使用。ぱちんこは木の枝の
   褐色 `(0.42, 0.30, 0.20)`
5. **設定の見せ場**: design/village-life.mdの村で一番元気な子供という
   在り方を、遊び道具のぱちんこを腰に挿した姿で表す
