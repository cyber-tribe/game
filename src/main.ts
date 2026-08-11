import * as THREE from "three";
import { Game, type Command } from "./game";
import type { GameEvent } from "./core/events";
import { walkableAt } from "./core/types";
import { chebyshev, eq } from "./core/grid";
import { SPECIES } from "./entities/species";
import { ITEMS } from "./items/catalog";
import { Assets } from "./view/assets";
import { Hud } from "./view/hud";
import { Input } from "./view/input";
import { Minimap } from "./view/minimap";
import { Renderer } from "./view/renderer";
import { Stage } from "./view/stage";
import { InventoryMenu } from "./ui/menu";
import { loadSave, recordRun, type SaveData } from "./save";

const MAX_DEPTH = 10;

/** 読み込むモデルの一覧。種族表とアイテム表から自動的に集める */
function modelNames(): string[] {
  const names = new Set<string>(["garudo", "wall", "floor", "stairs"]);
  for (const species of SPECIES) names.add(species.model);
  for (const item of ITEMS) names.add(item.model);
  for (const kind of ["damage", "sleep", "alarm", "pitfall"]) names.add(`trap_${kind}`);
  return [...names];
}

class App {
  private readonly renderer: Renderer;
  private readonly assets = new Assets();
  private readonly stage: Stage;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly input = new Input();
  private readonly menu: InventoryMenu;
  private readonly canvas: HTMLCanvasElement;

  private game!: Game;
  private save: SaveData;
  /** 入力を受け付けない残り時間。アニメーションが流れているあいだ */
  private lock = 0;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private ended = false;

  constructor() {
    this.canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
    this.renderer = new Renderer(this.canvas);
    this.stage = new Stage(this.renderer.scene, this.assets);
    this.hud = new Hud(document.querySelector<HTMLElement>("#ui")!);
    this.minimap = new Minimap(document.querySelector<HTMLCanvasElement>("#minimap")!);
    this.menu = new InventoryMenu(document.querySelector<HTMLElement>("#menu")!);
    this.save = loadSave();

    this.input.onKey = (code) => this.menu.handleKey(code);
  }

  async start(): Promise<void> {
    await this.assets.loadAll(modelNames());
    document.querySelector<HTMLElement>("#loading")!.style.display = "none";
    this.newRun();
    this.loop();
  }

  private newRun(): void {
    this.game = new Game({ seed: (Math.random() * 0xffffffff) >>> 0, maxDepth: MAX_DEPTH });
    this.ended = false;
    this.lock = 0;
    this.menu.hide();
    this.hud.hideOverlay();
    this.stage.enterFloor(this.game.floor);
    this.renderer.setFocus(this.game.player.pos, true);
    this.hud.update(this.game.player, this.game.depth);
    this.minimap.draw(this.game.floor, this.game.player);
    this.hud.log(`地下1階。最深記録は ${this.save.deepest} 階。`);
    this.hud.log("洞窟に降りた。階段をさがそう。");
  }

  // ------------------------------------------------------------ ループ

  private loop = (): void => {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;

    this.step(dt);

    this.stage.update(dt, this.elapsed);
    // 松明はプレイヤーの見た目の位置に付いてくる。マス単位の座標ではなく
    // 補間中の位置を使わないと、光だけが先に動いてしまう
    const here = this.stage.playerWorld(this.game.player);
    this.renderer.playerLight.position.set(here.x, 2.0, here.z);
    this.renderer.setFocus(this.game.player.pos);
    this.renderer.update(dt);
    this.drainDamageFx();
    this.renderer.render();

    requestAnimationFrame(this.loop);
  };

  private step(dt: number): void {
    this.lock = Math.max(0, this.lock - dt);

    // カメラ操作はいつでも受け付ける
    let action = this.input.takeAction();
    while (action) {
      if (this.handleGlobalAction(action)) {
        action = this.input.takeAction();
        continue;
      }
      if (!this.ended && !this.menu.isOpen && this.lock <= 0) {
        this.handleAction(action);
      }
      action = this.input.takeAction();
    }

    if (this.ended || this.menu.isOpen || this.lock > 0) return;

    const dir = this.input.direction();
    if (dir === null) return;
    if (this.input.turnOnly) {
      this.submit({ type: "face", dir });
      return;
    }
    this.submit({ type: "move", dir });
  }

