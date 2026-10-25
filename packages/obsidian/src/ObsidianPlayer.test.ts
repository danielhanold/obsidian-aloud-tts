import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import { configurableAudioCache, obsidianFileVault } from "./ObsidianPlayer";
import { createTestSettingsStore } from "./test-utils";

function inMemoryVaultApp(): {
  app: App;
  files: Map<string, ArrayBuffer | string>;
} {
  const files = new Map<string, ArrayBuffer | string>();
  const dirs = new Set<string>();
  const adapter = {
    exists: async (path: string): Promise<boolean> =>
      files.has(path) || dirs.has(path),
    readBinary: async (path: string): Promise<ArrayBuffer> => {
      const value = files.get(path);
      if (!(value instanceof ArrayBuffer)) throw new Error(`missing ${path}`);
      return value;
    },
    writeBinary: async (path: string, data: ArrayBuffer): Promise<void> => {
      files.set(path, data);
    },
    write: async (path: string, data: string): Promise<void> => {
      files.set(path, data);
    },
    remove: async (path: string): Promise<void> => {
      files.delete(path);
    },
    mkdir: async (path: string): Promise<void> => {
      dirs.add(path);
    },
    list: async (): Promise<{ files: string[]; folders: string[] }> => ({
      files: [...files.keys()],
      folders: [],
    }),
    stat: async (
      path: string,
    ): Promise<{ mtime: number; size: number } | null> => {
      const value = files.get(path);
      if (value === undefined) return null;
      return {
        mtime: Date.now(),
        size: typeof value === "string" ? value.length : value.byteLength,
      };
    },
  };
  return { app: { vault: { adapter } } as unknown as App, files };
}

// Mock dependencies
vi.mock("open-tts/browser", () => ({
  IndexedDBAudioStorage: vi.fn(() => ({
    getAudio: vi.fn(),
    saveAudio: vi.fn(),
    ready: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock("obsidian", () => ({
  App: vi.fn(),
  normalizePath: vi.fn((path: string) => path),
}));

describe("ObsidianPlayer", () => {
  describe("configurableAudioCache", () => {
    it("should create cache without crashing", async () => {
      const mockApp = {} as any;
      const settingsStore = await createTestSettingsStore();

      const cache = configurableAudioCache(mockApp, settingsStore);

      expect(cache).toBeDefined();
      expect(typeof cache.getAudio).toBe("function");
      expect(typeof cache.destroy).toBe("function");
    });

    it("should have destroy method", async () => {
      const mockApp = {} as any;
      const settingsStore = await createTestSettingsStore();

      const cache = configurableAudioCache(mockApp, settingsStore);

      // Should not crash when calling destroy
      expect(() => cache.destroy()).not.toThrow();
    });
  });

  describe("obsidianFileVault", () => {
    it("should create vault cache without crashing", () => {
      const mockApp = {
        vault: {
          adapter: {
            read: vi.fn(),
            write: vi.fn(),
            exists: vi.fn(() => Promise.resolve(false)),
            remove: vi.fn(),
          },
        },
      } as any;

      const cache = obsidianFileVault(mockApp);

      expect(cache).toBeDefined();
      expect(typeof cache.getAudio).toBe("function");
      expect(typeof cache.saveAudio).toBe("function");
    });

    it("round-trips the fidelity warning through a sidecar file", async () => {
      const { app, files } = inMemoryVaultApp();
      const cache = obsidianFileVault(app);
      await cache.saveAudio(
        "t",
        { model: "m" },
        { data: new ArrayBuffer(2), format: "mp3", fidelityWarning: true },
      );
      const sidecars = [...files.keys()].filter((f) =>
        f.endsWith(".mp3.fidelity"),
      );
      expect(sidecars).toHaveLength(1);
      const result = await cache.getAudio("t", { model: "m" }, "mp3");
      expect(result?.data.byteLength).toBe(2);
      expect(result?.fidelityWarning).toBe(true);
    });

    it("omits the warning for clean audio", async () => {
      const { app, files } = inMemoryVaultApp();
      const cache = obsidianFileVault(app);
      await cache.saveAudio(
        "t",
        { model: "m" },
        { data: new ArrayBuffer(2), format: "mp3" },
      );
      expect(files.size).toBe(1);
      const result = await cache.getAudio("t", { model: "m" }, "mp3");
      expect(result).not.toBeNull();
      expect("fidelityWarning" in result!).toBe(false);
    });

    it("removes a stale sidecar when clean audio replaces flagged audio", async () => {
      const { app, files } = inMemoryVaultApp();
      const cache = obsidianFileVault(app);
      await cache.saveAudio(
        "t",
        { model: "m" },
        { data: new ArrayBuffer(2), format: "mp3", fidelityWarning: true },
      );
      await cache.saveAudio(
        "t",
        { model: "m" },
        { data: new ArrayBuffer(3), format: "mp3" },
      );
      expect([...files.keys()].some((f) => f.endsWith(".fidelity"))).toBe(
        false,
      );
      const result = await cache.getAudio("t", { model: "m" }, "mp3");
      expect(result?.data.byteLength).toBe(3);
      expect("fidelityWarning" in result!).toBe(false);
    });
  });
});
