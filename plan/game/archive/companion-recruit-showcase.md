# 仲間になった瞬間に一旦ストップし、命名とモデル披露をまとめて行う

> **実装済み。** `src/core/events.ts`(`splitEventsAtRecruits`。1ターンぶんの
> `GameEvent[]`をrecruitイベントの直後で区切って複数の「再生単位」に
> 分ける純粋関数。テストは`tests/companion-recruit-showcase.test.ts`)・
> `src/main.ts`(`turnPlayback`/`pendingRecruitShowcase`/
> `recruitShowcaseActive`の状態、`advanceTurnPlayback`/`showRecruitShowcase`/
> `endRecruitShowcase`/`renderRecruitShowcase`、`loop()`・`anyModalOpen()`・
> `submit()`の配線)・`index.html`(`#naming`を`#uiRoot`の外へ移動、
> `.naming-showcase`修飾クラス)。
>
> **一時停止の仕組み。** `submit()`は`events`をそのまま`Stage.applyEvents`
> に渡すのをやめ、`splitEventsAtRecruits`で区切ってから`turnPlayback`に
> 保持し、`advanceTurnPlayback()`で先頭の区切りだけ`applyEvents`する。
> 区切りの末尾がrecruitなら、その場ではまだダイアログを開かず
> `pendingRecruitShowcase`に記録するだけに留め、`loop()`側で
> `this.lock <= 0`(=recruit直前までの演出が最後まで再生し終わる)を
> 待ってから`showRecruitShowcase()`でダイアログを開く。これは、タルが
> 飛んでいく演出などrecruit直前の見せ場を中途半端に止めたくなかったため
> (「そのターンの残り」に限って保留する、という本文の意図をそのまま
> 汲んだ形)。ダイアログを閉じると`endRecruitShowcase()`→
> `advanceTurnPlayback()`で次の区切りを再生する。1ターンで複数体が
> 同時に仲間になった場合も、区切りが複数生まれて自然に1体ずつ順番に
> ダイアログが出る(未決事項の1つ。下記参照)。
>
> 入力遮断は本文の指示どおり、既存の`document.activeElement`ガード
> (`src/view/input.ts`)をそのまま流用した。追加で`anyModalOpen()`に
> `namingDialog.isOpen`を加え、タッチ操作(`src/ui/touch-controls.ts`は
> `Input.press`を直接呼ぶため上記ガードを経由しない)経由の行動発火も
> 塞いだ。
>
> **モデル表示。** `GalleryView`(`src/view/gallery.ts`)を新規シーンなしで
> そのまま再利用し、`renderRecruitShowcase()`が図鑑ギャラリーの
> `renderGallery()`と同じパターンで`renderer.renderer.render(gallery.scene,
> gallery.camera)`に描画先を丸ごと差し替える。`GalleryView.show(model,
> false)`(シルエットにしない)。
>
> 未決事項だった点は次のとおり決めた。
> - **HUDは隠す。** フォトモード・図鑑ギャラリーの前例に倣い、
>   `showRecruitShowcase()`で`uiRoot.style.display = "none"`にする。
>   `#naming`が`#uiRoot`の子だとHUDごと隠れてしまうため、`index.html`側で
>   `#naming`を`#uiRoot`の外(`#gallery-info`・`#village-hint`と同じ階層)
>   へ移した(`#app`が`position: relative`なので`inset: 0`の意味は
>   変わらない)。
> - **1ターンに複数体が同時に仲間になった場合は1体ずつ順番に。**
>   `splitEventsAtRecruits`がrecruitごとに区切りを作る設計そのものが、
>   自然に「1体分の演出→ダイアログ→次の1体分の演出→ダイアログ…」を
>   実現する。まとめて1画面に並べる案は採らなかった(本文の想定どおり、
>   現状の仕様では発生しにくいケースのため、複雑な方の実装は避けた)。
>
> レイアウトについて1点、本文の想定から変えた判断がある。`GalleryView`の
> カメラ構図はどの種族も画面下寄り・やや小さめに映す(図鑑ギャラリーと
> 共通の構図で、ここは変えていない)。命名ボックスを図鑑の`#gallery-info`
> と同じく画面下側に置くと、ちょうどモデルと重なって隠れてしまうことが
> 実機確認で分かったため、`.naming-showcase`は入力ボックスを画面**上側**
> に置くことにした(構図そのものは既存の図鑑ギャラリーを踏襲し、変えて
> いない)。
>
> **動作確認。** `npx tsc --noEmit`・`npx vitest run`(既存1129件+新規5件、
> 全て成功)・`npm run build`に加え、`tools/playtest.mjs`のブラウザ/
> SwiftShader起動を流用したPlaywrightで実機確認した。特に「一時停止が
> 見た目だけでなく本物か」を検証するため、仲間にする個体とは別に敵性
> モンスターを隣接させたまま同じターンでタルを投げ、両者が同一ターン内で
> 殴り合う状況を作った上で: (1) ダイアログが開いている500ms間、敵の
> `Stage.worldOf()`(見た目のワールド座標)が完全に静止していること
> (2) ダイアログを閉じると位置が動き出すこと (3) 図鑑ギャラリーと同じ
> 5秒待機後の自動回転が実際に始まること (4) Enter確定でニックネームが
> HUDに反映されること (5) コンソール/ページエラーが出ないこと、を
> それぞれ確認した。`npm run playtest`(既存の通しプレイスクリプト、
> Escで「あとで」を選ぶ既存の仲間化テストを含む)も2回実行しどちらも
> エラーなしで完走した。

## 経緯

