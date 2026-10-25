import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  openAICallTextToSpeech,
  listOpenAIModels,
  OPENAI_API_URL,
  openAITextToSpeech,
  DEFAULT_OPENAI_MODELS,
  supportsInstructions,
  isDeprecatedOpenAIModel,
  isRealtimeOpenAIModel,
} from "./openai";
import { TTSModelOptions } from "./tts-model";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

// Mock the global fetch
global.fetch = vi.fn();

describe("OpenAI Model API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("openAICallTextToSpeech", () => {
    const mockOptions: TTSModelOptions = {
      apiKey: "test-api-key",
      apiUri: OPENAI_API_URL,
      voice: "alloy",
      instructions: undefined,
      model: "tts-1",
    };

    it("should make correct API call for basic TTS request", async () => {
      const mockAudioBytes = new ArrayBuffer(1024);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBytes),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await openAICallTextToSpeech(
        "Hello world",
        mockOptions,
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(`${OPENAI_API_URL}/v1/audio/speech`, {
        headers: {
          Authorization: "Bearer test-api-key",
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({
          model: "tts-1",
          voice: "alloy",
          input: "Hello world",
          speed: 1.0,
          response_format: "mp3",
        }),
      });

      expect(result.data).toBe(mockAudioBytes);
      expect(result.format).toBe("mp3");
    });

    it("should use custom API URL when provided", async () => {
      const customApiUrl = "https://custom-api.example.com";
      const mockAudioBytes = new ArrayBuffer(256);
      const mockResponse = {
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBytes),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const customOptions: TTSModelOptions = {
        ...mockOptions,
        apiUri: customApiUrl,
      };

      await openAICallTextToSpeech(
        "Custom endpoint test",
        customOptions,
        DEFAULT_SETTINGS,
        {},
      );

      expect(fetch).toHaveBeenCalledWith(
        `${customApiUrl}/v1/audio/speech`,
        expect.any(Object),
      );
    });

    it("should handle API errors correctly", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({
          error: {
            message: "Invalid API key",
            type: "invalid_request_error",
            code: "invalid_api_key",
            param: null,
          },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      await expect(
        openAICallTextToSpeech("Test", mockOptions, DEFAULT_SETTINGS, {}),
      ).rejects.toThrow("Request failed 'HTTP 401 error'");

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should handle network errors", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

      await expect(
        openAICallTextToSpeech("Test", mockOptions, DEFAULT_SETTINGS, {}),
      ).rejects.toThrow("Network error");
    });
  });

  describe("listOpenAIModels", () => {
    it("should fetch available models successfully", async () => {
      const mockModels = {
        data: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
      };
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockModels),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as any);

      const result = await listOpenAIModels(DEFAULT_SETTINGS);

      expect(fetch).toHaveBeenCalledWith(`${OPENAI_API_URL}/v1/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${DEFAULT_SETTINGS.openai_apiKey}`,
          "Content-Type": "application/json",
        },
      });

      expect(result).toEqual(mockModels.data);
    });

    it("should handle model listing errors", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({
          error: {
            message: "Insufficient permissions",
            type: "insufficient_quota",
            code: "insufficient_quota",
            param: null,
          },
        }),
      };

      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      await expect(listOpenAIModels(DEFAULT_SETTINGS)).rejects.toThrow(
        "Request failed 'HTTP 403 error'",
      );
    });
  });

  describe("openAITextToSpeech.call routing", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("uses the speech endpoint for deprecated models", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      } as unknown as Response);

      const result = await openAITextToSpeech.call(
        "Hello world",
        { apiKey: "test-key", model: "tts-1", voice: "alloy" },
        DEFAULT_SETTINGS,
      );

      expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
        `${OPENAI_API_URL}/v1/audio/speech`,
      );
      expect(result.format).toBe("mp3");
    });

    it("uses a realtime websocket for gpt-realtime-2.1-mini and never calls fetch", async () => {
      const urls: string[] = [];
      class MinimalWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = 0;
        constructor(url: string) {
          urls.push(url);
        }
        addEventListener(): void {}
        removeEventListener(): void {}
        send(): void {}
        close(): void {
          this.readyState = 3;
        }
      }
      vi.stubGlobal("WebSocket", MinimalWebSocket);
      const controller = new AbortController();

      const pending = openAITextToSpeech.call(
        "Hello world",
        { apiKey: "test-key", model: "gpt-realtime-2.1-mini", voice: "marin" },
        DEFAULT_SETTINGS,
        {},
        controller.signal,
      );

      expect(urls).toHaveLength(1);
      expect(urls[0]).toContain("model=gpt-realtime-2.1-mini");
      expect(fetch).not.toHaveBeenCalled();
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    });
  });

  describe("DEFAULT_OPENAI_MODELS", () => {
    it("lists gpt-realtime-2.1-mini first and labels the old models deprecated", () => {
      expect(DEFAULT_OPENAI_MODELS[0].value).toBe("gpt-realtime-2.1-mini");
      expect(supportsInstructions("gpt-realtime-2.1-mini")).toBe(true);
      expect(isRealtimeOpenAIModel("gpt-realtime-2.1-mini")).toBe(true);
      for (const m of ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"]) {
        expect(isDeprecatedOpenAIModel(m)).toBe(true);
        expect(isRealtimeOpenAIModel(m)).toBe(false);
        expect(DEFAULT_OPENAI_MODELS.find((x) => x.value === m)?.label).toMatch(
          /\(deprecated\)$/,
        );
      }
      expect(isDeprecatedOpenAIModel("gpt-realtime-2.1-mini")).toBe(false);
    });
  });
});
