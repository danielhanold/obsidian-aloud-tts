import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { IndexedDBAudioStorage } from "./IndexedDBAudioStorage";

// Mock the idb library
vi.mock("idb", () => ({
  openDB: vi.fn(() => {
    const stores = new Map<string, Map<string, { hash: string }>>();
    const storeFor = (name: string): Map<string, { hash: string }> => {
      const existing = stores.get(name);
      if (existing) return existing;
      const created = new Map<string, { hash: string }>();
      stores.set(name, created);
      return created;
    };
    return Promise.resolve({
      get: vi.fn((name: string, key: string) =>
        Promise.resolve(storeFor(name).get(key)),
      ),
      put: vi.fn((name: string, value: { hash: string }) => {
        storeFor(name).set(value.hash, value);
        return Promise.resolve(value.hash);
      }),
      delete: vi.fn(),
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          delete: vi.fn(),
          iterate: vi.fn(() => Promise.resolve()),
          index: vi.fn(() => ({
            getAll: vi.fn(() => Promise.resolve([])),
          })),
        })),
        done: Promise.resolve(),
      })),
      getAllFromIndex: vi.fn(() => Promise.resolve([])),
    });
  }),
}));

describe("IndexedDBAudioStorage", () => {
  let storage: IndexedDBAudioStorage;

  beforeEach(() => {
    // jsdom's Blob has no arrayBuffer(); use Node's implementation.
    vi.stubGlobal("Blob", NodeBlob);
    storage = new IndexedDBAudioStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("should instantiate without crashing", () => {
    expect(storage).toBeDefined();
    expect(storage).toBeInstanceOf(IndexedDBAudioStorage);
  });

  it("should have ready method", async () => {
    expect(typeof storage.ready).toBe("function");

    // The ready method should return a promise
    const readyPromise = storage.ready();
    expect(readyPromise).toBeInstanceOf(Promise);

    // Should resolve without error
    await expect(readyPromise).resolves.toBeUndefined();
  });

  it("should have getStorageSize method", () => {
    expect(typeof storage.getStorageSize).toBe("function");
  });

  it("should have getAudio method", () => {
    expect(typeof storage.getAudio).toBe("function");
  });

  it("should have saveAudio method", () => {
    expect(typeof storage.saveAudio).toBe("function");
  });

  it("should have expire method", () => {
    expect(typeof storage.expire).toBe("function");
  });

  it("persists the fidelity warning with the audio", async () => {
    await storage.saveAudio(
      "t",
      { model: "m" },
      { data: new ArrayBuffer(2), format: "mp3", fidelityWarning: true },
    );
    const result = await storage.getAudio("t", { model: "m" }, "mp3");
    expect(result?.data.byteLength).toBe(2);
    expect(result?.fidelityWarning).toBe(true);
  });

  it("omits the warning for clean audio", async () => {
    await storage.saveAudio(
      "t",
      { model: "m" },
      { data: new ArrayBuffer(2), format: "mp3" },
    );
    const result = await storage.getAudio("t", { model: "m" }, "mp3");
    expect(result).not.toBeNull();
    expect("fidelityWarning" in result!).toBe(false);
  });
});
