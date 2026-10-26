---
id: 3
slug: 'release-workflow-uses-built-in-github-token'
title: 'Release workflow uses built-in GitHub token'
status: 'proposed'
priority: 'high'
type: 'chore'
deliverable: 'pr'
created: '2026-10-26'
updated: '2026-10-26'
depends_on: []
stacked_on:
related: []
discovered_from: [2]
adrs: []
spec: 'docs/superpowers/specs/2026-10-26-release-workflow-uses-built-in-github-token-design.md'
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
| Spec | [2026-10-26-release-workflow-uses-built-in-github-token-design.md](../../superpowers/specs/2026-10-26-release-workflow-uses-built-in-github-token-design.md) |
<!-- docket:artifacts:end -->

## Why

release.yml creates the GitHub release with `GITHUB_TOKEN: ${{ secrets.GH_RELEASE_TOKEN }}`. That secret does not exist on the fork, so `gh release create` fails with 'set the GH_TOKEN environment variable' and no release is published (seen on the 0.15.2-rc1 release run). Nothing in the workflow needs a personal access token: it only creates a release in its own repository. The built-in token with contents write permission is enough and avoids a secret that has to be created and rotated.

## What changes

release.yml grants the build job `permissions: contents: write` and sets the release step's token to `${{ github.token }}` instead of the `GH_RELEASE_TOKEN` secret.

## Out of scope

Changing when the release runs, the build, lint or test steps, the version-bump workflow, or the release asset list. Removing a GH_RELEASE_TOKEN secret if one is ever configured.
