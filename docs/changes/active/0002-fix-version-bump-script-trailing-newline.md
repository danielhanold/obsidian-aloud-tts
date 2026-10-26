---
id: 2
slug: 'fix-version-bump-script-trailing-newline'
title: 'Fix version-bump script trailing newline'
status: 'implemented'
priority: 'high'
type: 'fix'
deliverable: 'pr'
created: '2026-10-26'
updated: '2026-10-26'
depends_on: []
stacked_on:
related: []
discovered_from: [1]
adrs: []
spec: 'docs/superpowers/specs/2026-10-26-fix-version-bump-script-trailing-newline-design.md'
plan: 'docs/superpowers/plans/2026-10-25-fix-version-bump-script-trailing-newline.md'
results: 'docs/results/2026-10-25-fix-version-bump-script-trailing-newline-results.md'
auto_groomable:
hold:
branch_prefix:
branch: 'fix/fix-version-bump-script-trailing-newline'
pr: 'https://github.com/danielhanold/obsidian-aloud-tts/pull/2'
blocked_by:
reconciled: true
---

## Artifacts

<!-- docket:artifacts:start (generated — do not hand-edit) -->
| Artifact | Link |
|---|---|
| Spec | [2026-10-26-fix-version-bump-script-trailing-newline-design.md](../../superpowers/specs/2026-10-26-fix-version-bump-script-trailing-newline-design.md) |
| Plan | [2026-10-25-fix-version-bump-script-trailing-newline.md](../../superpowers/plans/2026-10-25-fix-version-bump-script-trailing-newline.md) |
| Results | [2026-10-25-fix-version-bump-script-trailing-newline-results.md](../../results/2026-10-25-fix-version-bump-script-trailing-newline-results.md) |
<!-- docket:artifacts:end -->

## Why

version-bump.mjs rewrites the package.json, manifest.json and versions.json files with JSON.stringify(..., null, 2), which drops the trailing newline. The release workflow runs `pnpm run format:check`, so Prettier rejects the four bumped package.json files and the job fails before the release step. Tag 0.15.2-rc1 was created by the bump workflow, but release run 40249468093 failed and no GitHub release exists.

## What changes

version-bump.mjs appends a trailing newline to every JSON file it writes (the four packages/*/package.json files, manifest.json and versions.json). The four package.json files on main (06bd09b, version 0.15.2-rc1) are reformatted so Prettier passes. The failed 0.15.2-rc1 tag is handled by cutting 0.15.2-rc2 with the rc bump once the fix is on main.

## Out of scope

Reworking the bump or release workflows, changing the tagging scheme, or deleting the 0.15.2-rc1 tag (left as a record of the failed run unless the maintainer chooses to remove it).

## Reconcile log

### 2026-10-26

Unchanged against main 06bd09b: version-bump.mjs still writes JSON without a trailing newline and the four packages/*/package.json files lack one.

## Build evidence

<!-- docket:build-evidence:start -->
command:  pnpm test
result:   green
head_sha: b554471c778a9219b05e9fbcaa72c7adbf8d3b88
ran_at:   2026-10-26T00:40:06Z
<!-- docket:build-evidence:end -->
