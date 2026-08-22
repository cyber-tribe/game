import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DDD Phase 8(plan/game/ddd-phase8-game-facade.md)の依存方向チェック。
 * ADR 0016が定める層の向き(domain/はapplication/・view/・ui/・
 * save/localStorageを参照しない)を、import文の静的走査で恒久的に守る。
 * ここが崩れたレビューは構造的に成立しなくなる、という完了条件そのもの。
 */

const SRC_ROOT = resolve(__dirname, "../src");
const DOMAIN_ROOT = join(SRC_ROOT, "domain");

const FORBIDDEN_PREFIXES = [
  join(SRC_ROOT, "application"),
  join(SRC_ROOT, "view"),
  join(SRC_ROOT, "ui"),
];
const FORBIDDEN_SAVE_LOCALSTORAGE = join(SRC_ROOT, "save", "localStorage");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** `from "..."` / `from '...'` の形の import 指定子だけを拾う(型のみimportも含む) */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const re = /from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    specifiers.push(m[1]!);
  }
  return specifiers;
}

function isForbidden(resolvedTarget: string): boolean {
  if (resolvedTarget === FORBIDDEN_SAVE_LOCALSTORAGE) return true;
  return FORBIDDEN_PREFIXES.some(
    (prefix) => resolvedTarget === prefix || resolvedTarget.startsWith(prefix + "/"),
  );
}

describe("architecture: domain/ の依存方向(plan/game/ddd-phase8-game-facade.md)", () => {
  it("domain/配下のファイルは application/・view/・ui/・save/localStorage をimportしていない", () => {
    const domainFiles = listTsFiles(DOMAIN_ROOT);
    expect(domainFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of domainFiles) {
      const source = readFileSync(file, "utf-8");
      for (const specifier of importSpecifiers(source)) {
        if (!specifier.startsWith(".")) continue; // パッケージ importは対象外
        const resolvedTarget = resolve(dirname(file), specifier);
        if (isForbidden(resolvedTarget)) {
          violations.push(`${relative(SRC_ROOT, file)} -> "${specifier}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
