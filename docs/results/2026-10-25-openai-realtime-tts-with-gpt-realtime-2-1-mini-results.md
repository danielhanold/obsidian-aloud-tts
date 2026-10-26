<!-- docket:backlink:start (generated — do not hand-edit) -->
> ↩ **[Change 0001 — OpenAI Realtime TTS with gpt-realtime-2.1-mini](../changes/archive/2026-10-26-0001-openai-realtime-tts-with-gpt-realtime-2-1-mini.md)**
<!-- docket:backlink:end -->

# OpenAI Realtime TTS with gpt-realtime-2.1-mini — Results

**Human action:** Needed before merge. Run one live check against the real OpenAI Realtime API, because no automated test touches the live API. The steps are under Human actions and testing.

## Outcome

`gpt-realtime-2.1-mini` is now available in the OpenAI provider through the Realtime API WebSocket, and new installs use it by default. Existing users keep their saved model and see a passive deprecation note. `tts-1`, `tts-1-hd` and `gpt-4o-mini-tts` still work and are labelled deprecated. The realtime voice list adds Marin and Cedar, and the voice dropdown shows only the voices the selected model supports.

Every response's transcript goes through a fidelity check against the text:
- Small drift plays with no warning.
- Large drift plays with an amber warning in the player. The warning is cached with the audio in memory, in IndexedDB, and in the vault (a `.fidelity` sidecar next to the `.mp3`).
- No overlap is a non-retryable `fidelity_mismatch` error. That audio is never cached, never re-requested, and never fetched again for the same text and settings.

Export now converts each provider result to MP3 before concatenating, which also fixes Gemini. The completion notice counts flagged passages. Realtime exports split text into chunks of at most 1000 characters. The configuration docs are updated.

## Human actions and testing

- **Important: live smoke test of the realtime model.** Why: the WebSocket event names, sending the API key through the subprotocol, and handshake behaviour were checked against OpenAI's documentation only, never against the live API. If OpenAI rejects a standard key through the subprotocol, the new default model will not work at all.
  - Prerequisites: a real OpenAI API key. Run `pnpm install` in the repo.
  - Steps:
    1. `OPENAI_API_KEY=<key> pnpm run e2e`. Expected: the test "web UI reads a sentence with gpt-realtime-2.1-mini over the Realtime API" passes.
    2. Optionally, build the plugin (`pnpm run build`), load it in Obsidian, choose OpenAI with model `gpt-realtime-2.1-mini`, and play a paragraph. Expected: the paragraph is read verbatim, with no amber warning.
    3. Enter a deliberately wrong key and play again. Expected: an error asking you to check the API key. If you get a generic connection error after several retries instead, that confirms the F6 follow-up below.
  - If skipped: whether the default model works at all stays unverified.

## Verification performed

- The full suite (`pnpm test`) ran green on the final head after one integration repair (a test mock gained the new export) and the review fix pass.
- Workers ran typecheck, eslint and prettier on every commit through the pre-commit hook.
- A deep-tier review ran and returned 6 findings. F1 (blocker), F2, F3 and F4 were fixed in-branch. F5 and F6 were deferred; see below.
- The backlog check ran and found no proposed or deferred changes (checked 0).
- The live e2e run was not done because no API key was available.

## Known issues and follow-ups

- **A bad API key may show as a generic connection error (F6, suspected).** This would happen if OpenAI rejects the WebSocket handshake instead of sending an `invalid_api_key` event: the user sees a retryable connection error, and the request is retried up to 4 times. The impact is a confusing error message; no audio is produced either way. It is unconfirmed until the live check above runs. Suggested next action: if it is confirmed, treat an error or close before `open` as non-retryable and point the user to their key. No existing change fits (checked 0); this needs a new change that a human captures.
- **Spec copy on the feature branch (F5).** The review flagged `docs/superpowers/specs/...-design.md` on the code branch. The workflow commits that copy on purpose as the branch's first commit, so it is kept.
- **Realtime export chunk size is a conservative guess.** 1000 characters was chosen without a measured output limit. Very long passages could still come back `incomplete` and fail an export. Suggested next action: tune it after live use. No existing change fits (checked 0).
- **Removing the deprecated models after January 6, 2027.** This is out of scope for this change. No existing change fits (checked 0); it needs a new change that a human captures.
