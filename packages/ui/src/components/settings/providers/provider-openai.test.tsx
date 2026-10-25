import React from "react";
import { describe, it, expect } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { TTSPluginSettingsStore } from "open-tts";
import { createTestSettingsStore } from "../../test-utils";
import { OpenAISettings } from "./provider-openai";

async function renderWithModel(
  model: string,
  voice?: string,
): Promise<TTSPluginSettingsStore> {
  const store = await createTestSettingsStore();
  await act(() =>
    store.updateModelSpecificSettings("openai", {
      openai_ttsModel: model,
      ...(voice ? { openai_ttsVoice: voice } : {}),
    }),
  );
  render(<OpenAISettings store={store} />);
  return store;
}

describe("OpenAISettings", () => {
  it("shows no deprecation note for gpt-realtime-2.1-mini", async () => {
    await renderWithModel("gpt-realtime-2.1-mini");
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("shows a deprecation note for a deprecated model", async () => {
    await renderWithModel("tts-1");
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("January 6, 2027");
    expect(note.textContent).toContain("gpt-realtime-2.1-mini");
  });

  it("offers marin and cedar but not fable, nova or onyx for realtime", async () => {
    await renderWithModel("gpt-realtime-2.1-mini");
    expect(screen.getByRole("option", { name: "Marin" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Cedar" })).toBeTruthy();
    for (const name of ["Fable", "Nova", "Onyx"]) {
      expect(screen.queryByRole("option", { name })).toBeNull();
    }
  });

  it("switches an unsupported voice to the first valid one for realtime", async () => {
    const store = await renderWithModel("tts-1", "fable");
    expect(store.settings.openai_ttsVoice).toBe("fable");
    await act(() =>
      store.updateModelSpecificSettings("openai", {
        openai_ttsModel: "gpt-realtime-2.1-mini",
      }),
    );
    expect(store.settings.openai_ttsVoice).toBe("alloy");
  });

  it("labels deprecated models in the model dropdown", async () => {
    await renderWithModel("gpt-realtime-2.1-mini");
    expect(
      screen.getByRole("option", { name: "tts-1 (deprecated)" }),
    ).toBeTruthy();
  });
});
