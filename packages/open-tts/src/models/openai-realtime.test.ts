import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRealtimeInstructions,
  openAIRealtimeCallTextToSpeech,
  REALTIME_IDLE_TIMEOUT_MILLIS,
} from "./openai-realtime";
import { TTSErrorInfo, type TTSModelOptions } from "./tts-model";
import { DEFAULT_SETTINGS } from "../player/TTSPluginSettings";

interface SentEvent {
  type: string;
  session?: {
    instructions?: string;
    audio?: {
      output?: { format?: unknown; voice?: string };
    };
  };
  response?: {
    conversation?: string;
    input?: { content: { type: string; text: string }[] }[];
  };
}

type Listener = (event: Event) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly protocols: string[];
  readyState: number = FakeWebSocket.CONNECTING;
  sent: SentEvent[] = [];
  closeCalls: (number | undefined)[] = [];
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string, protocols: string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(): number {
    let count = 0;
    this.listeners.forEach((set) => (count += set.size));
    return count;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as SentEvent);
  }

  close(code?: number): void {
    this.closeCalls.push(code);
    this.readyState = FakeWebSocket.CLOSING;
  }

  serverOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", new Event("open"));
  }

  serverSend(event: object): void {
    this.emit(
      "message",
      new MessageEvent("message", { data: JSON.stringify(event) }),
    );
  }

  serverError(): void {
    this.emit("error", new Event("error"));
  }

  serverClose(code: number): void {
    this.readyState = FakeWebSocket.CLOSED;
    const event = new Event("close");
    Object.defineProperty(event, "code", { value: code });
    this.emit("close", event);
  }

  private emit(type: string, event: Event): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

function lastSocket(): FakeWebSocket {
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!ws) {
    throw new Error("no socket was opened");
  }
  return ws;
}

function bytesToBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function completeResponse(
  ws: FakeWebSocket,
  opts: { audioBase64: string[]; transcript?: string; status?: string },
): void {
  ws.serverOpen();
  ws.serverSend({ type: "session.updated", session: {} });
  for (const delta of opts.audioBase64) {
    ws.serverSend({ type: "response.output_audio.delta", delta });
  }
  if (opts.transcript !== undefined) {
    ws.serverSend({
      type: "response.output_audio_transcript.done",
      transcript: opts.transcript,
    });
  }
  ws.serverSend({
    type: "response.done",
    response: { status: opts.status ?? "completed", status_details: null },
  });
}

