# ブラウザのピンチズームを禁止する

> **実装済み。** 方針どおり2段構えで対応した。
>
> 1. **iOS Safari**: `src/main.ts` のコンストラクタで `document` に
>    `gesturestart` / `gesturechange` の `preventDefault()` を登録した
>    (`keydown`/`pointerdown` によるオーディオ解錠のすぐ下)。
> 2. **その他ブラウザ**: `index.html` の viewport meta に
>    `maximum-scale=1, user-scalable=no` を追加した。
>
> ゲーム内の二本指カメラズーム(`src/ui/touch-controls.ts` の
> `pinchPointers`/`currentPinchDistance()`)はcanvas上のPointerEventを
> 自前で追跡する実装であり、ブラウザ既定のジェスチャーイベントとは
> 完全に独立しているため、今回の変更の影響を受けないことをコード上で
> 確認した。
>
> **検証**: `npx tsc --noEmit` / `npx vitest run`(1270件)/
> `npm run build` いずれもgreen。加えてheadless Chromiumで実際に
> `npm run dev` を起動し、(1) viewport metaに
> `maximum-scale=1, user-scalable=no` が含まれること、(2)
> `document` に対して合成した `gesturestart` / `gesturechange` イベントが
> `preventDefault()` されること、をJSレベルで確認した(コンソール
> エラーなし)。iOS Safari実機での「仮想パッド+アクションボタン同時
> 操作でページが拡大されない」という受け入れ基準そのものは、実機を
> 持たないためコードレビューと上記の合成イベント検証まで
> (`gesturestart`/`gesturechange`はiOS独自の非標準イベントで、
> ChromiumベースのheadlessブラウザにはネイティブAPIとして存在しない
> ため、`document.dispatchEvent(new Event(...))` によるリスナー登録の
> 動作確認にとどめた)。

## 経緯

`plan/game/archive/touch-gesture-guard.md` は、ピンチズームを
「ロービジョンの拡大手段として残す」と判断し、実機で誤発動が
残った場合の追加抑止を未決事項にしていた。

実機確認の結果、**仮想パッド(左手親指)とアクションボタン(右手
親指)を同時に操作すると、2本の指がブラウザにピンチと解釈されて
ページ全体が拡大されてしまう**ことが分かった。ローグライクの通常
操作(移動しながらボタンを押す)で毎回起きるため、遊びが成立
しない。未決事項を**「ピンチズームも禁止する」で確定**させる。

## 原因の補足

- `body` の `touch-action: manipulation` は**ダブルタップズームだけを
  無効化し、ピンチズームは許可する**値である(manipulation =
  pan + pinch-zoom)。前回の対策がピンチに効いていないのは仕様どおり。
- パッド・ボタン自体は `touch-action: none` だが、iOS Safariは
  2本目の指が別要素(canvas等)に触れているとページズームを
  発動させることがある。要素単位の `touch-action` だけでは
  塞ぎきれない。

## 修正方針

1. **iOS Safari: `gesturestart` / `gesturechange` を `preventDefault`
   する。** `document` に対してリスナーを張る(iOS独自イベントで、
   ページピンチズームを確実に抑止できる)。
2. **その他ブラウザ: viewport metaに `maximum-scale=1,
   user-scalable=no` を追加する。** Android Chrome等はこれで
   ピンチズームが無効になる(iOS Safariはこの指定を無視するため
   1が必要)。
3. **ゲーム内の二本指カメラズーム(`src/ui/touch-controls.ts` の
   canvas上のピンチ)は残す。** こちらはPointerEventで自前実装
   されており、ブラウザのページズームとは独立している。1・2は
   ブラウザ既定動作を殺すだけなので影響しない(実機で要確認)。
4. 誤ってズームされた状態で保存されている場合に備え、
   ページ読み込み時に拡大状態をリセットできるかは追加調査
   (通常はリロードで戻るため必須ではない)。

## アクセシビリティ上の割り切り

`touch-gesture-guard.md` 時点の「ロービジョンの拡大手段として残す」
判断は、通常操作と衝突することが実機で確認された以上、維持できない。
代替として以下が引き続き使える:

- ゲーム内ズーム(+/-キー、二本指カメラズーム)
- OSレベルの画面拡大機能(iOSの「ズーム機能」等。ブラウザの
  ピンチとは別系統なので影響を受けない)

## 受け入れ基準

1. スマホ実機で、仮想パッドとアクションボタンを同時に操作しても
   ページが拡大されない。
2. 画面のどこで2本指を広げてもページズームが起きない。
3. canvas上の二本指カメラズーム(ゲーム内機能)は従来どおり効く。
4. 拠点画面の横スクロール・ログモーダルの縦スクロールは
   従来どおり使える。

## 対象外

- ゲーム内カメラズームの仕様変更
- OSレベルの拡大機能への対応(何もしなくても共存できる)
