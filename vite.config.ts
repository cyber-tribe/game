import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  plugins: [
    // PWA対応(plan/game/archive/pwa-support.md)。generateSW戦略で
    // Workboxにprecacheマニフェスト(ハッシュ付きJS/CSS/HTML)を
    // ビルド時に自動生成させる。registerType/skipWaiting/clientsClaimは
    // すべて既定値のまま(= 新SWは待機し、次回起動時に切り替わる。
    // ダイブ中に強制リロードは走らない)。
    VitePWA({
      registerType: "prompt",
      manifest: false, // public/manifest.webmanifest を直接 index.html から参照する(相対パス管理を一本化)
      workbox: {
        // 既定のJS/CSS/HTMLに加えて、public/models(glb)・public/audio(wav)・
        // アイコン・manifest自体もprecache対象にする(計算約11.5MB、
        // 初回ロードのみの負担として許容する方針。plan本文参照)
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,wav,glb}"],
        // BGMのステレオ化・ループ延長(plan/sound/archive/bgm-quality-upgrade.md)で
        // 一部の.wavがWorkbox既定の2MiB上限を超えたため引き上げる
        // (最大の個別ファイルで約2.8MB。全部precacheする方針は変えない)
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // GitHub API(バグ報告ボタンはwindow.openで別タブ遷移するだけだが、
        // 将来のみんなの記録機能等も含め念のため)はSWのruntime cache対象外にする。
        // 万一マッチしても素通しでNetworkOnlyにし、キャッシュから古い/失敗した
        // レスポンスを返さないようにする
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => /(^|\.)github\.com$/.test(url.hostname),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        // three.js をゲームのコードと別のファイルに切り出す。
        // main へのマージのたびに Pages へ自動公開している運用なので、
        // 1つにまとめたままだと、ゲーム側を1行直しただけで戻ってきた
        // プレイヤーに three ごと再ダウンロードさせることになる。
        // three はほとんど動かないので、分けておけばキャッシュが効く。
        // Vite 8 の rolldown は関数形式しか受け付けない
        manualChunks: (id: string) => (id.includes("node_modules/three/") ? "three" : undefined),
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