`plan/archive/companion-naming.md` で、仲間になった直後に名前を尋ねる
ダイアログ(`src/ui/naming-dialog.ts`)を実装済み。ただしこのダイアログは
**テキスト入力欄だけのモーダル**で、モンスターの姿は表示されない。

また、現状の呼び出し経路(`src/main.ts`)を確認すると、`recruit`イベントの
ハンドラは`submit()`内の同期処理の一部として`NamingDialog.show()`を
呼んでいるだけで、その後に続く`this.stage.applyEvents(events, ...)`が
**そのターンの残りのイベント(移動・攻撃などの演出)をそのまま再生**する。
つまりダイアログは「他の演出に浮かぶモーダル」に近く、体感として
「その瞬間だけ完全に止まって向き合う」ものにはなっていない。

今回の依頼は次の2点。

1. モンスターが仲間になったら、そこで**一旦ゲームを止める**。
2. そのダイアログで、**名前決定**と**モンスターモデルの表示**の両方を行う。

## 目的

`plan/gallery-mode.md`の図鑑ギャラリー(捕まえた種族を回転台に乗せて
じっくり見せる演出)と同じ質の見せ場を、**出会ったその瞬間**にも作る。
現状は種族名のテキストだけを見て名前を決めているが、実際の姿を見ながら
決められるようにする。

## 現状の実装(前提の整理)

- `src/main.ts`の`recruit`ハンドラ→`promptNaming()`→
  `NamingDialog.show()`。表示先は`#naming`要素で、`<input type="text">`
  1つと見出し・ヒント文言のみ(`src/ui/naming-dialog.ts`)。
- `submit()`は`buildSubmitEventHandlers`でそのターンの`events`配列を
  同期的に一巡した**あとで**、`this.stage.applyEvents(events, ...)`が
  アニメーション再生の`lock`時間をまとめて算出・再生する。recruit
  ハンドラが呼ばれる時点では、まだそのターンの他の演出(自分やモンスター
  の移動・攻撃など)がこれから再生される/進行中の場合がある。
- モデル表示については、`plan/gallery-mode.md`で実装済みの
  `GalleryView`(`src/view/gallery.ts`)が使える。1体のモデルを
  ダンジョンとは別の小さな`THREE.Scene`に置き、待機モーションを
  再生しながら自動回転させる「回転台」の仕組みで、`show(model,
  silhouette)`を呼ぶだけで表示を切り替えられる。

## 修正方針

### 1. recruitを境にそのターンのイベント再生を一時停止する

そのターンの`events`配列のうち、recruitイベントより後ろの再生
(残りの移動・攻撃演出等)を、命名ダイアログを閉じるまで保留する。

- 厳密な分割再生用のAPIを`Stage`側に足すか、`main.ts`側で`events`を
  recruitの位置で2つに分け、前半を再生→ダイアログを閉じたら後半を
  改めて`applyEvents`に渡す、のどちらでもよい(実装側の裁量に委ねる)。
  大事なのは**recruitの瞬間、以降の演出が進まなくなること**。
- 一時停止中は新しい操作コマンドも受け付けない。既存の
  `NamingDialog`が`document.activeElement`経由で移動キー等を
  ゲーム側へ素通しさせないガード(`src/view/input.ts`、
  `plan/archive/companion-naming.md`で導入済み)をそのまま流用できる。

### 2. ダイアログにモデル表示を追加する

`plan/gallery-mode.md`の`GalleryView`をそのまま再利用する。

- 仲間になった個体の`speciesId`に対応するモデルを
  `GalleryView.show(model, false)`(捕まえた直後なのでシルエットに
  しない)で回転台に乗せ、待機モーションを再生した状態で表示する。
- 新規のThree.jsシーン設計は不要。ダイアログのどこにこの表示領域を
  差し込むか(`#naming`パネル内に埋め込むか、図鑑ギャラリーと同様に
  ダンジョンの描画を一時的にこのシーンへ丸ごと差し替えるか)は実装側の
  裁量とする。
- 手動カメラ操作(`plan/gallery-interactive-camera.md`のQ/E・+/-)は
  ここでは追加しない。名前を決めるための短い一幕であり、図鑑のように
  じっくり回して見比べる場面ではないため自動回転のみでよい
  (`design/balance-philosophy.md`の「新しい入力を増やさない」方針)。

### 3. ダイアログの構成

- 見出し:既存のまま「(種族名)に名前をつける?」
- モデル表示:見出しの下、または横に回転するモンスターモデル。
- 入力欄・ヒント文言:既存のまま(Enter 決定 / Esc あとで)。
- Escで「あとで」を選んだ場合の挙動(名付けない)は現状を維持する。

## 対象外

- カメラの手動操作(Q/E・+/-)をこのダイアログに追加すること
- モデル表示領域のレイアウト・デザインの最終確定(実装時は既存の
  図鑑ギャラリーの見た目を踏襲する想定)
- 命名タイミングそのものの変更。「仲間になった直後に尋ねる」
  「あとでねむり小屋(`plan/archive/monster-fusion.md`)で改名できる」
  という`plan/archive/companion-naming.md`の決定はそのまま維持する

## 未決事項

- recruit以降のイベント再生保留を、`Stage`側のAPI変更で厳密にやるか、
  `main.ts`側で`events`配列を分割して2回`applyEvents`を呼ぶだけで
  済ませるか
- 一時停止中、HUD(HP・満腹度等)を隠すかどうか(フォトモード・図鑑
  ギャラリーはどちらも隠す方針を採っている)
- 1ターンで複数体が同時に仲間になるケース(タルを複数同時に開けることは
  現状の仕様上なさそうだが、あり得るなら1体ずつ順番にダイアログを
  出すか、まとめて1画面に並べるか)
