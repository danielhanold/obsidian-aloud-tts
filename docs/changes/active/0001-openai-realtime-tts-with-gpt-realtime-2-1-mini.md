---
id: 1
slug: 'openai-realtime-tts-with-gpt-realtime-2-1-mini'
title: 'OpenAI Realtime TTS with gpt-realtime-2.1-mini'
status: 'proposed'
priority: 'high'
type: 'feat'
deliverable: 'pr'
created: '2026-10-25'
updated: '2026-10-25'
depends_on: []
stacked_on:
related: []
discovered_from: []
adrs: []
spec: 'docs/superpowers/specs/2026-10-25-openai-realtime-tts-with-gpt-realtime-2-1-mini-design.md'
plan:
results:
auto_groomable:
hold:
branch_prefix:
branch:
pr:
blocked_by:
reconciled: false
---

## Artifacts

<!-- docket:artifacts:start (generated — do not hand-edit) -->
| Artifact | Link |
|---|---|
| Spec | [2026-10-25-openai-realtime-tts-with-gpt-realtime-2-1-mini-design.md](../../superpowers/specs/2026-10-25-openai-realtime-tts-with-gpt-realtime-2-1-mini-design.md) |
<!-- docket:artifacts:end -->

## Why

OpenAI deprecated tts-1, tts-1-hd, and gpt-4o-mini-tts; they shut down on January 6, 2027. The replacement, gpt-realtime-2.1-mini, is not served by /v1/audio/speech and only works through the Realtime API (WebSocket). Without this change, read-aloud through the built-in OpenAI provider stops working on that date. The realtime model is conversational rather than a dedicated reader, so reading the actual text needs explicit safeguards.

## What changes

- Add gpt-realtime-2.1-mini to the OpenAI provider via the Realtime API WebSocket, returning 24 kHz PCM through the existing audio layer.
- Make it the default model for new installs; existing users keep their saved model and see a passive deprecation note in settings (no auto-migration, no nudging).
- Keep tts-1, tts-1-hd, and gpt-4o-mini-tts selectable and working until shutdown, labelled deprecated.
- Update the voice list for the realtime model (add marin and cedar; fable, nova, onyx unavailable).
- Fidelity check against the response transcript: small drift plays silently, large drift plays with a non-blocking amber warning in the player (cached with the warning), no overlap is a non-retryable error that is discarded and never cached. No automatic re-requests.
- Export (Save document as audio) converts PCM to MP3 before concatenation, also fixing Gemini, and reports flagged passages in its completion toast.
- Update the configuration docs.

## Out of scope

- Removing the deprecated models (follow-up after January 6, 2027).
- Changing the OpenAI-compatible (openaicompat) provider.
- A user-triggered regenerate action for flagged passages.
- Streaming playback as audio arrives, connection reuse, and any conversational Realtime use.
