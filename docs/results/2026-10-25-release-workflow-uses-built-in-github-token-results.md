<!-- docket:backlink:start (generated — do not hand-edit) -->
> ↩ **[Change 0003 — Release workflow uses built-in GitHub token](../changes/archive/2026-10-26-0003-release-workflow-uses-built-in-github-token.md)**
<!-- docket:backlink:end -->

# Release Workflow Uses Built-In GitHub Token — Results

**Human action:** Yes. After merging, run one release-candidate bump on `main` to confirm a pre-release is published. The workflow cannot be exercised locally or in this PR.

## Outcome

The "Create release" step in `.github/workflows/release.yml` used the `GH_RELEASE_TOKEN` secret, which does not exist on this repository, so `gh release create` failed and no release was published (seen on the 0.15.2-rc1 run). The step now uses the built-in `${{ github.token }}`, and the `build` job grants `permissions: contents: write`, which is enough to create a release in the same repository. Nothing else in the workflow changed: the triggers, the build, lint and test steps, the tag logic, and the asset list are as before.

## Human actions and testing

### Important — Confirm a Release Is Published After Merge

GitHub Actions workflows cannot run locally, so nothing yet proves the built-in token can create the release. Do this on the first release after merge. If you skip it, the next real release could still fail.

Prerequisites: this PR merged into `main`. You need permission to run workflows on `danielhanold/obsidian-aloud-tts`.

1. In GitHub, open Actions, choose the version-bump workflow, and run it on `main` with `bump: rc`.
   Expected: the bump workflow completes and starts a "Release Obsidian plugin" run.
2. Open that release run.
   Expected: the "Create release" step succeeds, with no "set the GH_TOKEN environment variable" error.
3. Open Releases.
   Expected: a new pre-release for the rc tag, with `main.js`, `manifest.json` and `styles.css` attached.

Cleanup: if you don't want to keep the test pre-release, delete it and its tag.

## Verification performed

- Static checks on the workflow file: a YAML parse confirms `permissions: {contents: write}` sits on the `build` job, there is no workflow-level `permissions`, and the step env is `GITHUB_TOKEN: ${{ github.token }}`. A grep finds no `GH_RELEASE_TOKEN` left under `.github/`. Both checks failed before the edit and pass after it.
- Full suite (`pnpm test`) green at the final head. The first gate attempt failed only because dependencies were not installed in the new worktree (`vitest: command not found`). After `pnpm install` the suite passed, and it passed again after the review fix.
- Lean-tier review: 2 minor findings. One was fixed (Title Case headings in the branch's spec copy). The other, removing the spec copy from the branch, was deferred because the copy is the intended first commit of every change branch.
- The task worker's focused check (the YAML assertion) ran inside the 10-minute `timeout` wrapper.
