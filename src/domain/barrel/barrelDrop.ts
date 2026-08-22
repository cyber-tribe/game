import type { Vec2 } from "../../core/grid";
import type { GameEvent } from "../../core/events";
import type { Barrel, FloorState } from "../../core/types";
import { freeSpotNear, isFree } from "../../core/types";
import type { Rng } from "../../core/rng";
import { barrelDisplayName } from "../../entities/displayNames";

export interface DropBarrelNearArgs {
  floor: FloorState;
  rng: Rng;
  barrel: Barrel;
  preferred: Vec2;
  events: GameEvent[];
}

/**
 * タルを着地点に置く。塞がっていれば近くの空きマスへ転がす。
 * 床に残せたらtrue、置き場所が無くて砕けたらfalseを返す(呼び出し側が
 * 「拾い直せる」と言い切ってよいかの判断に使う)
 */
export function dropBarrelNear(args: DropBarrelNearArgs): boolean {
  const { floor, rng, barrel, preferred, events } = args;
  const spot = isFree(floor, preferred) ? preferred : freeSpotNear(floor, rng, preferred, 2);
  if (!spot) {
    // 置き場所が無ければ壊れたことにする。宙に浮かせるよりは筋が通る
    events.push({ type: "barrelBreak", barrelId: barrel.id, pos: preferred });
    events.push({ type: "message", text: `${barrelDisplayName(barrel)}は砕けてしまった。` });
    return false;
  }
  barrel.pos = spot;
  floor.barrels.push(barrel);
  return true;
}

export interface ReleaseFromBarrelArgs {
  floor: FloorState;
  rng: Rng;
  barrel: Barrel;
  landing: Vec2;
  events: GameEvent[];
  // 仲間化(パーティへの加入処理)はPhase 5のParty domainの領分。捕獲(タルの
  // 中身が出てくるところ)と仲間化の境界をここで切り、Game実装のまま呼ぶ
  recruitFromBarrel(barrel: Barrel, landing: Vec2): void;
}

/** 中身入りのタルを開けて、モンスターを仲間として盤面に出す */
export function releaseFromBarrel(args: ReleaseFromBarrelArgs): void {
  const { floor, rng, barrel, landing, events, recruitFromBarrel } = args;
  events.push({ type: "barrelBreak", barrelId: barrel.id, pos: landing });

  if (barrel.speciesId === undefined) return;
  const spot = isFree(floor, landing) ? landing : freeSpotNear(floor, rng, landing, 2);
  if (!spot) {
    events.push({ type: "message", text: "出てくる場所がなかった……" });
    return;
  }
  recruitFromBarrel(barrel, spot);
}
