<!-- docket:backlink:start (generated — do not hand-edit) -->
> ↩ **[Change 0002 — Fix version-bump script trailing newline](../../changes/active/0002-fix-version-bump-script-trailing-newline.md)**
<!-- docket:backlink:end -->

# Fix version-bump script trailing newline

## Problem

`version-bump.mjs` writes JSON with `JSON.stringify(value, null, 2)`, which has no trailing newline. The release workflow runs `pnpm run format:check`, and Prettier requires the newline, so every bump commit fails the release build. Seen on tag `0.15.2-rc1` (release run 40249468093): the tag exists, no GitHub release was created.

## Design

1. In `version-bump.mjs`, append `"\n"` to every `writeFileSync` of JSON: the four `packages/*/package.json` writes, and the `manifest.json` and `versions.json` writes.
2. Reformat the four `packages/*/package.json` files on `main` so they end in a newline (run `pnpm run format`, which should touch only those files). Their version stays `0.15.2-rc1`.
3. Verify by running `node version-bump.mjs specified 0.15.2-rc2` in a scratch checkout (or `git stash`-free copy), then `pnpm run format:check`; it must pass. Do not commit that bump.

## Release follow-up (maintainer action, not code)

Once the fix is on `main`, run the bump workflow with `bump: rc` to produce `0.15.2-rc2`. The `0.15.2-rc1` tag is left in place.

## Testing

No unit test harness exists for the script. A small vitest case that runs the script against a temp copy of the JSON files and asserts each file ends with a newline is welcome but optional; the format:check pass in step 3 is the required check.
