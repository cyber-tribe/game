import { TILE_CORRIDOR, TILE_ROOM, type FloorState } from "../core/types";
import type { PlayerState } from "../entities/player";

const COLORS = {
  roomLit: "#5d6480",
  roomSeen: "#333a52",
  corridorLit: "#4a5170",
  corridorSeen: "#2a3048",
  stairs: "#f0c860",
  item: "#7fd6a0",
  trap: "#e06c78",
  monster: "#ff6b81",
  ally: "#9d7bff",
  barrel: "#c08a4a",
  player: "#7fd6ff",
} as const;

/**
 * 全体図。この手のローグライクはこれが無いと自分がどこにいるか分からなくなる。
 * 探索済みの地形だけを描き、今見えている範囲は明るく塗る。
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ミニマップの 2D コンテキストを取得できない");
    this.ctx = ctx;
  }

  draw(floor: FloorState, player: PlayerState): void {
    const { width, height } = floor;
    const scale = Math.max(
      1,
      Math.floor(Math.min(this.canvas.width / width, this.canvas.height / height)),
    );
    const offsetX = Math.floor((this.canvas.width - width * scale) / 2);
    const offsetY = Math.floor((this.canvas.height - height * scale) / 2);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = floor.tiles[y * width + x]!;
        if (!tile.explored) continue;
        if (tile.kind === TILE_ROOM) {
          ctx.fillStyle = tile.visible ? COLORS.roomLit : COLORS.roomSeen;
        } else if (tile.kind === TILE_CORRIDOR) {
          ctx.fillStyle = tile.visible ? COLORS.corridorLit : COLORS.corridorSeen;
        } else {
          continue;
        }
        ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
      }
    }

    const dot = (x: number, y: number, color: string, size = scale) => {
      ctx.fillStyle = color;
      const pad = (scale - size) / 2;
      ctx.fillRect(offsetX + x * scale + pad, offsetY + y * scale + pad, size, size);
    };

    const stairsTile = floor.tiles[floor.stairs.y * width + floor.stairs.x];
    if (stairsTile?.explored) dot(floor.stairs.x, floor.stairs.y, COLORS.stairs);

    for (const trap of floor.traps) {
      if (!trap.revealed) continue;
      if (!floor.tiles[trap.pos.y * width + trap.pos.x]?.explored) continue;
      dot(trap.pos.x, trap.pos.y, COLORS.trap, Math.max(2, scale - 1));
    }

    for (const ground of floor.items) {
      if (!floor.tiles[ground.pos.y * width + ground.pos.x]?.visible) continue;
      dot(ground.pos.x, ground.pos.y, COLORS.item, Math.max(2, scale - 1));
    }

    for (const barrel of floor.barrels) {
      if (!floor.tiles[barrel.pos.y * width + barrel.pos.x]?.explored) continue;
      dot(barrel.pos.x, barrel.pos.y, COLORS.barrel, Math.max(2, scale - 1));
    }

    for (const actor of floor.actors) {
      if (!actor.alive) continue;
      if (actor.kind === "monster") {
        if (!floor.tiles[actor.pos.y * width + actor.pos.x]?.visible) continue;
        dot(actor.pos.x, actor.pos.y, COLORS.monster);
      } else if (actor.kind === "ally") {
        // 仲間は見えていなくても位置が分かる。連れ歩いているのだから当然
        dot(actor.pos.x, actor.pos.y, COLORS.ally);
      }
    }

    dot(player.pos.x, player.pos.y, COLORS.player);
  }
}
