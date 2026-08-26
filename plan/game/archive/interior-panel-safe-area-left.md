# 建物内装パネルが横向きでノッチ側の端に寄りすぎて見切れる問題を直す

## 経緯

「メニューがまだ見切れています」という指摘(添付は建物内装
(`おキヨの図鑑小屋`)のパネル)。実際には`#833`(仮想パッドとの
縦の重なり)は解消済みで、**別の見切れ**が起きている。

## 診断

`index.html`の建物内装パネルのCSSを確認すると、左端の余白に
セーフエリアが一切加味されていない:

```css
#ui.village-interior .town-box {
  width: min(660px, calc(52 * var(--vw)));
  margin-left: min(calc(3 * var(--vw)), 26px);  /* ← --safe-left が無い */
  ...
}
@media (pointer: coarse) {
  #ui.village-interior #town {
    align-items: flex-start;
    padding-top: calc(20px + var(--safe-top));   /* ← 上だけ */
  }
}
```

内装パネルは`design/village-interiors.md`の設計により**画面の左へ
寄せる**作りになっている(右側は内装を素通しで見せるため)。ところが
左端からわずか26px(またはそれ以下)の位置に固定されており、
`--safe-left`(`env(safe-area-inset-left)`)を一切足していない。

iPhoneのノッチ(TrueDepthカメラのハウジング)は、**横向きに持つと
画面の左右どちらかの端に来る**(縦持ち時の「上」が、横向きでは
「左」または「右」へ移動する)。他の多くのHUD要素
(`#hud`・タッチパッド・アクションボタン等、`index.html`内で
`var(--safe-left)`/`var(--safe-right)`を使っている箇所)はこの移動を
正しく踏まえているが、**建物内装パネルだけ左マージンにこれが
反映されておらず**、ノッチのある側で端に寄りすぎて隠れる/見切れる
状態になっている。

## 修正方針

- `#ui.village-interior .town-box`の`margin-left`に`--safe-left`を
  足す: `margin-left: calc(min(calc(3 * var(--vw)), 26px) + var(--safe-left));`
- 同様に、touch向けの`padding-top`が`--safe-top`だけを見ている
  箇所も、横向きでは上端の余白は本来不要なぶん問題にはなりにくいが、
  念のため`#ui.village-interior #town`のtouch向けブロックに
  `padding-left: var(--safe-left);`も足し、コンテナ側でも二重に
  ガードしておく(パネル側だけの対応で足りるはずだが、将来
  パネル幅の計算が変わった場合の保険)。
- 幅の計算(`width: min(660px, calc(52 * var(--vw)))`)は
  `--safe-left`を足した後の残り幅を基準にする必要はない
  (パネル自体を右へずらすだけで、内装を透かして見せる比率は
  変わらない設計のため)。

## 受け入れ基準

1. iPhone実機の横向き(ノッチが画面左または右に来る向き)両方で、
   建物内装パネルの左端がノッチ・画面の物理的な角に隠れず、
   全文字が読める。
2. ノッチの無い横向き画面(Android等)では見た目が変わらない
   (`--safe-left`は該当端末で0pxになるため無害)。
3. 縦持ちの強制横向き(forced-landscape)中も、既存の軸入れ替え
   ルール(`--safe-left`の参照元が90度分ずれる仕組み)を通じて
   引き続き正しく効く。

## 対象外

- 他のパネル(`#menu`等)の左マージンの再点検(今回は内装パネルの
  指摘への対応に絞る。同種の見落としが他にもないかは、次に
  見つかった時点で個別に対応する)

## 未決事項

- なし
