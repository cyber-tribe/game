import { createServer, type ViteDevServer } from "vite";

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

/**
 * 箱庭ダンジョン(plan/game/test-dungeon-harness.md)のE2Eテスト用に、
 * mode: "test" でVite devサーバーを起動する。これによりGame/main.tsの
 * `import.meta.env.MODE === "test"` ガードの中にあるテスト注入フック
 * (window.__testHarness)が有効になる(本番ビルドでは同じガードにより
 * 丸ごとdead code除去されて消える。src/application/dungeonRun/game.ts参照)。
 *
 * ポート0で起動しOSに空きポートを割り当てさせるので、複数のE2Eテスト
 * ファイルが並行実行されても衝突しない
 */
export async function startTestServer(): Promise<TestServer> {
  const server: ViteDevServer = await createServer({
    mode: "test",
    server: { port: 0, host: "127.0.0.1" },
    logLevel: "warn",
  });
  await server.listen();

  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("startTestServer: サーバーのポートを取得できなかった");
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => server.close(),
  };
}
