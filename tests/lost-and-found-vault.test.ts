import { describe, expect, it } from "vitest";
import { LOST_AND_FOUND_VAULT_ID, dungeonById, isDungeonUnlocked } from "../src/entities/dungeons";
import { placeSecretPassage } from "../src/domain/dungeon/populate";
import { Rng } from "../src/core/rng";
import { generateFloor } from "../src/domain/dungeon/generate";
import { Game } from "../src/application/dungeonRun/game";
import { addFoundVaultPassage, initialSave } from "../src/save";
import { dirFromDelta } from "../src/core/grid";

describe("entities/dungeons.ts: 忘れ物蔵", () => {
  it("8地方すべての隠し通路を見つけるまでは未解放", () => {
    const vault = dungeonById(LOST_AND_FOUND_VAULT_ID);
    expect(isDungeonUnlocked(vault, 999, 4, 7)).toBe(false);
    expect(isDungeonUnlocked(vault, 999, 4, 8)).toBe(true);
  });

  it("最深到達記録・村の発展段階には左右されない(隠し通路の数だけが条件)", () => {
    const vault = dungeonById(LOST_AND_FOUND_VAULT_ID);
    expect(isDungeonUnlocked(vault, 0, 1, 8)).toBe(true);
  });

  it("野生モンスターの湧き数・満腹度の減りに専用の倍率を持つ", () => {
    const vault = dungeonById(LOST_AND_FOUND_VAULT_ID);
    expect(vault.monsterCountMul).toBe(0.5);
    expect(vault.satietyDrainMul).toBe(1.5);
  });
});

describe("save.ts: addFoundVaultPassage", () => {
  it("見つけた地方idが記録される", () => {
    let save = initialSave();
    save = addFoundVaultPassage(save, "region1");
    expect(save.foundVaultPassages).toEqual(["region1"]);
  });

  it("同じ地方を重複して積まない", () => {
    let save = initialSave();
    save = addFoundVaultPassage(save, "region1");
    save = addFoundVaultPassage(save, "region1");
    expect(save.foundVaultPassages).toEqual(["region1"]);
  });

  it("未知の地方idは無視される", () => {
    const save = initialSave();
    const next = addFoundVaultPassage(save, "region9");
    expect(next).toBe(save);
  });
});

describe("dungeon/populate.ts: placeSecretPassage", () => {
  it("通常の部屋に隣接する壁タイルへ隠し通路を1本配置する", () => {
    let placed = false;
    for (let seed = 1; seed <= 30 && !placed; seed++) {
      const floor = generateFloor(new Rng(seed), { depth: 2 });
      placeSecretPassage(new Rng(seed), floor, "region1");
      placed = floor.secretPassages.length === 1;
    }
    expect(placed).toBe(true);
  });

  it("配置した位置は壁タイルで、hintedはfalseから始まる", () => {
    const floor = generateFloor(new Rng(1), { depth: 2 });
    placeSecretPassage(new Rng(1), floor, "region1");
    const secret = floor.secretPassages[0];
    if (secret) {
      const tile = floor.tiles[secret.pos.y * floor.width + secret.pos.x];
      expect(tile?.kind).toBe(0); // TILE_WALL
      expect(secret.hinted).toBe(false);
    }
  });
});

/** 指定したマスへ隣接する歩けるマスから1歩だけ踏み出し、そのイベント列を返す */
function moveOnto(game: Game, target: { x: number; y: number }): ReturnType<Game["command"]> | undefined {
  const candidates: Array<{ from: { x: number; y: number }; dir: 0 | 2 | 4 | 6 }> = [
    { from: { x: target.x, y: target.y - 1 }, dir: 4 },
    { from: { x: target.x - 1, y: target.y }, dir: 2 },
    { from: { x: target.x, y: target.y + 1 }, dir: 0 },
    { from: { x: target.x + 1, y: target.y }, dir: 6 },
  ];
  for (const { from, dir } of candidates) {
    if (from.x < 0 || from.y < 0 || from.x >= game.floor.width || from.y >= game.floor.height) continue;
    const tile = game.floor.tiles[from.y * game.floor.width + from.x];
    if (!tile || tile.kind === 0) continue;
    game.player.pos = from;
    return game.command({ type: "move", dir });
  }
  return undefined;
}

