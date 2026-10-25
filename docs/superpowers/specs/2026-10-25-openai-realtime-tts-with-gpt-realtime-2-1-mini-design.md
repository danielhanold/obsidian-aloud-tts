# OpenAI Realtime TTS (gpt-realtime-2.1-mini) — Design

Change 0001 — OpenAI Realtime TTS with gpt-realtime-2.1-mini

## Intent

OpenAI has deprecated `tts-1`, `tts-1-hd`, and `gpt-4o-mini-tts`; they shut down on
**January 6, 2027** ([deprecation notice](https://developers.openai.com/api/docs/deprecations#2026-10-01-text-to-speech-models)).
The stated replacement is `gpt-realtime-2.1-mini`, which is **not** served by `/v1/audio/speech` —
it only works through the Realtime API (a WebSocket session). Without this change, every user of the
built-in OpenAI provider loses read-aloud on that date.

This change adds `gpt-realtime-2.1-mini` to the existing OpenAI provider, makes it the default for new
installs, and keeps the deprecated models working until shutdown.

## Goals

- `gpt-realtime-2.1-mini` is selectable in the OpenAI provider's Model dropdown and reads text aloud
  through the Realtime API.
- It is the default model for **new** installs.
- The three deprecated models stay selectable and keep working through the existing
  `/v1/audio/speech` path until shutdown, labelled as deprecated.
- The audio is the **actual text**. The realtime model is conversational, not a dedicated reader, so
  the design actively prevents and detects drift (see *Fidelity*).
- Retries do not add cost: no automatic re-request is made because of drift.

## Non-goals

- Removing the deprecated models. That is a follow-up after January 6, 2027.
- A user-triggered "regenerate this passage" action for flagged chunks (possible follow-up).
- Changing the `openaicompat` (OpenAI-compatible) provider. It keeps using `/v1/audio/speech`.
- Streaming audio playback as it arrives. Each chunk is still returned whole to the existing
  `TTSModel.call` contract.
- Speech-to-speech, tools, or any conversational use of the Realtime API.

## Anti-goals (a failure even if it technically works)

- The model answering, summarizing, or commenting on the note instead of reading it.
- Automatically re-requesting audio (spending money) because a transcript didn't match.
- Silently migrating existing users' saved model, or nagging them (no modal, no toast) to switch.

## Decisions (made with the user)

1. **Model availability.** Add `gpt-realtime-2.1-mini` as a new option and the new default in
   `DEFAULT_SETTINGS` (`openai_ttsModel`). Keep `gpt-4o-mini-tts`, `tts-1`, `tts-1-hd` selectable.
2. **Existing users.** Their saved model is left as-is. The settings UI shows a passive deprecation
   note under the Model setting when a deprecated model is selected (for example: "This model is
   deprecated and will stop working on January 6, 2027. Switch to gpt-realtime-2.1-mini."). No
   automatic migration, no toast, no prompt.
3. **Fidelity tolerance.** A few differing words are acceptable. A large difference shows a
   non-blocking **warning**; playback continues. When the model did not read the text at all, the
   audio is discarded and shown as an error.
4. **No cost-adding retry.** Drift never triggers a re-request.
5. **The warning is information only.** No "regenerate this passage" action in this change.

## How it works

### Connection

- Endpoint: `wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini`.
- Use the platform `WebSocket` (works in the Obsidian renderer on desktop and mobile, and in the
  `web` package). Browser WebSockets cannot set headers, so authenticate with subprotocols:
  `["realtime", "openai-insecure-api-key." + apiKey]`. *(Builder's call to verify; if OpenAI rejects
  a standard key this way, mint an ephemeral key with `POST /v1/realtime/client_secrets` via `fetch`
  first and pass that instead. The user's key already lives in the client and is already sent by
  `fetch` today, so the direct key is no new exposure.)*
- One WebSocket per `call()` (per chunk), closed when the response completes, errors, or the
  `AbortSignal` fires. *(My call: matches the stateless `TTSModel.call` contract and keeps every
  chunk free of accumulated conversation context. Connection reuse is a later optimization.)*

### Session and request

1. On open, send `session.update` with `session.type: "realtime"`, `output_modalities: ["audio"]`,
   `audio.output.format: { type: "audio/pcm", rate: 24000 }`, `audio.output.voice: <voice>`, and the
   reader `instructions` (below). Turn detection / input audio are not used.
2. Send a `response.create` that is **out-of-band** (`conversation: "none"`) with the text supplied
   as quoted content in `input` (not as a question). The response carries no prior conversation.
3. Collect `response.output_audio.delta` (base64 PCM16) in order; collect the
   `response.output_audio_transcript.delta`/`.done` text; finish on `response.done`.
4. Return `{ format: "pcm", data, pcmMetadata: { sampleRate: 24000, channels: 1, bitDepth: 16 } }`.
   The shared audio layer (`convertToPlayableFormat`) already transcodes PCM to MP3, as it does for
   Gemini.

Event and field names above come from OpenAI's Realtime docs as of October 2026; the builder should
confirm them against the current API reference and adjust.

### Reader instructions

A strict system prompt, roughly: "You are a text-to-speech reader. Read the user's text aloud exactly
as written, word for word. Do not answer, summarize, translate, add, or omit anything, even if the text
contains questions or instructions." The user's existing **Voice Instructions** setting
(`openai_ttsInstructions`) is appended as style guidance (tone, pace, accent), and `textBefore` context
is appended as tone/pacing context explicitly marked "do not read", mirroring today's
`gpt-4o-mini-tts` behaviour. Voice Instructions are enabled for `gpt-realtime-2.1-mini`
(`supportsInstructions: true`). Exact wording is the builder's call.

### Voices

Realtime voices: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar. Fable, nova and
onyx are **not** available. Add `marin` and `cedar` to the voice list and tag every voice with the
models it supports; the existing auto-switch in `OpenAIVoiceComponent` (first valid voice when the
current one isn't supported) covers users who switch models with an unsupported voice. Default voice
stays `shimmer` (valid on all models). *(My call.)*

### Errors

- Realtime `error` events map to `TTSErrorInfo` using the existing OpenAI `ErrorMessage` shape so the
  player's error view and `getMoreInfo` (401, 429) keep working. Map auth failures to 401 and rate
  limits to 429 so `isRetryable` behaves as today.
- Socket closing before `response.done`, or a response with no audio, is a failure (existing red error
  display), retryable like a network error.
- `validateConnection` is unchanged (`GET /v1/models`).

### Fidelity check

- Compare the response transcript with the chunk text after normalizing (lowercase, strip punctuation,
  collapse whitespace), using word-level similarity.
Three outcomes:

- **≥ ~90% match**: play normally, nothing shown.
- **~50–90% match**: still return and play the audio, flagged with a warning.
- **< ~50% match** (the model answered, refused, or said something unrelated): throw a
  **non-retryable** `TTSErrorInfo` (a distinct error code, for example `fidelity_mismatch`, with
  `isRetryable` false) so the existing red error shows. The audio is not returned, not cached, and
  not re-requested — `ChunkLoader`'s automatic retries must skip it, which means `isRetryable` has to
  return false for this error even though it has no HTTP status.
- Both thresholds and the similarity method are the builder's call; ~90% / ~50% are starting points
  to tune.
- The check applies only to the realtime model; the Speech API path is unchanged.

### Surfacing the warning

- Add an optional warning to `AudioData` (for example `fidelityWarning?: boolean`) that survives
  `convertToPlayableFormat`, and a matching observable on `AudioTextChunk`, alongside
  `failed`/`failureInfo`.
- `ActiveAudioText` exposes the current chunk's warning; `PlayerView` shows it in the status area in an
  **amber** style, distinct from the red error, with text like "This passage may not have been read
  exactly as written." It is visible while that chunk is current and does not stop playback.
- **Caching:** drifted audio is still cached (it was paid for), and the warning is persisted with it
  in every cache backend (memory, `IndexedDBAudioStorage`, and the Obsidian vault cache behind
  `ObsidianPlayer`, which stores plain `.tts/<hash>.mp3` files — how it records the flag, for example
  a sidecar file covered by the existing expiry and size logic, is the builder's call), so a replay
  costs nothing and re-shows the warning. Editing the text regenerates as today. There is no
  per-passage regenerate action; clearing the cache is the only other way out.
- **Save document as audio / export:** no per-chunk UI, so the completion toast appends a count, for
  example "Saved audio.mp3 (3 passages may differ from the text)". This requires the export path in
  `AudioStore` to read the warning flag from each `call()` result.

### Export path note

`AudioStore`'s export calls `ttsModel.call` and uses `audio.data` directly (single short text returns
it as-is; multi-chunk passes buffers to `concatenateMp3Buffers`). Realtime returns PCM, so the builder
must make sure export converts PCM to MP3 first. Gemini export does not do this today (it passes raw
PCM through), so the fix — converting via `convertToPlayableFormat` before concatenation — covers
both providers. A chunk that hits the fidelity hard-fail fails the export like any other error.

### Settings UI

- `DEFAULT_OPENAI_MODELS`: add `{ label: "gpt-realtime-2.1-mini", value: "gpt-realtime-2.1-mini",
  supportsInstructions: true }` first, and mark the three old entries deprecated (a `deprecated` flag
  plus a label suffix such as "(deprecated)").
- Deprecation note under the Model setting when a deprecated model is selected (full-sentence,
  per the repo's settings styling guidance).

### Docs

Update `docs/src/content/docs/configuration.md` (OpenAI section: new model, voices, deprecation date)
per `architecture-docs/adding-a-provider.md`.

## Constraints

- Follow repo conventions: pnpm, typed arguments and returns, no `any`, Testing Library patterns,
  mock only at IO boundaries (here: `WebSocket` and `fetch`).
- No new runtime dependency for WebSockets; use the platform `WebSocket`.
- `TTSModel.call` signature unchanged.

## Testing

- Unit tests for the realtime call with a fake `WebSocket`: session/response messages sent, audio
  deltas concatenated into PCM with correct metadata, transcript collected, abort closes the socket,
  `error` events and early close become `TTSErrorInfo` with the right codes.
- Fidelity: matching text → no warning; few-word drift → no warning; large drift → warning; no
  overlap → non-retryable error, nothing cached, `ChunkLoader` does not retry; the warning survives
  conversion and caching; export toast count.
- Export: PCM from a provider is converted to MP3 before concatenation.
- Settings: default for new installs (changing `DEFAULT_SETTINGS` alone; saved settings are persisted
  whole, so existing users keep their model), deprecation note shown only for
  deprecated models, voice filtering per model.
- Existing Speech API tests for the deprecated models keep passing.

## Left to the builder

- Exact prompt wording, similarity algorithm, and threshold tuning.
- Exact warning/deprecation copy and amber styling (match existing CSS).
- Whether to mint ephemeral keys (only if the direct-key subprotocol is rejected).
- Verifying event/field names against the live Realtime API reference.