async function expectTTSError(
  promise: Promise<unknown>,
): Promise<TTSErrorInfo> {
  const error = await promise.then(
    () => {
      throw new Error("expected the call to reject");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TTSErrorInfo);
  return error as TTSErrorInfo;
}

const TEXT = "Hello world, this is a short passage to read aloud.";
const AUDIO = [bytesToBase64([1, 2, 3, 4])];

const options: TTSModelOptions = {
  apiKey: "test-key",
  model: "gpt-realtime-2.1-mini",
  voice: "marin",
};

function call(
  text: string = TEXT,
  signal?: AbortSignal,
  opts: TTSModelOptions = options,
): ReturnType<typeof openAIRealtimeCallTextToSpeech> {
  return openAIRealtimeCallTextToSpeech(
    text,
    opts,
    DEFAULT_SETTINGS,
    {},
    signal,
  );
}

describe("openAIRealtimeCallTextToSpeech", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("connects with the model in the url and the api key as a subprotocol", async () => {
    const result = call();
    const ws = lastSocket();
    expect(ws.url).toBe(
      "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini",
    );
    expect(ws.protocols).toEqual([
      "realtime",
      "openai-insecure-api-key.test-key",
    ]);
    completeResponse(ws, { audioBase64: AUDIO, transcript: TEXT });
    await result;
  });

  it("rejects without opening a socket when no api key is configured", async () => {
    const error = await expectTTSError(
      call(TEXT, undefined, { ...options, apiKey: "  " }),
    );
    expect(error.httpErrorCode).toBe(401);
    expect(error.isRetryable).toBe(false);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("sends session.update on open and response.create only after session.updated", async () => {
    const result = call();
    const ws = lastSocket();
    expect(ws.sent).toHaveLength(0);
    ws.serverOpen();
    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0].type).toBe("session.update");
    expect(ws.sent[0].session?.audio?.output?.format).toEqual({
      type: "audio/pcm",
      rate: 24000,
    });
    expect(ws.sent[0].session?.audio?.output?.voice).toBe("marin");
    expect(ws.sent[0].session?.instructions).toContain("exactly as written");

    ws.serverSend({ type: "session.created", session: {} });
    expect(ws.sent).toHaveLength(1);

    ws.serverSend({ type: "session.updated", session: {} });
    expect(ws.sent).toHaveLength(2);
    expect(ws.sent[1].type).toBe("response.create");
    expect(ws.sent[1].response?.conversation).toBe("none");
    expect(ws.sent[1].response?.input?.[0].content[0].text).toContain(
      "Hello world",
    );

    ws.serverSend({ type: "response.output_audio.delta", delta: AUDIO[0] });
    ws.serverSend({
      type: "response.done",
      response: { status: "completed" },
    });
    await result;
  });

  it("omits the voice when none is configured", async () => {
    const result = call(TEXT, undefined, { ...options, voice: "" });
    const ws = lastSocket();
    completeResponse(ws, { audioBase64: AUDIO, transcript: TEXT });
    await result;
    expect(ws.sent[0].session?.audio?.output).not.toHaveProperty("voice");
  });

  it("concatenates audio deltas in order into 24kHz mono pcm", async () => {
    const result = call();
    const ws = lastSocket();
    completeResponse(ws, {
      audioBase64: [bytesToBase64([1, 2]), bytesToBase64([3, 4])],
      transcript: TEXT,
    });
    const audio = await result;
    expect(Array.from(new Uint8Array(audio.data))).toEqual([1, 2, 3, 4]);
    expect(audio.format).toBe("pcm");
    expect(audio.pcmMetadata).toEqual({
      sampleRate: 24000,
      channels: 1,
      bitDepth: 16,
    });
    expect("fidelityWarning" in audio).toBe(false);
    expect(ws.closeCalls).toEqual([1000]);
    expect(ws.listenerCount()).toBe(0);
  });

  it("builds the transcript from deltas when no done event arrives", async () => {
    const result = call();
    const ws = lastSocket();
    ws.serverOpen();
    ws.serverSend({ type: "session.updated", session: {} });
    ws.serverSend({ type: "response.output_audio.delta", delta: AUDIO[0] });
    ws.serverSend({
      type: "response.output_audio_transcript.delta",
      delta: "Hello world, this is a short ",
    });
    ws.serverSend({
      type: "response.output_audio_transcript.delta",
      delta: "passage to read aloud.",
    });
    ws.serverSend({ type: "response.done", response: { status: "completed" } });
    const audio = await result;
    expect("fidelityWarning" in audio).toBe(false);
  });

  it("flags large drift with a warning but still returns audio", async () => {
    const result = call();
    completeResponse(lastSocket(), {
      audioBase64: AUDIO,
      transcript: "Hello world, this is a short",
    });
    const audio = await result;
    expect(audio.fidelityWarning).toBe(true);
    expect(audio.data.byteLength).toBe(4);
  });

  it("throws a non-retryable fidelity_mismatch when the transcript is unrelated", async () => {
    const result = call();
    completeResponse(lastSocket(), {
      audioBase64: AUDIO,
      transcript:
        "Sure! Why did the cat sit on the computer? To watch the mouse.",
    });
    const error = await expectTTSError(result);
    expect(error.status).toBe("fidelity_mismatch");
    expect(error.isRetryable).toBe(false);
  });

  it("returns audio with a warning when no transcript event arrives", async () => {
    const result = call();
    completeResponse(lastSocket(), { audioBase64: AUDIO });
    const audio = await result;
    expect(audio.fidelityWarning).toBe(true);
  });

  it("maps an invalid api key error event to 401", async () => {
    const result = call();
    const ws = lastSocket();
    ws.serverOpen();
    ws.serverSend({
      type: "error",
      error: {
        type: "invalid_request_error",
        code: "invalid_api_key",
        message: "Incorrect API key provided.",
        param: null,
      },
    });
    const error = await expectTTSError(result);
    expect(error.httpErrorCode).toBe(401);
    expect(error.ttsErrorCode()).toBe("invalid_api_key");
    expect(error.ttsJsonMessage()).toBe("Incorrect API key provided.");
    expect(error.isRetryable).toBe(false);
    expect(ws.closeCalls).toEqual([1000]);
  });

  it("maps a rate limit error event to a retryable 429", async () => {
    const result = call();
    const ws = lastSocket();
    ws.serverOpen();
    ws.serverSend({
      type: "error",
      error: { type: "rate_limit_error", code: null, message: "Slow down." },
    });
    const error = await expectTTSError(result);
    expect(error.httpErrorCode).toBe(429);
    expect(error.isRetryable).toBe(true);
  });

  it("maps a failed response with error details", async () => {
    const result = call();
    const ws = lastSocket();
    ws.serverOpen();
    ws.serverSend({ type: "session.updated", session: {} });
    ws.serverSend({
      type: "response.done",
      response: {
        status: "failed",
        status_details: {
          type: "failed",
          error: { type: "server_error", code: "server_error", message: "x" },
        },
      },
    });
    const error = await expectTTSError(result);
    expect(error.httpErrorCode).toBe(500);
    expect(error.isRetryable).toBe(true);
  });

  it("treats a close before response.done as a retryable failure", async () => {
    const result = call();
    const ws = lastSocket();
    ws.serverOpen();
    ws.serverClose(1006);
    const error = await expectTTSError(result);
    expect(error.status).toBe("realtime_closed");
    expect(error.isRetryable).toBe(true);
    expect(ws.closeCalls).toHaveLength(0);
  });

  it("treats a socket error as a retryable connection failure", async () => {
    const result = call();
    const ws = lastSocket();
    ws.serverError();
    ws.serverClose(1006);
    const error = await expectTTSError(result);
    expect(error.status).toBe("realtime_connection_error");
    expect(error.isRetryable).toBe(true);
    expect(ws.closeCalls).toEqual([1000]);
  });

  it("treats a completed response with no audio as a retryable failure", async () => {
    const result = call();
    completeResponse(lastSocket(), { audioBase64: [], transcript: TEXT });
    const error = await expectTTSError(result);
    expect(error.status).toBe("realtime_no_audio");
    expect(error.isRetryable).toBe(true);
  });

  it("treats an incomplete response as non-retryable", async () => {
    const result = call();
    completeResponse(lastSocket(), {
      audioBase64: AUDIO,
      transcript: TEXT,
      status: "incomplete",
    });
    const error = await expectTTSError(result);
    expect(error.status).toBe("realtime_incomplete");
    expect(error.isRetryable).toBe(false);
  });

  it("times out a silent socket and closes it", async () => {
    vi.useFakeTimers();
    const result = call();
    const ws = lastSocket();
    const errorPromise = expectTTSError(result);
    ws.serverOpen();
    vi.advanceTimersByTime(REALTIME_IDLE_TIMEOUT_MILLIS - 1000);
    ws.serverSend({ type: "session.updated", session: {} });
    vi.advanceTimersByTime(REALTIME_IDLE_TIMEOUT_MILLIS - 1000);
    expect(ws.closeCalls).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    const error = await errorPromise;
    expect(error.status).toBe("realtime_timeout");
    expect(error.isRetryable).toBe(true);
    expect(ws.closeCalls).toEqual([1000]);
  });

  it("closes the socket and rejects with AbortError when aborted", async () => {
    const controller = new AbortController();
    const result = call(TEXT, controller.signal);
    const ws = lastSocket();
    ws.serverOpen();
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(ws.closeCalls).toEqual([1000]);
    expect(ws.listenerCount()).toBe(0);
  });

  it("does not open a socket when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(call(TEXT, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("settles once and ignores events after completion", async () => {
    const result = call();
    const ws = lastSocket();
    completeResponse(ws, { audioBase64: AUDIO, transcript: TEXT });
    ws.serverError();
    ws.serverClose(1000);
    await expect(result).resolves.toMatchObject({ format: "pcm" });
    expect(ws.closeCalls).toEqual([1000]);
  });
});

describe("buildRealtimeInstructions", () => {
  it("appends voice instructions and marks previous context as not to be read", () => {
    const instructions = buildRealtimeInstructions("Speak in a whisper", {
      textBefore: "Earlier text",
    });
    expect(instructions).toContain("exactly as written");
    expect(instructions).toContain("Speak in a whisper");
    expect(instructions).toContain(
      "<previous_context>\nEarlier text\n</previous_context>",
    );
    expect(instructions).toContain("Do not read it");
  });

  it("uses only the base text without voice instructions or context", () => {
    const instructions = buildRealtimeInstructions(undefined, {});
    expect(instructions).not.toContain("Style guidance");
    expect(instructions).not.toContain("<previous_context>");
  });
});