describe("game.ts: 隠し通路の発見(気配のヒント→バンプで探る)", () => {
  it("表の寝穴の地方の2階目には隠し通路が生成される", () => {
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const game = new Game({ seed, startDepth: 2 });
      found = game.floor.secretPassages.length > 0;
    }
    expect(found).toBe(true);
  });

  it("地方境界の階(6の倍数)には隠し通路が生成されない", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const game = new Game({ seed, startDepth: 6 });
      expect(game.floor.secretPassages).toHaveLength(0);
    }
  });

  it("隠し壁に隣接するマスへ移動すると、気配のヒントメッセージが1度だけ流れる", () => {
    let game: Game | undefined;
    for (let seed = 1; seed <= 30 && !game; seed++) {
      const candidate = new Game({ seed, startDepth: 2 });
      if (candidate.floor.secretPassages.length > 0) game = candidate;
    }
    expect(game).toBeDefined();
    if (!game) return;
    const secret = game.floor.secretPassages[0]!;
    const adjacent = [
      { x: secret.pos.x - 1, y: secret.pos.y },
      { x: secret.pos.x + 1, y: secret.pos.y },
      { x: secret.pos.x, y: secret.pos.y - 1 },
      { x: secret.pos.x, y: secret.pos.y + 1 },
    ].find((p) => {
      const tile = game!.floor.tiles[p.y * game!.floor.width + p.x];
      return tile && tile.kind !== 0;
    });
    expect(adjacent).toBeDefined();
    if (!adjacent) return;
    // 野生モンスターがこの検証を邪魔しないよう取り除く(移動が攻撃・入れ替えに
    // ならないようにする)
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const events = moveOnto(game, adjacent);
    expect(events).toBeDefined();
    expect(events?.some((e) => e.type === "message" && e.text.includes("隙間の風"))).toBe(true);
    expect(secret.hinted).toBe(true);

    // 2回目以降、別の隣接マスへ移動しても、既にhinted済みなので再度は流れない
    const events2 = moveOnto(game, adjacent);
    expect(events2?.some((e) => e.type === "message" && e.text.includes("隙間の風"))).toBe(false);
  });

  it("隠し壁へバンプを繰り返すと、いずれ崩れて通路になりsecretPassageFoundイベントが出る", () => {
    let game: Game | undefined;
    let secret: { x: number; y: number } | undefined;
    for (let seed = 1; seed <= 30 && !game; seed++) {
      const candidate = new Game({ seed, startDepth: 2 });
      const s = candidate.floor.secretPassages[0];
      if (s) {
        game = candidate;
        secret = s.pos;
      }
    }
    expect(game).toBeDefined();
    expect(secret).toBeDefined();
    if (!game || !secret) return;

    const adjacent = [
      { x: secret.x - 1, y: secret.y },
      { x: secret.x + 1, y: secret.y },
      { x: secret.x, y: secret.y - 1 },
      { x: secret.x, y: secret.y + 1 },
    ].find((p) => {
      const tile = game!.floor.tiles[p.y * game!.floor.width + p.x];
      return tile && tile.kind !== 0;
    });
    expect(adjacent).toBeDefined();
    if (!adjacent) return;
    // 野生モンスターがこの検証を邪魔しないよう取り除く
    game.floor.actors = game.floor.actors.filter((a) => a.kind === "player");
    const dir = dirFromDelta(secret.x - adjacent.x, secret.y - adjacent.y);

    game.player.pos = adjacent;
    let revealed = false;
    for (let i = 0; i < 200 && !revealed; i++) {
      const events = game.command({ type: "move", dir });
      game.player.pos = adjacent; // バンプでは移動しないはずだが、念のため元の位置に戻す
      revealed = events.some((e) => e.type === "secretPassageFound");
    }
    expect(revealed).toBe(true);
    const tile = game.floor.tiles[secret.y * game.floor.width + secret.x];
    expect(tile?.kind).not.toBe(0); // TILE_WALLではなくなっている
  });
});
