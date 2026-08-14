# 縦持ちでは案内を出すのではなく、画面ごと横向きに描画する

> **実装済み。**
>
> **1. CSSによる強制横向き**: `src/ui/orientation-guard.ts`の
> `OrientationGuard`が付け外すクラスを`portrait-lock`から
> `forced-landscape`へ改名し、`index.html`側は`#rotatePrompt`(案内文)と
> 旧CSSを削除。代わりに`body.forced-landscape #app`へ本文書どおり
> `width: 100dvh; height: 100dvw; transform: rotate(90deg)
> translateY(-100%); transform-origin: top left;`を適用した。判定関数
> `shouldLockToPortraitPrompt`は`shouldForceLandscape`へ改名し
> (`src/entities/orientation.ts`)、`tests/orientation.test.ts`も追随。
>
> **2. 入力座標の回転補正**: 本文書の指摘どおり`PointerEvent`の
> `clientX/clientY`は回転前の画面座標系のまま届くため、`clientX/Y`の
> 生差分から方向・角度を計算している箇所だけを補正した。共通の純粋関数
> `forcedLandscapePointerDelta(dx, dy, active)`(`src/entities/orientation.ts`)
> を新設し、90度回転の逆変換`(dx, dy) -> (dy, -dx)`を1箇所にまとめて
> `src/ui/touch-controls.ts`から呼び出す形にした(`body.forced-landscape`が
> 付いているかは`document.body.classList.contains("forced-landscape")`で
> その都度判定):
> - 仮想パッドのドラッグ(`dx/dy`→方向判定・ノブの見た目の移動)を補正
> - 視点回転ジェスチャ(1本指ドラッグ)は、横移動量の判定に使う値を
>   forced-landscape中だけ`clientX`差分から`clientY`差分に読み替えた
>   (`rotateStartY`を新設して追跡。回転の逆変換の式で`dx`成分だけを
>   取り出すと、ちょうどこの読み替えになることを確認して1つの関数に
>   まとめている)
> - ピンチ(距離)は本文書の指摘どおり回転不変のため無補正のまま
> - 要素の当たり判定(ボタンのタップ等)・`clientWidth/clientHeight`を
>   使うサイズ取得も、本文書の指摘どおり無補正で正しく動く
>
> 補正式(90度回転の逆変換)は幾何学的に導出し、`tests/orientation.test.ts`
> に単体テストを追加して検証済み。さらにPlaywright(headless Chromium)で
> `.touch-pad`へ実際に合成`PointerEvent`(pointerdown→pointermove)を
> 発火させ、`forced-landscape`中は生の右方向ドラッグがノブの見た目を
> 正しく補正後の方向へ動かすこと(補正なしの通常横持ちでは逆に無補正の
> ままであること)も実機なしで確認できた。
>
> **3. 既存機能との整合**: PWA manifestの`orientation: "landscape"`は
> 本文書の想定どおり変更していない(インストール版Androidでは発動せず、
> iOS SafariのフォールバックとしてこのCSSが効く)。セーフエリア
> (`env(safe-area-inset-*)`)は、各パネルが直接`env()`を参照するのを
> やめて`--safe-top/right/bottom/left`という4つのCSSカスタムプロパティ
> 経由に統一し、`body.forced-landscape`スコープでその参照元を
> (`rotate(90deg) translateY(-100%)`の変換を逆算して)
> `top<-右, right<-下, bottom<-左, left<-上`の対応へ入れ替えた。
> **ただしこの対応は幾何計算から導いただけで、実機での確認はできていない**
> (ヘッドレスブラウザにはノッチ・ホームインジケータが無く検証手段が
> 無かったため)。本文書が未決事項に挙げていたとおり、実機で確認して
> ズレていれば`index.html`の`body.forced-landscape`ブロックだけを
> 直せば良い。
>
> **検証したこと/できなかったこと**: Playwrightのタッチ端末エミュレーション
> (`hasTouch: true`・`isMobile: true`)でビューポートを縦長にすると
> `forced-landscape`クラスが付き`#app`に回転transformがかかること、
> `#rotatePrompt`が無くなっていること、横長ビューポートに戻すと
> (`change`イベントで)クラスが自動的に外れて元のレイアウトに戻ること、
> デスクトップ(`hasTouch: false`)ではビューポートが縦長でもクラスが
> 付かないことを確認した。一方で、OS側の画面回転ロック自体の挙動
> (本文書が最大の利点として挙げていたケース)や、実機のノッチ・
> ホームインジケータでのセーフエリアの見え方、iOS Safariの動的
> ツールバーと`100dvh/100dvw`の端数ずれは、ヘッドレス環境の制約上
> 検証できていない。
>
> 未決事項だった回転の瞬間のちらつき対策(トランジション)は、今回は
> 追加していない(挙動としては許容範囲と判断。気になる場合は別途
> `transition: transform`等を検討)。

