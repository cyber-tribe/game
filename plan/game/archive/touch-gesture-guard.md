> **実装済み。** 計画書どおり4点を実装した。`body`へ
> `user-select: none`・`-webkit-user-select: none`・
> `-webkit-touch-callout: none`・`touch-action: manipulation`を指定し、
> `input`/`textarea`(命名ダイアログの`.naming-input`を含む、クラス名
> ではなく要素セレクタで包括的に指定)で`user-select: text`・
> `-webkit-touch-callout: default`を再指定した。`#touch`配下の
> `contextmenu`イベント抑止は`TouchControls`のコンストラクタ末尾
> (`src/ui/touch-controls.ts`)に追加した。viewport metaへの
> `user-scalable=no`等は計画書の方針どおり追加していない。
>
> ヘッドレスブラウザで`getComputedStyle`を実測し、`body`が
> `user-select: none` / `touch-action: manipulation`、動的に挿入した
> `<input>`要素が`user-select: text`になることを確認済み(コンソール
> エラー0件)。`npx tsc --noEmit` / `npx vitest run`(1203件)/
> `npm run build`いずれもgreen。長押しメニュー抑止・ダブルタップズーム
> 抑止・ピンチズームの実機挙動そのものは受け入れ基準どおりスマホ実機が
> 必要なため未確認。

# タッチ操作中の文字選択・ズーム誤発動を防ぐ

## 経緯

スマホ実機で、画面操作中に**テキストの長押し選択(コピー/調べる/
翻訳のメニューが出る)**や**ダブルタップズーム**が誤発動し、操作の
邪魔になっている。スクリーンショットでは、メッセージログを触った
だけでiOSの選択メニューが開いている。

## 原因

- `user-select: none` が `#touch`(仮想パッド・ボタンのコンテナ)
  にしか指定されておらず(`index.html`)、HUD・メッセージログ・
  オーバーレイ等のテキストは選択可能なまま。
- ダブルタップズーム・ピンチズームを抑止する `touch-action` 指定が
  パッド/ボタン(`touch-action: none`)以外の領域に無い。

## 修正方針

1. **ゲームUI全体を選択不可にする。** `body`(またはゲームUIの
   ルート要素)に以下を指定する:
   ```css
   user-select: none;
   -webkit-user-select: none;
   -webkit-touch-callout: none;  /* iOSの長押しメニュー抑止 */
   ```
2. **テキスト入力欄だけ選択を戻す。** 命名ダイアログの
   `.naming-input`(`src/ui/naming-dialog.ts`)など
   `<input>` / `<textarea>` には `user-select: text` を明示的に
   再指定する(IMEや文字編集が壊れないように)。
3. **ダブルタップズームの抑止。** `body` に
   `touch-action: manipulation` を指定する(パン・ピンチ以外の
   ブラウザ既定動作=ダブルタップズームを無効化)。仮想パッド・
   ボタン類の `touch-action: none` は現状のまま維持する。
4. **長押しコンテキストメニューの抑止。** タッチUI要素
   (`#touch` 配下)で `contextmenu` イベントを `preventDefault`
   する(ボタン長押しでメニューが出るのを防ぐ)。

viewport metaへの `user-scalable=no` / `maximum-scale=1` の追加は
**行わない**。ピンチズームはロービジョンのプレイヤーの拡大手段
でもあり(`plan/game/archive/difficulty-modes.md` のアクセシビリティ
方針)、誤発動の主因であるダブルタップ・長押しは上記のCSSで
抑止できるため。実機確認でピンチの誤発動が残るようなら、そのとき
改めて検討する(未決事項)。

## 受け入れ基準

1. スマホ実機で、ログ・HUD・オーバーレイのテキストを長押ししても
   選択メニューが出ない。
2. 画面のどこを素早く連打してもズームしない。
3. 命名ダイアログのテキスト入力(カーソル移動・選択・IME)は
   従来どおり使える。
4. デスクトップでのマウスによるテキスト選択は、ゲームUI上では
   同様に無効になるが、実害はない(選択したい文章は無い)。

## 対象外

- 画面レイアウトの見直し(`plan/game/mobile-layout-redesign.md`)

## 未決事項

- ピンチズームの誤発動が実機確認で残った場合の追加抑止
  (`gesturestart` の `preventDefault` 等)を入れるかどうか
