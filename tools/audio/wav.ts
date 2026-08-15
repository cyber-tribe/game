/** PCM16の.wavファイルを書き出すだけの小さなヘルパー(外部依存なし)。モノラル・ステレオ両対応 */

export const SAMPLE_RATE = 22050;

/**
 * -1..1 のFloat32サンプル列(チャンネルごとの配列)を、PCM16 .wav のバイト列にする。
 * `channels.length`が1ならモノラル、2ならステレオ(インターリーブして書き出す)。
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate = SAMPLE_RATE): Buffer {
  const numChannels = channels.length;
  const frameCount = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample * numChannels;
  const dataSize = frameCount * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");

  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmtチャンクサイズ
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28); // バイトレート
  buf.writeUInt16LE(blockAlign, 32); // ブロックアライン
  buf.writeUInt16LE(16, 34); // ビット深度

  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const clamped = Math.max(-1, Math.min(1, channels[ch]![i]!));
      buf.writeInt16LE(Math.round(clamped * 32767), 44 + (i * numChannels + ch) * bytesPerSample);
    }
  }
  return buf;
}
