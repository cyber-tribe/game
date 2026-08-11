import * as THREE from "three";
import { Game, type Command, type RunSnapshot } from "./game";
import type { GameEvent } from "./core/events";
import { isFree, walkableAt } from "./core/types";
import { chebyshev, eq } from "./core/grid";
import { BARREL_MODELS, modelNames } from "./modelList";
import { Assets } from "./view/assets";
import { Hud } from "./view/hud";
import { Input } from "./view/input";
import { Minimap } from "./view/minimap";
import { Renderer } from "./view/renderer";
import { Stage } from "./view/stage";
import { ArtsMenu } from "./ui/arts";
import { InventoryMenu } from "./ui/menu";
import { NamingDialog } from "./ui/naming-dialog";
import { StanceMenu } from "./ui/stance";
import { TownScreen } from "./ui/town";
import {
  addKnownCheckpoint,
  clearRunSnapshot,
  fromStored,
  fuseMonsters,
  loadRunSnapshot,
  loadSave,
  markTutorialTipSeen,
  recordRun,
  renameStoredMonster,
  saveData,
  saveRunSnapshot,
  setTrainingFocus,
  takeFromHut,
  type SaveData,
  type StoredItem,
  type StoredMonster,
} from "./save";
import { TUTORIAL_TIPS, type TutorialTipId } from "./core/tutorial";
import type { Item } from "./core/types";
import type { TrainingFocus } from "./entities/player";

const MAX_DEPTH = 10;

class App {
  private readonly renderer: Renderer;
  private readonly assets = new Assets();
  private readonly stage: Stage;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly input = new Input();
  private readonly menu: InventoryMenu;
  private readonly stanceMenu: StanceMenu;
  private readonly artsMenu: ArtsMenu;
  private readonly town: TownScreen;
  private readonly namingDialog: NamingDialog;
  private readonly canvas: HTMLCanvasElement;

  private game!: Game;
  private save: SaveData;
  /** 入力を受け付けない残り時間。アニメーションが流れているあいだ */
  private lock = 0;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private ended = false;
  /** 記録の間(plan/records-hall.md)。このダイブ中に倒した・捕まえた数 */
  private diveDefeats = 0;
  private diveCaptures = 0;

  constructor() {
    this.canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
    this.renderer = new Renderer(this.canvas);
    this.stage = new Stage(this.renderer.scene, this.assets);
    this.hud = new Hud(document.querySelector<HTMLElement>("#ui")!);
    this.minimap = new Minimap(document.querySelector<HTMLCanvasElement>("#minimap")!);
    this.menu = new InventoryMenu(document.querySelector<HTMLElement>("#menu")!);
    this.stanceMenu = new StanceMenu(document.querySelector<HTMLElement>("#stance")!);
    this.artsMenu = new ArtsMenu(document.querySelector<HTMLElement>("#arts")!);
    this.town = new TownScreen(document.querySelector<HTMLElement>("#town")!);
    this.namingDialog = new NamingDialog(document.querySelector<HTMLElement>("#naming")!);
    this.save = loadSave();

    this.input.onKey = (code) =>
      this.town.handleKey(code) ||
      this.menu.handleKey(code) ||
      this.stanceMenu.handleKey(code) ||
      this.artsMenu.handleKey(code);
  }

  async start(): Promise<void> {
    await this.assets.loadAll(modelNames());
    document.querySelector<HTMLElement>("#loading")!.style.display = "none";

    // ダイブ中オートセーブ(plan/mid-dive-autosave.md)が残っていれば、
    // 拠点画面を経由せずそのままダイブの続きから再開する
    const snapshot = loadRunSnapshot();
    if (snapshot && snapshot.status === "playing") {
      this.resumeRun(snapshot);
    } else {
      if (snapshot) clearRunSnapshot(); // 正規に終わったあとの残骸(あるはずはないが念のため)
      // 先に1階を組んでおく。拠点の裏で洞窟が見えているほうが雰囲気が出る
      this.newRun([]);
      this.showTown();
    }
    this.loop();
  }