  /** メニュー中でも受け付ける操作 */
  private handleGlobalAction(action: string): boolean {
    switch (action) {
      case "rotateLeft":
        this.renderer.rotate(1);
        return true;
      case "rotateRight":
        this.renderer.rotate(-1);
        return true;
      case "zoomIn":
        this.renderer.zoom(-1.5);
        return true;
      case "zoomOut":
        this.renderer.zoom(1.5);
        return true;
      case "restart":
        if (this.ended) {
          this.newRun();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  private handleAction(action: string): void {
    switch (action) {
      case "inventory":
        this.menu.show(this.game.player, (cmd) => this.submit(cmd));
        break;
      case "wait":
        this.submit({ type: "wait" });
        break;
      case "confirm":
        // 足元の状況に応じて、階段を降りるか拾うかを選ぶ
        if (eq(this.game.player.pos, this.game.floor.stairs)) {
          this.submit({ type: "descend" });
        } else {
          this.submit({ type: "pickup" });
        }
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ コマンド実行

  private submit(cmd: Command): void {
    const beforeDepth = this.game.depth;
    const events = this.game.command(cmd);
    if (events.length === 0) return;

    for (const event of events) {
      if (event.type === "message") this.hud.log(event.text);
    }

    const changedFloor = this.game.depth !== beforeDepth;
    if (changedFloor) {
      this.stage.enterFloor(this.game.floor);
      this.renderer.setFocus(this.game.player.pos, true);
      this.lock = 0.25;
      this.save.deepest = Math.max(this.save.deepest, this.game.depth);
    } else {
      this.stage.syncActors(this.game.floor);
      this.lock = this.stage.applyEvents(events, this.game.floor, this.input.direction() !== null);
      this.stage.updateActorVisibility(this.game.floor);
    }

    this.stage.dungeon.refresh(this.game.floor);
    this.hud.update(this.game.player, this.game.depth);
    this.minimap.draw(this.game.floor, this.game.player);

    const over = events.find((e): e is Extract<GameEvent, { type: "gameOver" }> =>
      e.type === "gameOver",
    );
    if (over) this.finish(over.reason);
  }

  private finish(reason: string): void {
    this.ended = true;
    const cleared = this.game.status === "cleared";
    this.save = recordRun(this.save, {
      depth: this.game.depth,
      level: this.game.player.level,
      cleared,
    });
    this.hud.showOverlay(
      cleared ? "だっしゅつ成功!" : "ちからつきた……",
      `${reason}  (Lv ${this.game.player.level} / ${this.game.turnCount} ターン)`,
      `最深記録 ${this.save.deepest} 階 ・ 挑戦 ${this.save.runs} 回 — R キーでもう一度`,
    );
  }

  private drainDamageFx(): void {
    const queue = this.stage.damageQueue;
    while (queue.length > 0) {
      const fx = queue.shift()!;
      this.hud.spawnDamage(fx, this.renderer.camera, this.canvas);
    }
  }

  // ---------------------------------------------------------- 動作確認用

  /** 階段まで歩かずに次の階へ。ヘッドレスでの通し確認に使う */
  debugDescend(): void {
    this.game.player.pos = { ...this.game.floor.stairs };
    this.submit({ type: "descend" });
  }

  /** 一番近いモンスターの隣に立ち、殴りかかるべき方向キーを返す */
  debugFightNearest(): { key: string; name: string } | { key: null; name: string } {
    const player = this.game.player;
    const floor = this.game.floor;
    const monsters = floor.actors.filter((a) => a.kind === "monster" && a.alive);
    if (monsters.length === 0) return { key: null, name: "モンスターがいない" };

    let nearest = monsters[0]!;
    for (const m of monsters) {
      if (chebyshev(m.pos, player.pos) < chebyshev(nearest.pos, player.pos)) nearest = m;
    }
    // モンスターの西隣が空いていればそこへ、駄目なら東隣へ
    for (const [dx, key] of [
      [-1, "ArrowRight"],
      [1, "ArrowLeft"],
    ] as const) {
      const spot = { x: nearest.pos.x + dx, y: nearest.pos.y };
      if (!walkableAt(floor, spot)) continue;
      if (floor.actors.some((a) => a.alive && a.pos.x === spot.x && a.pos.y === spot.y)) continue;
      player.pos = spot;
      this.stage.viewOf(player.id)?.setPosition(spot);
      this.submit({ type: "wait" });
      this.renderer.setFocus(player.pos, true);
      return { key, name: nearest.name };
    }
    return { key: null, name: `${nearest.name} の隣が空いていない` };
  }

  debugGive(defId: string): void {
    this.game.giveItem(defId);
    this.hud.update(this.game.player, this.game.depth);
  }

  debugStats(): Record<string, unknown> {
    const floor = this.game.floor;
    return {
      depth: this.game.depth,
      turn: this.game.turnCount,
      status: this.game.status,
      hp: `${this.game.player.hp}/${this.game.player.maxHp}`,
      satiety: Math.round(this.game.player.satiety),
      monsters: floor.actors.filter((a) => a.kind === "monster" && a.alive).length,
      items: floor.items.length,
      traps: floor.traps.length,
      rooms: floor.rooms.length,
      exploredTiles: floor.tiles.filter((t) => t.explored).length,
      visibleTiles: floor.tiles.filter((t) => t.visible).length,
      drawCalls: this.renderer.renderer.info.render.calls,
      triangles: this.renderer.renderer.info.render.triangles,
    };
  }
}

const app = new App();
(globalThis as unknown as { __app: App }).__app = app;
app.start().catch((error: unknown) => {
  const loading = document.querySelector<HTMLElement>("#loading");
  if (loading) {
    loading.innerHTML = `<h1>読み込みに失敗しました</h1><p>${String(error)}</p>`;
  }
  console.error(error);
});
