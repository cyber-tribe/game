import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
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
