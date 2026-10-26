# Release workflow uses built-in GitHub token

Change 0003 — Release workflow uses built-in GitHub token

## Problem

`.github/workflows/release.yml` sets `GITHUB_TOKEN: ${{ secrets.GH_RELEASE_TOKEN }}` on the "Create release" step. The secret is not defined on the fork, so `gh` receives an empty token and exits with code 4 ("set the GH_TOKEN environment variable"). The step only creates a release in the same repository, which the built-in token can do.

## Design

1. Add `permissions: contents: write` to the `build` job. Job-level permissions override the repository's default workflow permissions, so no repository setting needs to change.
2. In the "Create release" step, set `GITHUB_TOKEN: ${{ github.token }}` in place of the `GH_RELEASE_TOKEN` secret reference.
3. Leave everything else in the workflow as it is, including the `pull_request` trigger. The release step is already gated on a tag ref or `workflow_dispatch`, so pull requests only run the build.

## Known limitation

Releases created with the built-in token do not trigger other workflows. No workflow in this repository listens for `release` events, so this has no effect today.

## Testing

The workflow cannot run locally. Verify by running the bump workflow with `bump: rc` on `main` after merging and confirming a pre-release appears with `main.js`, `manifest.json` and `styles.css` attached.