  /** 潜る前の拠点。倉庫から持ち込む道具・出発地点・鍛え方・仲間を選ぶ */
  private showTown(): void {
    this.hud.hideOverlay();
    this.town.show(
      this.save,
      (carry, storage, startDepth, trainingFocus, bringAllyUids) => {
        const { save: afterTake, taken } = takeFromHut(
          setTrainingFocus({ ...this.save, storage }, trainingFocus),
          bringAllyUids,
        );
        this.save = afterTake;
        saveData(this.save);
        this.newRun(carry, startDepth, trainingFocus, taken);
      },
      (axisUid, foodUid) => {
        const fused = fuseMonsters(this.save, axisUid, foodUid);
        if (!fused) return;
        this.save = fused.save;
        this.town.refreshSave(this.save);
      },
      (uid, current) => {
        this.namingDialog.show("名前を付け直す", current, (value) => {
          const renamed = renameStoredMonster(this.save, uid, value);
          if (!renamed) return;
          this.save = renamed;
          this.town.refreshSave(this.save);
        });
      },
    );
  }

  private newRun(
    carry: readonly StoredItem[],
    startDepth = 1,
    trainingFocus: TrainingFocus = "balance",
    bringAllies: readonly StoredMonster[] = [],
  ): void {
    this.diveDefeats = 0;
    this.diveCaptures = 0;
    const startingItems: Item[] = carry.map((stored, index) => fromStored(stored, index + 1));
    this.game = new Game({
      seed: (Math.random() * 0xffffffff) >>> 0,
      maxDepth: MAX_DEPTH,
      startingItems,
      startDepth,
      trainingFocus,
      bringAllies: [...bringAllies],
    });
    this.presentFloor();
    this.hud.log(`地下${this.game.depth}階。最深記録は ${this.save.deepest} 階。`);
    this.hud.log("洞窟に降りた。階段をさがそう。");
    // 「移動と攻撃」だけは特定のGameEventに紐づかないので、ここで直接出す
    this.showTutorialTip("moveAndAttack");
  }

  /**
   * ダイブ中オートセーブ(plan/mid-dive-autosave.md)からの復帰。
   * スナップショットは読み込んだ瞬間に消費し、以後の何度目かの再読み込みでは
   * 復帰できないようにする(「1回限りのクラッシュ対策」であり、
   * セーブ&ロードによるやり直しは想定していない)。
   */
  private resumeRun(snapshot: RunSnapshot): void {
    // オートセーブは記録の間(plan/records-hall.md)の途中集計までは持たないため、
    // 復帰後ぶんだけを数える(クラッシュ前の分は失われるが、致命的ではない)
    this.diveDefeats = 0;
    this.diveCaptures = 0;
    this.game = new Game({ seed: 0, resume: snapshot });
    clearRunSnapshot();
    this.presentFloor();
    this.hud.log("前回の続きから再開します。");
  }

  /** 新しいダイブ・復帰したダイブ、どちらでも共通の画面まわりの初期化 */
  private presentFloor(): void {
    this.ended = false;
    this.lock = 0;
    this.menu.hide();
    this.stanceMenu.hide();
    this.artsMenu.hide();
    this.hud.hideOverlay();
    this.stage.enterFloor(this.game.floor);
    this.renderer.setFocus(this.game.player.pos, true);
    this.hud.update(this.game.player, this.game.depth, this.game.allyList);
    this.minimap.draw(this.game.floor, this.game.player);
  }

  /** その場方式のチュートリアルヒント。まだ見ていなければ表示して既読にする */
  private showTutorialTip(id: TutorialTipId): void {
    if (this.save.seenTutorialTips.includes(id)) return;
    this.save = markTutorialTipSeen(this.save, id);
    this.hud.log(TUTORIAL_TIPS[id]);
  }

