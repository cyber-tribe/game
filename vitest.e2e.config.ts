import { defineConfig } from "vitest/config";

/**
 * 箱庭ダンジョン(plan/game/test-dungeon-harness.md)のPlaywright E2Eテスト専用の設定。
 * 実ブラウザの起動とVite devサーバーの起動を伴い重いため、通常の
 * `npm test`(vite.config.ts、tests/e2e/を除外)からは分離し、
 * `npm run test:e2e` からだけ実行する
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 45_000,
    hookTimeout: 45_000,
    // テストファイルごとに実ブラウザ+devサーバーを1つずつ起動する。並行実行すると
    // 複数のChromium・Viteが同時に走ってCPUを奪い合い、SwiftShaderのソフトウェア
    // 描画も相まってタイムアウトしやすくなる(tools/playtest.mjsが1本の
    // ブラウザに寄せているのと同じ理由)ため、ファイル単位は直列にする
    fileParallelism: false,
  },
});
