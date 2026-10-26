<!-- docket:backlink:start (generated — do not hand-edit) -->
> ↩ **[Change 0002 — Fix version-bump script trailing newline](../changes/active/0002-fix-version-bump-script-trailing-newline.md)**
<!-- docket:backlink:end -->

# Fix Version-Bump Script Trailing Newline — Results

**Human action:** Yes. After merging, run the bump workflow with `bump: rc` to cut `0.15.2-rc2`, because `0.15.2-rc1` never produced a GitHub release.

## Outcome

`version-bump.mjs` now writes every JSON file (the four `packages/*/package.json` files, `manifest.json`, `versions.json`) with a trailing newline, so a bump commit passes the release workflow's `pnpm run format:check`. The four package manifests on `main` were reformatted to end in a newline; their version stays `0.15.2-rc1`. The spec copy's headings were also changed to Title Case after review.

## Human actions and testing

- **Important — cut the next release candidate.** Why: tag `0.15.2-rc1` exists but its release run (40249468093) failed, so no GitHub release exists. When: right after this PR merges to `main`. Prerequisites: merge rights and access to the repository's GitHub Actions. Steps: open Actions, run the version bump workflow with input `bump: rc`; expect a commit setting the packages to `0.15.2-rc2` and a tag `0.15.2-rc2`; then confirm the release workflow for that tag succeeds (its `format:check` step is green) and a GitHub pre-release `0.15.2-rc2` appears. If skipped: the fix stays unproven against the real workflow and no release candidate is published. The `0.15.2-rc1` tag is left in place; delete it only if you want to.

## Verification performed

- A temp-copy run of the script (bumps to `0.15.2-rc2`, `0.15.3`, `0.15.4`) left all six files ending in `}` without a newline before the fix, and ending in exactly one newline after it, including the release bumps that write `manifest.json` and `versions.json`.
- `pnpm run format:check` failed on the four package manifests before the reformat and passed after it; it passed again after a scratch `node version-bump.mjs specified 0.15.2-rc2` in the worktree (that bump was discarded, not committed).
- Full suite `pnpm test` green at the final head.
- Review: deep tier, two minor findings; the spec heading finding was fixed, and the missing-regression-test finding was recorded (see below).

## Known issues and follow-ups

- **No automated regression test for the script (confirmed, low impact).** If someone later removes the trailing newline again, nothing in `pnpm test` catches it; the failure would show up only when the release workflow's `format:check` runs after a bump tag is already pushed, as happened with `0.15.2-rc1`. The vitest config only collects `packages/**` tests, so a root-level script test did not fit this change. `format:check` also does not cover `manifest.json` or `versions.json`. Workaround: the manual check above. Suggested next action: optional — a human may capture a small change adding a script test or extending `format:check` coverage; No existing change fits (checked 0).
