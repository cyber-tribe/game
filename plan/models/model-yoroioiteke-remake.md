# ヨロイオイテケ(yoroioiteke)のアニメーション作り直し

## 経緯

plan/game/archive/animation-quality-guidelines.mdでパイロット5体
(garudo/purun/gajiri/honegarami/tsubute)に適用したタメ・ツメ・二次揺れの
規約を、honegaramiと同じ人型骨格ファミリー(`hip`-`chest`-`neck`-`head`-
`crown`、`shoulder`-`elbow`-`hand`、`thigh`-`knee`-`foot`)を使う
この種族にも適用する。

## 現状

`build_yoroioiteke()`はhonegaramiの人型骨組みを低い重心・太い四肢に
組み替え、胸当て・背当て・肩当て・小手・すね当て・閉じた兜という一枚板の
鎧で全身を覆った個体。`ai: "guard"`、`counterDamageRatio: 0.25`
(被弾のたびに攻撃者へダメージを返す、「置いていかれる恐れ」を鎧に
変えたという由来)。

`yoroioiteke_animations()`は5クリップ。

- **idle**(3キー): frame30で`hipc:(2,0,0)`, `neck:(-2,0,0)`,
  `armL/armR:±3,9`という非常に控えめな動きで、`partial`は未使用。
- **walk**(4キー): honegarami/yoroimukadeと同型の4足交互パターンだが、
  `hipc`の`loc`接地沈みは無い。
- **attack**(4キー): `armR`(`chest-shoulder.R`)のみによる、鎧の棘を
  突き出す一撃。`neutral`(1)→引き(5、`armR:(-58,0,-20)`)→突き出し
  (10、`armR:(30,0,14)`)→`return`(20)の3段。`interp: LINEAR`指定・
  行き過ぎ段のいずれも無い。
- **hit**(3キー): frame1に`interp: LINEAR`指定が無い。振幅
  (`hipc:(-7,0,0)`, `neck:(-10,0,0)`)は小さく、「高い防御力どおり、
  ほとんど揺るがない」という現行のコメント通りにすでに実装できている。
- **die**(3キー): frame1に`interp: LINEAR`指定が無く、跳ね返りも無い。

## 打ち直しの方針

`guard`AIの小さな振幅はすでに反映済みのため崩さず、緩急と補間指定を
足す。「鎧の棘を突き出して押し返すような、重く短い一撃」という現行の
性格づけを尊重し、attackのフレーム間隔はyoroimukadeよりさらに詰めて
「短さ」を出す。

- **attack**: タメ(1→5、現行の`armR:(-58,0,-20)`のまま)→ツメ(5→8、
  `{"interp": "LINEAR"}`を追加し`armR:(40,0,15)`程度まで鋭く突き出す、
  現行の30よりやや強める)→行き過ぎ(8→10、`armR:(28,0,13)`程度に
  収まる)→`return`(18、honegaramiの22より短縮して「短い一撃」を反映)
  の4段に分ける。
- **hit**: frame1に`{"interp": "LINEAR"}`を追加するのみ。振幅はguard
  らしい小ささのまま変更しない。
- **idle**: `neck`を`hipc`より2フレーム遅らせる。frame30で`hipc`/
  `armL`/`armR`のキーを打ち、frame32に`{neck: (-2, 0, 0)}`を
  `{"partial": True}`で追加する。frame60の戻りにも同様の遅延を入れる。
- **walk**: `hip-chest`は`hip: (0,0,0.30)`→`chest: (0,0,0.50)`で
  x/yが0のまま完全に垂直な骨のため、footfall dipが適用できる。
  frame10/28の接地キーに`hipc: {"loc": (0, -0.008, 0)}`程度を追加する
  (全身鎧で四肢の可動が小さい分、honegaramiより控えめにする)。
- **die**: frame1に`{"interp": "LINEAR"}`を追加し、初動を鋭くする。
  frame26の崩れ落ちの後、frame30あたりに装甲がわずかに跳ねる小さな
  跳ね返りを1回追加する。

## 対象外

- 骨格・造形そのものの変更(既存の.glbジオメトリはそのまま)
- 新規クリップの追加(5クリップ構成は変えない)

## 未決事項

- 具体的な角度・フレーム数の最終調整(実装時にプレビューで詰める)
