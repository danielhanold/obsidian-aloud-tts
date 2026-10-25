import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChunkLoader } from "./ChunkLoader";
import { AudioCache, memoryStorage } from "./AudioCache";
import { AudioSystem, createAudioSystem } from "./AudioSystem";
import { loadAudioStore } from "./AudioStore";
import { DEFAULT_SETTINGS } from "./TTSPluginSettings";
import { AudioData, TTSErrorInfo, TTSModel } from "../models/tts-model";
import { FakeAudioSink } from "../test-utils";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
  debounce: () => vi.fn(),
}));

describe("ChunkLoader", () => {
  let call: ReturnType<typeof vi.fn<TTSModel["call"]>>;
  let storage: AudioCache;
  let saveAudio: ReturnType<typeof vi.spyOn>;
  let system: AudioSystem;
  let loaders: ChunkLoader[];

  function createLoader(): ChunkLoader {
    const loader = new ChunkLoader({ system });
    loaders.push(loader);
    return loader;
  }

  beforeEach(() => {
    call = vi.fn<TTSModel["call"]>();
    storage = memoryStorage();
    saveAudio = vi.spyOn(storage, "saveAudio");
    loaders = [];
    system = createAudioSystem({
      storage: () => storage,
      audioSink: () => new FakeAudioSink(),
      ttsModel: () => ({
        call,
        validateConnection: async () => undefined,
        convertToOptions: () => ({ model: "m" }),
      }),
      settings: () => DEFAULT_SETTINGS,
      config: () => ({ backgroundLoaderIntervalMillis: 10 }),
      audioStore: (sys) => loadAudioStore({ system: sys }),
      chunkLoader: (sys) => {
        const loader = new ChunkLoader({ system: sys });
        loaders.push(loader);
        return loader;
      },
    });
  });

  afterEach(() => {
    loaders.forEach((loader) => loader.destroy());
    system.audioStore.destroy();
  });

  it("does not retry or cache a fidelity mismatch", async () => {
    call.mockRejectedValue(new TTSErrorInfo("fidelity_mismatch"));
    const loader = createLoader();

    await expect(loader.load("text", { model: "m" })).rejects.toMatchObject({
      status: "fidelity_mismatch",
    });
    expect(call).toHaveBeenCalledTimes(1);
    expect(saveAudio).not.toHaveBeenCalled();
  });

  it("caches flagged audio with its warning so a replay is free and still flagged", async () => {
    const flagged: AudioData = {
      data: new ArrayBuffer(4),
      format: "mp3",
      fidelityWarning: true,
    };
    call.mockResolvedValue(flagged);
    const loader = createLoader();

    const first = await loader.load("text", { model: "m" });
    expect(first.fidelityWarning).toBe(true);

    const fresh = createLoader();
    const replay = await fresh.load("text", { model: "m" });
    expect(replay.fidelityWarning).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
