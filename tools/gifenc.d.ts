/**
 * gifencには型定義が無い(@types/gifencも存在しない)ため、
 * tools/preview-harness.tsで実際に使う分だけ最小限の型を書く
 * (plan/models/archive/preview-animation-gif.md)。
 */
declare module "gifenc" {
  export type RGB = [number, number, number];
  export type RGBA = [number, number, number, number];

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: string },
  ): RGB[] | RGBA[];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: RGB[] | RGBA[],
  ): Uint8Array;

  export interface GIFEncoderWriteFrameOptions {
    palette?: RGB[] | RGBA[];
    delay?: number;
    first?: boolean;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
  }

  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: GIFEncoderWriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): GIFEncoderInstance;
}
