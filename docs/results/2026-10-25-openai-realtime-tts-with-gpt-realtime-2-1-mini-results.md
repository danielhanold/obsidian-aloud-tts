<!-- docket:backlink:start (generated — do not hand-edit) -->
> ↩ **[Change 0001 — OpenAI Realtime TTS with gpt-realtime-2.1-mini](../changes/active/0001-openai-realtime-tts-with-gpt-realtime-2-1-mini.md)**
<!-- docket:backlink:end -->

# OpenAI Realtime TTS with gpt-realtime-2.1-mini — Results

**Human action:** Assessment pending; review fixes are in progress.

## Outcome

All 10 plan tasks are built on `feat/openai-realtime-tts-with-gpt-realtime-2-1-mini`, plus one integration repair (the `TTSPlugin.test.ts` mock now spreads the real `open-tts` exports). The full suite (`pnpm test`) passed at 6840d9a.

## Verification performed

- The first full-suite run failed in one suite (`TTSPlugin.test.ts` mock missing `OPENAI_REALTIME_MODEL`). After the repair, the second run passed.
- The deep review returned 6 findings: 1 blocker, 1 important, 4 minor.
  - F1 (blocker): a `fidelity_mismatch` chunk ahead of the playhead is re-requested automatically, because the rejected entry leaves the loader cache and `loadCheck` resets the failed chunk.
  - F2 (important): export sends up to 4000-character passages to the realtime model, whose per-response output limit is unverified.
  - F3 (minor): the web export alert drops the flagged-passage count.
  - F4 (minor): the `loadCheckLoop` catch-all silently swallows append/decode errors.
  - F5 (minor): the spec copy on the feature branch duplicates the metadata copy.
  - F6 (minor): a bad key rejected at the WebSocket handshake surfaces as a retryable connection error.
