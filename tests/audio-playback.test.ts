import { describe, expect, it, vi } from "vitest";
import { AudioPlayer, bgmUrl, sfxUrl } from "../src/audio/player";
import { initialSave, setAudioMuted, setAudioVolume } from "../src/save";

/**
 * サウンド再生(plan/audio-playback.md)のテスト用フェイク。
 * 実際のWeb Audio APIはこの環境(vitestのnode環境)には存在しないため、
 * AudioPlayerが呼ぶ最小限のインターフェースだけをduck-typingで用意する。
 */
class FakeGain {
  gain = {
    value: 0,
    linearRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class FakeSource {
  buffer: unknown;
  loop = false;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

function makeFakeContext() {
  return {
    state: "suspended" as "suspended" | "running",
    currentTime: 0,
    destination: {},
    createGain: vi.fn(() => new FakeGain()),
    createBufferSource: vi.fn(() => new FakeSource()),
    decodeAudioData: vi.fn(() => Promise.resolve({} as AudioBuffer)),
    resume: vi.fn(function (this: { state: string }) {
      this.state = "running";
      return Promise.resolve();
    }),
  };
}

/** すべてのマイクロタスクが片付くのを待つ */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("audio/player.ts: AudioPlayer(plan/audio-playback.md)", () => {
  it("resume()を呼ぶまでAudioContextを作らず、SFX/BGMの呼び出しも何もしない", () => {
    const createContext = vi.fn(makeFakeContext);
    const fetchAudio = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const player = new AudioPlayer(createContext as never, fetchAudio);

    player.playSfx("levelUp");
    player.setBgm("village");

    expect(createContext).not.toHaveBeenCalled();
    expect(fetchAudio).not.toHaveBeenCalled();
  });

  it("resume()は最初の1回だけAudioContextを作る(2回目以降は既存のものをresumeするだけ)", () => {
    const createContext = vi.fn(makeFakeContext);
    const player = new AudioPlayer(createContext as never, () => Promise.resolve(new ArrayBuffer(0)));

    player.resume();
    player.resume();

    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("playSfxは音源をfetch→decodeAudioDataしてから再生する", async () => {
    const ctx = makeFakeContext();
    const fetchAudio = vi.fn((url: string) => {
      expect(url).toBe(sfxUrl("levelUp"));
      return Promise.resolve(new ArrayBuffer(0));
    });
    const player = new AudioPlayer(() => ctx as never, fetchAudio);
    player.resume();

    player.playSfx("levelUp");
    await flush();

    expect(fetchAudio).toHaveBeenCalledTimes(1);
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
  });

  it("同じidのSFXを続けて鳴らしても、音源のデコードは1度だけ(キャッシュされる)", async () => {
    const ctx = makeFakeContext();
    const fetchAudio = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const player = new AudioPlayer(() => ctx as never, fetchAudio);
    player.resume();

    player.playSfx("capture");
    await flush();
    player.playSfx("capture");
    await flush();

    expect(fetchAudio).toHaveBeenCalledTimes(1);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
  });

  it("setBgmは現在と同じidなら何もしない(無音の継ぎ目回避)", async () => {
    const ctx = makeFakeContext();
    const fetchAudio = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const player = new AudioPlayer(() => ctx as never, fetchAudio);
    player.resume();

    player.setBgm("village");
    await flush();
    expect(fetchAudio).toHaveBeenCalledTimes(1);

    player.setBgm("village");
    await flush();
    expect(fetchAudio).toHaveBeenCalledTimes(1);
  });

  it("setBgmでidが変わると新しい音源を読み込む", async () => {
    const ctx = makeFakeContext();
    const fetchAudio = vi.fn((url: string) => Promise.resolve(new ArrayBuffer(url.length)));
    const player = new AudioPlayer(() => ctx as never, fetchAudio);
    player.resume();

    player.setBgm("village");
    await flush();
    player.setBgm("region1");
    await flush();

    expect(fetchAudio).toHaveBeenNthCalledWith(1, bgmUrl("village"));
    expect(fetchAudio).toHaveBeenNthCalledWith(2, bgmUrl("region1"));
  });

  it("setMuted(true)にすると、resume済みならマスターのgainが即0になる", () => {
    const ctx = makeFakeContext();
    const player = new AudioPlayer(() => ctx as never, () => Promise.resolve(new ArrayBuffer(0)));
    player.resume();

    player.setMasterVolume(0.5);
    player.setMuted(true);

    const master = ctx.createGain.mock.results[0]!.value as FakeGain;
    expect(master.gain.value).toBe(0);
  });

  it("resume前に設定したミュート・音量は、resume時点で反映される", () => {
    const ctx = makeFakeContext();
    const player = new AudioPlayer(() => ctx as never, () => Promise.resolve(new ArrayBuffer(0)));

    player.setMuted(true);
    player.setMasterVolume(0.3);
    player.resume();

    const master = ctx.createGain.mock.results[0]!.value as FakeGain;
    expect(master.gain.value).toBe(0);
  });

  it("setMoodLayerは同じidをactive中にもう一度activeにしても二重に読み込まない", async () => {
    const ctx = makeFakeContext();
    const fetchAudio = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const player = new AudioPlayer(() => ctx as never, fetchAudio);
    player.resume();

    player.setMoodLayer("restless", true);
    await flush();
    player.setMoodLayer("restless", true);
    await flush();

    expect(fetchAudio).toHaveBeenCalledTimes(1);
  });

  it("setMoodLayer(id, false)はレイヤーをフェードアウトして止める", async () => {
    const ctx = makeFakeContext();
    const player = new AudioPlayer(() => ctx as never, () => Promise.resolve(new ArrayBuffer(0)));
    player.resume();

    player.setMoodLayer("restless", true);
    await flush();
    const source = ctx.createBufferSource.mock.results[0]!.value as FakeSource;

    player.setMoodLayer("restless", false, 0);
    await flush();

    expect(source.stop).toHaveBeenCalled();
  });
});

describe("save.ts: audioMuted/audioVolume(plan/audio-playback.md)", () => {
  it("既定値はミュートなし・音量0.7", () => {
    const save = initialSave();
    expect(save.audioMuted).toBe(false);
    expect(save.audioVolume).toBe(0.7);
  });

  it("setAudioMutedはミュート状態を切り替える", () => {
    const save = initialSave();
    const muted = setAudioMuted(save, true);
    expect(muted.audioMuted).toBe(true);
    expect(setAudioMuted(muted, true)).toBe(muted); // 変化が無ければ同一参照を返す
  });

  it("setAudioVolumeは0..1にクランプする", () => {
    const save = initialSave();
    expect(setAudioVolume(save, 1.5).audioVolume).toBe(1);
    expect(setAudioVolume(save, -0.2).audioVolume).toBe(0);
    expect(setAudioVolume(save, 0.42).audioVolume).toBe(0.42);
  });
});
