# PWA対応(ホーム画面に追加してアプリとして遊べるようにする)

## 経緯

スマホでアプリとして遊びたいという要望に対し、当面は
`adr/0001-mobile-release-via-capacitor.md` のネイティブアプリ配信
(ストア審査・Apple Developer Program・ローカルのネイティブツール
チェインが必要)ではなく、**PWA化**で応える。Safari/Chromeの
「ホーム画面に追加」で、アイコン付き・ブラウザUI無しの全画面で起動
できるようにする。個人利用が目的なら、アカウント・審査・費用が一切
不要なこちらで十分。

ADRがPWA案を落とした理由は「収益化に弱い」であり、技術的な問題では
ない。Capacitor方針(ストア配信・収益化)はADRのまま生かし、PWAは
その手前の「今すぐアプリとして遊べる形」という位置づけにする。
両者は排他ではなく共存できる(同じ`dist/`にmanifestが増えるだけ)。

## 前提(現状の構成)

- ビルドはVite、`base: "./"`(相対パス)。GitHub Pagesへ
  `.github/workflows/deploy-pages.yml` がmainマージのたびに自動公開
  (`plan/game/archive/playtest-deployment.md`)。
- Pagesのサブパス配信(`https://<user>.github.io/<repo>/`)なので、
  manifest等のパスは**絶対パスにせず相対パスで書く**必要がある。
- セーブはlocalStorage完結・オンライン必須要素なし
  (`design/server-architecture.md`)。PWAの制約に干渉しない。
- 静的アセットは `public/models`(約7MB・54ファイル)+
  `public/audio`(約4.5MB)。

## 実装内容

### 1. Web App Manifest

`public/manifest.webmanifest` を追加し、`index.html` の`<head>`から
`<link rel="manifest" href="manifest.webmanifest">` で参照する。

- `name` / `short_name`: 「少年ガルドと迷いの洞窟」/「ガルド」
- `display`: `"fullscreen"`(ゲームなのでブラウザUIを完全に隠す。
  実機で不都合があれば`"standalone"`に落とす)
- `orientation`: `"landscape"`(タッチUIは横持ち前提。
  `plan/game/archive/touch-ui-overlap-fix.md` の縦持ち案内と整合)
- `background_color` / `theme_color`: ゲームの基調色(実装時に
  `index.html`の背景色と揃える)
- `start_url`: `"./"`、`scope`: `"./"`(Pagesのサブパス配信対応)

### 2. アイコン

- 192x192 / 512x512 のPNGを `public/icons/` に用意する。
- 題材は主人公ガルド、または樽(タルはこのゲームの象徴的ギミック)。
  既存の3Dモデルパイプライン(`tools/models/`)でレンダリングした
  画像を使ってよいし、実装セッションの裁量でシンプルな図案でもよい。
- iOS向けに `apple-touch-icon`(180x180)も`<link>`で追加する
  (iOSはmanifestのiconsを無視してこちらを見る)。
- `maskable` 用途(Androidの円形マスク)には、余白を持たせた
  512x512を1枚足す。

### 3. Service Worker(オフライン対応)

「ホーム画面から起動したら圏外でも遊べる」ためにService Workerを
追加する。方針:

- **アプリシェル(HTML/JS/CSS)**: precache。Viteのビルド成果物は
  ハッシュ付きファイル名なので、`vite-plugin-pwa`(Workbox)を使って
  ビルド時にprecacheマニフェストを自動生成するのが手堅い。
  手書きSWでバージョン管理を自作するより事故が少ない。
- **models / audio(計約11.5MB)**: precacheに全部含めてよい。
  合計十数MBは初回だけの負担で、以後の更新はハッシュ差分だけになる。
  もし初回ロードへの影響が気になるなら、ここだけruntime cache
  (cache-first)に落とす選択も実装側の裁量で可。
- **更新の流れ**: mainマージごとにPagesへ自動デプロイされる運用
  (`deploy-pages.yml`)なので、SWの更新は「新SW検知→即skipWaiting
  ではなく、次回起動時に切り替え」のデフォルト挙動でよい。
  ダイブ中にリロードが走ると`plan/game/archive/mid-dive-autosave.md`
  があるとはいえ体験が悪い。

### 4. 既存機能との干渉チェック(実装時に確認)

- **バグ報告ボタン**(`plan/game/archive/bug-report-button.md`)と
  **みんなの記録**(`plan/community-leaderboard.md`)はGitHub APIへの
  fetchを行う。SWのruntime cacheの対象外(network-only)にする。
- **フォトモードの画像保存**(`canvas.toDataURL`)はiOSのfullscreen
  表示だと保存導線が変わる可能性がある。実機で確認し、問題があれば
  `display`を`"standalone"`へ落とす。
- 縦持ち検知(`plan/game/archive/touch-ui-overlap-fix.md`の
  「横向きにしてください」案内)は、manifestの`orientation`が
  効かない環境(iOSは無視する)でも動くよう、既存の`matchMedia`
  実装をそのまま残す。

## 受け入れ基準

1. スマホのSafari/ChromeでPagesのURLを開き「ホーム画面に追加」すると、
   アイコン付きで追加され、起動時にブラウザUI(アドレスバー等)が
   表示されない。
2. 一度起動したあと機内モードにしても、ホーム画面から起動して
   タイトル〜ダイブまで遊べる(バグ報告・みんなの記録など
   ネットワーク必須の機能は失敗してよいが、ゲーム本体は動く)。
3. mainに新しいビルドがデプロイされたら、次回以降の起動で新版に
   切り替わる(遅くとも2回目の起動まで)。
4. 既存のWeb版(ブラウザでそのまま遊ぶ導線)の挙動が変わらない。

## 対象外

- Capacitorによるストア配信(ADR 0001の方針はそのまま。PWAは
  その手前の配信形態という位置づけ)
- プッシュ通知・バックグラウンド同期などPWAの発展的機能
- アイコンの最終デザイン詰め(まず動くものを用意し、気に入らなければ
  別PRで差し替える)

## 未決事項

- アイコンの題材(ガルドか、タルか、両方か)
- models/audioをprecacheに含めるかruntime cacheにするか(本文は
  precache推奨だが、初回ロード時間の実測次第で判断してよい)
