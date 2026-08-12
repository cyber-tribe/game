/**
 * localStorage の最小モック。テストのたびに個別定義されていたものを集約した
 * (tests/save-compat.test.ts 等、複数ファイルで同一実装が繰り返されていた)。
 *
 * 単純な `withMockedLocalStorage(run)` のほか、`slot0` を事前に書き込んでおく
 * `withMockedLocalStorage(raw, run)` の形もある(save-compat.test.ts が使う)。
 */
type Store = Map<string, string>;

const SLOT0_KEY = "garudo-dungeon/v1/slot0";

function install(store: Store): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

export function withMockedLocalStorage(run: (store: Store) => void): void;
export function withMockedLocalStorage(raw: unknown, run: (store: Store) => void): void;
export function withMockedLocalStorage(...args: unknown[]): void {
  const hasRaw = args.length > 1;
  const raw = hasRaw ? args[0] : undefined;
  const run = (hasRaw ? args[1] : args[0]) as (store: Store) => void;

  const original = globalThis.localStorage;
  const store: Store = new Map();
  if (hasRaw) store.set(SLOT0_KEY, JSON.stringify(raw));
  install(store);
  try {
    run(store);
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  }
}