  /**
   * 仲間になった直後に名前をつけるか尋ねる(plan/companion-naming.md)。
   * Escで「あとで」を選べ、ねむり小屋でいつでも改名できる
   */
  private promptNaming(actorId: number, speciesName: string): void {
    const ally = this.game.allyList.find((a) => a.id === actorId);
    if (!ally) return;
    this.namingDialog.show(`${speciesName}に名前をつける?`, ally.nickname, (value) => {
      ally.nickname = value;
      this.hud.update(this.game.player, this.game.depth, this.game.allyList);
    });
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
      if (
        !this.ended &&
        !this.menu.isOpen &&
        !this.stanceMenu.isOpen &&
        !this.artsMenu.isOpen &&
        !this.town.isOpen &&
        this.lock <= 0
      ) {
        this.handleAction(action);
      }
      action = this.input.takeAction();
    }

    if (
      this.ended ||
      this.menu.isOpen ||
      this.stanceMenu.isOpen ||
      this.artsMenu.isOpen ||
      this.town.isOpen ||
      this.lock > 0
    ) {
      return;
    }

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
          this.showTown();
          return true;
        }
        // 生きていてめざめの階段の上にいれば、そこで区切って持ち帰る
        if (
          !this.menu.isOpen &&
          !this.stanceMenu.isOpen &&
          !this.artsMenu.isOpen &&
          !this.town.isOpen &&
          eq(this.game.player.pos, this.game.floor.stairs)
        ) {
          this.submit({ type: "bank" });
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
      case "liftBarrel":
        this.submit({ type: "liftBarrel" });
        break;
      case "throwBarrel":
        this.submit({ type: "throwBarrel" });
        break;
      case "orders":
        if (this.game.allyList.length === 0) {
          this.hud.log("指示できる仲間がいない。");
        } else {
          this.stanceMenu.show(this.game.allyList, (cmd) => this.submit(cmd));
        }
        break;
      case "arts":
        this.artsMenu.show(this.game.player, (cmd) => this.submit(cmd));
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
      // めざめの階段は、ダイブの結果によらず足を踏み入れた瞬間に記録する
      if (event.type === "checkpoint") this.save = addKnownCheckpoint(this.save, event.depth);
      if (event.type === "tutorialTip") this.showTutorialTip(event.id);
      if (event.type === "recruit") this.promptNaming(event.actorId, event.name);
      // 記録の間(plan/records-hall.md): 倒した・捕まえた数を積み上げる
      if (event.type === "die" && event.kind === "monster") this.diveDefeats++;
      if (event.type === "capture") this.diveCaptures++;
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
    this.hud.update(this.game.player, this.game.depth, this.game.allyList);
    this.minimap.draw(this.game.floor, this.game.player);

    // ダイブ中オートセーブ(plan/mid-dive-autosave.md)。1ターンが解決するたびに
    // 現在の状態をまるごと書き出す。全滅・踏破・区切りで正規に終わったときは、
    // 続きから再開する必要がなくなるので消す(finish側でも消すが、ここでも
    // status の変化を漏れなく拾っておく)
    if (this.game.status === "playing") {
      saveRunSnapshot(this.game.toSnapshot());
    } else {
      clearRunSnapshot();
    }

    const over = events.find((e): e is Extract<GameEvent, { type: "gameOver" }> =>
      e.type === "gameOver",
    );
    if (over) this.finish(over.reason);
  }

  private finish(reason: string): void {
    this.ended = true;
    const cleared = this.game.status === "cleared";
    // 踏破したときだけ、持っていたもの・生きて連れていた仲間を持ち帰れる。倒れたら全部失う
    const broughtBack = cleared ? this.game.player.inventory.items : [];
    const broughtBackAllies = cleared ? [...this.game.allyList] : [];
    this.save = recordRun(this.save, {
      depth: this.game.depth,
      level: this.game.player.level,
      cleared,
      broughtBack,
      broughtBackAllies,
      // 倒した・捕まえた数は、全滅した回でも失わずに積み上げる
      // (design/balance-philosophy.mdの「知識・記録はロストしない」原則)
      defeats: this.diveDefeats,
      captures: this.diveCaptures,
    });
    this.hud.showOverlay(
      cleared ? "だっしゅつ成功!" : "ちからつきた……",
      cleared
        ? `${reason}  持ち帰った ${broughtBack.length} 個を倉庫に、${broughtBackAllies.length} 体をねむり小屋にしまった。`
        : `${reason}  持ち込んだ道具・仲間はすべて失った。`,
      `Lv ${this.game.player.level} / ${this.game.turnCount} ターン ・ ` +
        `最深記録 ${this.save.deepest} 階 — R キーで拠点にもどる`,
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
    this.hud.update(this.game.player, this.game.depth, this.game.allyList);
  }

  /** 正面が開けている方向を向く。タルの落下先を確保するために使う */
  debugFaceOpenSide(): number | null {
    const deltas = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
    ];
    for (let dir = 0; dir < 8; dir++) {
      const d = deltas[dir]!;
      const spot = { x: this.game.player.pos.x + d.x, y: this.game.player.pos.y + d.y };
      if (isFree(this.game.floor, spot)) {
        this.submit({ type: "face", dir: dir as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 });
        return dir;
      }
    }
    return null;
  }

  /** タルを抱えさせる。ヘッドレスでの確認用 */
  debugGiveBarrel(kind: "empty" | "bomb" | "caught", speciesId?: string): void {
    const barrel = this.game.giveBarrel(kind, speciesId);
    this.stage
      .viewOf(this.game.player.id)
      ?.setCarried(this.assets.instantiate(BARREL_MODELS[barrel.kind]).root);
    this.hud.update(this.game.player, this.game.depth, this.game.allyList);
  }

  /** 目の前にモンスターを置いて、タルをぶつけられる状態にする */
  debugMonsterInFront(): { name: string; key: string } | null {
    const player = this.game.player;
    const monster = this.game.floor.actors.find((a) => a.kind === "monster" && a.alive);
    if (!monster) return null;
    for (const [dir, key] of [
      [2, "ArrowRight"],
      [6, "ArrowLeft"],
      [4, "ArrowDown"],
      [0, "ArrowUp"],
    ] as const) {
      const d = [
        { x: 0, y: -1 },
        { x: 1, y: -1 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: -1, y: 1 },
        { x: -1, y: 0 },
        { x: -1, y: -1 },
      ][dir]!;
      const spot = { x: player.pos.x + d.x, y: player.pos.y + d.y };
      if (!walkableAt(this.game.floor, spot)) continue;
      monster.pos = spot;
      // 吸い込みを試すあいだ倒れないよう頑丈にする。そのぶん殴り返してくるので、
      // プレイヤー側も検証が最後まで届くように底上げしておく
      monster.maxHp = 400;
      monster.hp = 400;
      this.game.player.maxHp = 400;
      this.game.player.hp = 400;
      this.submit({ type: "face", dir });
      this.stage.syncActors(this.game.floor);
      this.stage.viewOf(monster.id)?.setPosition(spot);
      return { name: monster.name, key };
    }
    return null;
  }

  /** 倒れたときの流れを確かめるために、わざと力尽きさせる */
  debugKill(): void {
    this.game.player.hp = 1;
    this.game.player.satiety = 0;
    this.submit({ type: "wait" });
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
      allies: this.game.allyList.map((a) => `${a.name}(${a.hp}/${a.maxHp})`),
      barrels: floor.barrels.map((b) => b.kind),
      carrying: this.game.player.carrying?.kind ?? null,
      items: floor.items.length,
      traps: floor.traps.length,
      rooms: floor.rooms.length,
      log: [...document.querySelectorAll("#log div")].map((d) => d.textContent),
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
