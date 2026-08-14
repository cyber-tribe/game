export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function eq(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * 8方向。番号は真上(北)を 0 として時計回り。
 * モデルの向き(Y軸回転)にもそのまま使う。
 */
export const DIRS = [
  { x: 0, y: -1 }, // 0 北
  { x: 1, y: -1 }, // 1 北東
  { x: 1, y: 0 }, //  2 東
  { x: 1, y: 1 }, //  3 南東
  { x: 0, y: 1 }, //  4 南
  { x: -1, y: 1 }, // 5 南西
  { x: -1, y: 0 }, // 6 西
  { x: -1, y: -1 }, // 7 北西
] as const satisfies readonly Vec2[];

export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ALL_DIRS: readonly Dir[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** 斜めかどうか。斜め移動は角抜けを禁止するので判定が要る */
export function isDiagonal(dir: Dir): boolean {
  return dir % 2 === 1;
}

/**
 * 方向を時計回りに`eighths`(8分の1回転=45度)ぶん回す。負の値は反時計回り。
 *
 * 画面基準で入れた方向をワールドの方角へ直すのに使う(issue #463)。
 * カメラは90度単位で回るので、実際に渡ってくるのは2の倍数になる。
 */
export function rotateDir(dir: Dir, eighths: number): Dir {
  return (((dir + eighths) % 8) + 8) % 8 as Dir;
}

export function dirDelta(dir: Dir): Vec2 {
  return DIRS[dir];
}

/** 差分ベクトルから最も近い8方向を求める */
export function dirFromDelta(dx: number, dy: number): Dir {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  for (let d = 0; d < 8; d++) {
    const v = DIRS[d]!;
    if (v.x === sx && v.y === sy) return d as Dir;
  }
  return 4; // dx=dy=0 のときは南向き(初期向き)
}

/** チェビシェフ距離。8方向移動なので実歩数はこれに一致する */
export function chebyshev(a: Vec2, b: Vec2): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function isAdjacent(a: Vec2, b: Vec2): boolean {
  return !eq(a, b) && chebyshev(a, b) <= 1;
}
