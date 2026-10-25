import { observer } from "mobx-react-lite";
import React from "react";
import { TTSPluginSettingsStore } from "open-tts";
import { ApiKeyComponent } from "../api-key-component";
import { OptionSelectSetting, TextareaSetting } from "../setting-components";
import {
  DEFAULT_OPENAI_MODELS,
  OPENAI_REALTIME_MODEL,
  OPENAI_TTS_SHUTDOWN_DATE,
  isDeprecatedOpenAIModel,
} from "open-tts";

export const OpenAISettings = observer(
  ({ store }: { store: TTSPluginSettingsStore }) => {
    return (
      <>
        <ApiKeyComponent
          store={store}
          provider="openai"
          fieldName="openai_apiKey"
          displayName="OpenAI API key"
          helpUrl="https://platform.openai.com/api-keys"
          showValidation={true}
        />
        <OpenAIModelComponent store={store} />
        <OpenAIVoiceComponent store={store} />
        <OpenAITTSInstructionsComponent store={store} />
      </>
    );
  },
);

const OpenAIModelComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  return (
    <>
      <OptionSelectSetting
        name="Model"
        description="The OpenAI TTS model to use."
        store={store}
        provider="openai"
        fieldName="openai_ttsModel"
        options={DEFAULT_OPENAI_MODELS}
      />
      {isDeprecatedOpenAIModel(store.settings.openai_ttsModel) && (
        <p
          className="setting-item-description tts-model-deprecation-note"
          role="note"
        >
          {`This model is deprecated and will stop working on ${OPENAI_TTS_SHUTDOWN_DATE}. Switch to ${OPENAI_REALTIME_MODEL}.`}
        </p>
      )}
    </>
  );
});

interface Voice {
  label: string;
  value: string;
  models: string[];
}
const DEFAULT_OPENAI_VOICES: Voice[] = [
  {
    label: "Alloy",
    value: "alloy",
    models: [OPENAI_REALTIME_MODEL, "tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Ash",
    value: "ash",
    models: [OPENAI_REALTIME_MODEL, "tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Ballad",
    value: "ballad",
    models: [OPENAI_REALTIME_MODEL, "gpt-4o-mini-tts"],
  },
  {
    label: "Coral",
    value: "coral",
    models: [OPENAI_REALTIME_MODEL, "tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Echo",
    value: "echo",
    models: [OPENAI_REALTIME_MODEL, "tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Fable",
    value: "fable",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Onyx",
    value: "onyx",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Nova",
    value: "nova",
    models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Sage",
    value: "sage",
    models: [OPENAI_REALTIME_MODEL, "tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Shimmer",
    value: "shimmer",
    models: [OPENAI_REALTIME_MODEL, "tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
  },
  {
    label: "Verse",
    value: "verse",
    models: [OPENAI_REALTIME_MODEL, "gpt-4o-mini-tts"],
  },
  {
    label: "Marin",
    value: "marin",
    models: [OPENAI_REALTIME_MODEL],
  },
  {
    label: "Cedar",
    value: "cedar",
    models: [OPENAI_REALTIME_MODEL],
  },
] as const;

const OpenAIVoiceComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const voices = React.useMemo(() => {
    return DEFAULT_OPENAI_VOICES.filter((v) =>
      v.models.includes(store.settings.openai_ttsModel),
    );
  }, [store.settings.openai_ttsModel]);

  React.useEffect(() => {
    if (voices.find((v) => v.value === store.settings.openai_ttsVoice)) {
      return;
    }
    if (voices.length > 0) {
      store.updateModelSpecificSettings("openai", {
        openai_ttsVoice: voices[0].value,
      });
    }
  }, [store.settings.openai_ttsVoice, voices]);

  return (
    <OptionSelectSetting
      name="Voice"
      description="The voice option to use."
      store={store}
      provider="openai"
      fieldName="openai_ttsVoice"
      options={voices}
    />
  );
});

const OpenAITTSInstructionsComponent: React.FC<{
  store: TTSPluginSettingsStore;
}> = observer(({ store }) => {
  const modelSupportsInstructions = React.useMemo(() => {
    const model = DEFAULT_OPENAI_MODELS.find(
      (x) => x.value === store.settings.openai_ttsModel,
    );
    return model?.supportsInstructions || false;
  }, [store.settings.openai_ttsModel]);

  return (
    <TextareaSetting
      name="Voice Instructions"
      description="Optional instructions to customize the tone and style of the voice."
      store={store}
      provider="openai"
      fieldName="openai_ttsInstructions"
      placeholder="Example: Speak in a whisper"
      rows={3}
      disabled={!modelSupportsInstructions}
    />
  );
});
