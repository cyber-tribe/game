> **実装済み。**
>
> **1. Web App Manifest**: `public/manifest.webmanifest`を新規作成し、
> `index.html`から`<link rel="manifest" href="manifest.webmanifest">`
> (相対パス、`base: "./"`と同じ規約)で参照。`name`/`short_name`・
> `display: "fullscreen"`・`orientation: "landscape"`・
> `start_url`/`scope: "./"`は本文書の指定どおり。`background_color`/
> `theme_color`は`index.html`の`html, body { background: #05060c; }`
> (`#loading`等も同色)にあわせて`#05060c`で統一した。あわせて
> `<meta name="theme-color">`・iOS向けの`apple-mobile-web-app-capable`
> 等のmetaタグも追加している。
>
> **2. アイコン(題材: 樽)**: 未決事項だった題材は、主人公ガルド
> (手足があり縮小すると潰れる)ではなく**樽**を選んだ。丸いシルエットで
> 小さいサイズでも視認しやすく、かつこのゲームの象徴的ギミックでもある
> ため。既存のBlenderパイプライン(`tools/models/common.py`・
> `tools/models/props.py`の`build_barrel()`)をそのまま流用し、新規の
> `tools/generate_pwa_icons.py`(`tools/build_models.py`と同じ
> `tools/venv/bin/python`実行)でレンダリングした。背景は透過PNG
> (`icon-192.png`・`icon-512.png`)。`icon-512-maskable.png`はカメラを
> 大きく引いて余白を作り、実際にアルファ値のバウンディングボックスを
> 計測して中心80%の安全領域(半径40%)に収まることを確認済み
> (幅34%・高さ41%相当)。`apple-touch-icon.png`(180x180)だけは
> iOSの透過PNG扱いが環境によって不安定なため、`#05060c`で不透明に
> 塗って書き出している。3Dレンダリングが実装セッションの裁量の範囲で
> 十分きれいに出たため、フラット図案へのフォールバックは使わなかった。
> `tools/generate_pwa_icons.py`は今後アイコンを差し替えたくなったとき
> のために残してある(`tools/build_models.py`同様、モデル名を変えれば
> 再生成できる)。
>
> **3. Service Worker**: `vite-plugin-pwa`(devDependency、generateSW
> 戦略)を`vite.config.ts`に追加。`manifest: false`にして
> `public/manifest.webmanifest`の手書きファイルをそのまま使う一本化
> にした(プラグインの自動生成マニフェストとの二重管理を避ける)。
> - **precache範囲**: `workbox.globPatterns`を既定の`js,css,html`から
>   `svg,png,ico,webmanifest,wav,glb`まで拡張し、`public/models`
>   (glb)・`public/audio`(wav)・アイコン・manifest本体もすべて
>   precacheに含めた。本文が推奨していた「全部precache」をそのまま
>   採用(ビルドログで実測: 80エントリ・約13MB。最大の個別ファイルは
>   460KB前後で、Workboxの既定上限2MBには余裕で収まる)。初回ロード
>   時間の実測による使い分け判断は今回は不要だった。
> - **更新の流れ**: `registerType`/`skipWaiting`/`clientsClaim`は
>   すべてWorkboxの既定値のまま(明示的にtrueにしていない)。
>   ビルド後の`dist/sw.js`を確認し、`self.skipWaiting()`は
>   `postMessage`経由の`SKIP_WAITING`メッセージが来たときだけ動く
>   Workbox標準のリスナーとして埋め込まれているのみで、こちらから
>   送信するコードは追加していないため実際には発火しない。
>   `dist/registerSW.js`(`injectRegister: "auto"`の既定出力)も
>   単純に`navigator.serviceWorker.register(...)`を呼ぶだけで、
>   更新プロンプトUIの配線はしていない。よって「新SW検知→次回起動時に
>   切り替え」というWorkbox既定挙動のままになっている。
> - **GitHub APIの除外**: 実装時点でページ内から直接`fetch`している
>   GitHub API呼び出しは存在しなかった(バグ報告ボタン=
>   `src/entities/bugReport.ts`は`window.open`で別タブへ遷移するだけで、
>   このオリジンのSWが介在する`fetch`ではない。「みんなの記録」機能も
>   `design/server-architecture.md`に構想はあるが未実装)。とはいえ
>   本文書の指示どおり、将来この手の機能が増えても事故らないよう
>   `workbox.runtimeCaching`に`github.com`(サブドメイン含む)への
>   リクエストを`NetworkOnly`で明示的にマッチさせるルールを追加して
>   ある。ビルド後の`dist/sw.js`に該当の`registerRoute`が実際に
>   出力されていることを確認済み。
>
> **4. 既存機能との干渉チェック**: `src/ui/orientation-guard.ts`・
> `src/entities/orientation.ts`は今回のPRで一切変更していない
> (`matchMedia`ベースの縦持ち案内はそのまま)。フォトモードの
> `canvas.toDataURL`(`src/main.ts`)もコードは変更していないが、
> `display: "fullscreen"`環境での保存導線(長押し保存等)の挙動は
> 静的には確認できず、実機確認が必要な項目として残す。
>
> **5. 検証**: `npx tsc --noEmit`・`npx vitest run`(98ファイル/1179件
> 全通過)・`npm run build`は全て成功。ビルド後、`dist/manifest.webmanifest`・
> `dist/sw.js`・`dist/registerSW.js`・`dist/icons/*.png`の生成を確認。
> さらに`npm run build && npm run preview`で立てた本番ビルドに対して
> Playwright(headless Chromium、`tools/playtest.mjs`と同じ
> `/opt/pw-browsers`のChromiumを利用)で以下を確認した:
> - `<link rel="manifest">`のhrefからmanifestを取得し、JSONとして
>   パース可能・`name`/`short_name`/`display`/`orientation`/
>   `background_color`/`theme_color`/`icons`が期待どおりであること。
> - `navigator.serviceWorker.ready`が解決し、`getRegistrations()`で
>   `state: "activated"`のSWが1件登録されていること。
> - `context.setOffline(true)`後に`page.reload()`してもアプリシェル
>   (`<title>`・`#app`)が表示されること(オフラインでのアプリ起動を
>   headless環境で模擬確認)。
>
> 一方、本文書の受け入れ基準1〜3(実機Safari/Chromeでの「ホーム画面に
> 追加」導線・追加後のアイコン表示とブラウザUI非表示・2回目起動での
> 新版切り替わり)と、フォトモードの保存導線は、性質上headless環境では
> 再現できず**実機での確認が必要**。`display: "fullscreen"`で実機に
> 不都合が出た場合は、本文が挙げていたとおり`"standalone"`へ落とす
> フォールバックを検討する。

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
