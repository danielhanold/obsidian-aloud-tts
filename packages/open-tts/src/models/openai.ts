import type { TTSPluginSettings } from "../player/TTSPluginSettings";
import type { AudioData, MediaFormat } from "./tts-model";
import {
  OPENAI_REALTIME_MODEL,
  openAIRealtimeCallTextToSpeech,
} from "./openai-realtime";
import {
  AudioTextContext,
  ErrorMessage,
  REQUIRE_API_KEY,
  TTSErrorInfo,
  type TTSModel,
  type TTSModelOptions,
  validate200,
} from "./tts-model";

export const OPENAI_API_URL = "https://api.openai.com";
export const OPENAI_TTS_SHUTDOWN_DATE = "January 6, 2027";
// OpenAI / Compatible API implementation
export const openAITextToSpeech: TTSModel = {
  call: (
    text: string,
    options: TTSModelOptions,
    settings: TTSPluginSettings,
    context?: AudioTextContext,
    signal?: AbortSignal,
  ): Promise<AudioData> => {
    if (isRealtimeOpenAIModel(options.model)) {
      return openAIRealtimeCallTextToSpeech(
        text,
        options,
        settings,
        context,
        signal,
      );
    }
    return openAICallTextToSpeech(text, options, settings, context, signal);
  },
  validateConnection: async (settings) => {
    if (!settings.openai_apiKey) {
      return REQUIRE_API_KEY;
    }

    try {
      await listOpenAIModels(settings);
    } catch (ex) {
      console.error("Could not validate API key", ex);
      let message = "Cannot connect to OpenAI";
      if (ex instanceof TTSErrorInfo) {
        if (ex.ttsErrorCode() === "invalid_api_key") {
          message =
            "Invalid API key! Enter a valid API key in the plugin settings";
        } else {
          const msg = ex.ttsJsonMessage();
          if (msg) {
            message = msg;
          }
        }
      }
      return message;
    }
    return undefined;
  },
  convertToOptions: (settings): TTSModelOptions => {
    return {
      apiKey: settings.openai_apiKey,
      apiUri: OPENAI_API_URL,
      voice: settings.openai_ttsVoice,
      instructions: settings.openai_ttsInstructions,
      model: settings.openai_ttsModel,
    };
  },
};

export async function openAICallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
  context: AudioTextContext = {},
  signal?: AbortSignal,
): Promise<AudioData> {
  const canInstruct = supportsInstructions(options.model);
  let instructions = options.instructions;
  if (canInstruct && context.textBefore) {
    instructions = instructions ? instructions + "\n\n" : "";
    instructions +=
      "Maintain tone and pacing with the following speech before and after this text:\n\n";
    instructions +=
      "<previous_context>\n" + context.textBefore + "\n</previous_context>\n";
  }

  const headers = await fetch(
    (options.apiUri || OPENAI_API_URL) + "/v1/audio/speech",
    {
      headers: {
        Authorization: "Bearer " + options.apiKey,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        model: options.model,
        voice: options.voice ? options.voice : "",
        ...(instructions ? { instructions } : {}),
        input: text,
        speed: 1.0,
        response_format: "mp3",
      }),
      signal,
    },
  );
  await validate200OpenAI(headers);
  const bf = await headers.arrayBuffer();
  return { data: bf, format: "mp3" };
}

/**
 * OpenAI-compatible TTS call with support for various response formats.
 * Returns audio in its native format - conversion to mp3 happens in the shared audio layer.
 */
export async function openAICompatCallTextToSpeech(
  text: string,
  options: TTSModelOptions,
  settings: TTSPluginSettings,
  context: AudioTextContext = {},
  signal?: AbortSignal,
): Promise<AudioData> {
  const responseFormat = String(
    options.responseFormat || "mp3",
  ).toLowerCase() as MediaFormat;

  const response = await fetch(
    (options.apiUri || OPENAI_API_URL) + "/v1/audio/speech",
    {
      headers: {
        Authorization: "Bearer " + options.apiKey,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({
        model: options.model,
        voice: options.voice ? options.voice : "",
        input: text,
        speed: options.generationSpeed ?? 1,
        response_format: responseFormat,
      }),
      signal,
    },
  );
  await validate200OpenAI(response);
  const audioBuffer = await response.arrayBuffer();

  // Return audio in its native format with metadata for PCM
  if (responseFormat === "pcm") {
    return {
      data: audioBuffer,
      format: "pcm",
      // OpenAI-compatible APIs typically return 24kHz, 16-bit, mono PCM
      pcmMetadata: {
        sampleRate: 24000,
        channels: 1,
        bitDepth: 16,
      },
    };
  }

  return { data: audioBuffer, format: responseFormat };
}

export async function listOpenAIModels(
  settings: TTSPluginSettings,
): Promise<string[]> {
  const headers = await fetch(OPENAI_API_URL + "/v1/models", {
    method: "GET",
    headers: {
      Authorization: "Bearer " + settings.openai_apiKey,
      "Content-Type": "application/json",
    },
  });
  await validate200OpenAI(headers);
  const models = await headers.json();
  return models.data as string[];
}

export async function validate200OpenAI(response: Response) {
  const getErrorMessage = (body: unknown) => {
    return body as ErrorMessage;
  };
  await validate200(response, getErrorMessage);
}

export interface OpenAIModel {
  label: string;
  value: string;
  supportsInstructions?: boolean;
  deprecated?: boolean;
}

export function isDeprecatedOpenAIModel(model: string): boolean {
  return (
    DEFAULT_OPENAI_MODELS.find((x) => x.value === model)?.deprecated || false
  );
}

export function isRealtimeOpenAIModel(model: string): boolean {
  return model === OPENAI_REALTIME_MODEL;
}

export function supportsInstructions(model: string): boolean {
  return (
    DEFAULT_OPENAI_MODELS.find((x) => x.value === model)
      ?.supportsInstructions || false
  );
}

export const DEFAULT_OPENAI_MODELS: OpenAIModel[] = [
  {
    label: OPENAI_REALTIME_MODEL,
    value: OPENAI_REALTIME_MODEL,
    supportsInstructions: true,
  },
  {
    label: "gpt-4o-mini-tts (deprecated)",
    value: "gpt-4o-mini-tts",
    supportsInstructions: true,
    deprecated: true,
  },
  { label: "tts-1 (deprecated)", value: "tts-1", deprecated: true },
  { label: "tts-1-hd (deprecated)", value: "tts-1-hd", deprecated: true },
] as const;