## 経緯

縦持ち対応は `plan/game/archive/touch-ui-overlap-fix.md` で
「ゲーム画面を隠して『画面を横向きにしてください』の案内だけを出す」
方式に決め、`src/ui/orientation-guard.ts`(`portrait-lock` クラスの
付け外し)として実装済み。

これを見直す。**縦持ちのときも、ゲーム画面そのものを90度回転させて
横向きのまま描画する**。画面が横向きに表示されていれば、プレイヤーは
言われなくても自然にスマホを横に持ち替える。案内文で行動を要求する
より、ひと目で伝わる(HTML5ゲームで広く使われる定石でもある)。

利点:

- 案内画面という「遊べない状態」が無くなる。縦のまま眺めることも
  一応でき、持ち替えた瞬間そのまま遊べる。
- OS側の画面回転ロックを縦向きで固定しているプレイヤー(スマホでは
  多い)でも、持ち替えるだけで遊べるようになる。**現行の案内方式は
  回転ロック中だと `orientation: portrait` のまま変わらず、案内から
  永遠に抜けられない**。この取りこぼしを塞げるのが実質最大の利点。

## 実装方針

### 1. CSSによる強制横向き

タッチ端末かつ縦持ち(既存の `OrientationGuard` の判定をそのまま
流用)のとき、`portrait-lock` の代わりに `forced-landscape` クラスを
`body` に付け、ゲームのルート要素(`#app`)へ:

```css
body.forced-landscape #app {
  width: 100dvh;   /* 幅と高さを入れ替える */
  height: 100dvw;
  transform: rotate(90deg) translateY(-100%);
  transform-origin: top left;
}
```

- 「画面を横向きにしてください」の案内(`#rotatePrompt` と
  `portrait-lock` のCSS)は削除する。
- 端末を実際に横に持ち替えれば `orientation: portrait` が外れて
  クラスごと外れ、通常の横持ちレイアウトに戻る(既存の `change`
  イベント監視のまま)。OS回転ロック中は付きっぱなしで、それで正しく
  遊べる。

### 2. 入力座標の回転補正(最重要の落とし穴)

CSS transform は見た目を回すだけで、PointerEvent の
`clientX/clientY` は**回転前の座標系のまま**届く。座標の生値から
差分・距離を計算している箇所は、`forced-landscape` 中だけ軸を
入れ替える補正が要る:

- 仮想パッドのドラッグ(`src/ui/touch-controls.ts` の `dx/dy` 計算)
  → `(dx, dy)` を `(dy, -dx)` に読み替える(90度回転の逆変換)
- 二本指回転・ピンチ(同ファイル)→ 距離は回転不変なのでピンチは
  そのまま。回転ジェスチャの横移動量 `clientX` 差分は `clientY`
  差分に読み替える
- 要素の当たり判定(ボタンのタップ等)はブラウザが transform を
  考慮してヒットテストするため補正不要。**生座標から計算している
  箇所だけ**が対象
- 描画側のサイズ取得(`clientWidth/clientHeight`)はレイアウト値
  (入れ替え後の値)が返るため、そのままで正しい

### 3. 既存機能との整合

- PWA(`plan/game/pwa-support.md`)のmanifest `orientation:
  "landscape"` はそのまま。インストール版のAndroidはOSレベルで
  横固定され、このCSSは発動しない。iOSはmanifestの向き指定を
  無視するため、このCSS方式がそのままフォールバックになる。
- セーフエリア(`env(safe-area-inset-*)`)は回転中、上下左右の
  対応が90度ずれる。`forced-landscape` 中はインセットの参照軸を
  入れ替える(実装時に実機で確認)。
- 縦持ち判定・クラス名変更に伴い、`src/entities/orientation.ts` の
  判定関数名(`shouldLockToPortraitPrompt`)と既存テストも改名する。

## 受け入れ基準

1. スマホを縦に持ってゲームを開くと、ゲーム画面が横向きに回転して
   表示される(案内文は出ない)。
2. その状態でスマホを横に持ち替えると、通常の横持ち表示になり、
   操作が継続できる(リロード不要)。
3. **OSの画面回転ロックを縦で固定したままでも**、スマホを横に
   持てば横向きのゲーム画面が正位置になり、仮想パッド・ボタン・
   ジェスチャがすべて正しい方向で効く。
4. デスクトップ(pointer: fine)では何も変わらない。

## 対象外

- 縦持ち専用レイアウトの新規制作(引き続き作らない)
- ダンジョン内カメラの仕様変更

## 未決事項

- 回転の瞬間(deviceの持ち替え・クラスの付け外し)のちらつきを
  トランジションで隠すかどうか
- `100dvh/100dvw` の入れ替えがiOS Safariのツールバー伸縮と重なった
  ときの端数ずれ(実機確認で問題があれば `visualViewport` 参照に
  切り替える)
