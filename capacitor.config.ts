import type { CapacitorConfig } from "@capacitor/cli";

/**
 * `adr/0001-mobile-release-via-capacitor.md` の決定に基づく設定。
 * `npm run build` の成果物(`dist/`)をそのままネイティブの WebView に
 * 詰め込むだけで、ゲームロジック・描画コードは一切変更しない。
 */
const config: CapacitorConfig = {
  appId: "com.cybertribe.garudodungeon",
  appName: "少年ガルドと迷いの洞窟",
  webDir: "dist",
};

export default config;
