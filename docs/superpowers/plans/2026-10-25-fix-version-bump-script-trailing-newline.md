<!-- docket:backlink:start (generated — do not hand-edit) -->
> ↩ **[Change 0002 — Fix version-bump script trailing newline](../../changes/active/0002-fix-version-bump-script-trailing-newline.md)**
<!-- docket:backlink:end -->

# Fix Version-Bump Script Trailing Newline Implementation Plan

> **For agentic workers:** This plan is executed by `docket-build`, one task per tier worker under the `docket-build-task` contract. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `version-bump.mjs` write every JSON file with exactly one trailing newline, and reformat the four `packages/*/package.json` files on the branch so `pnpm run format:check` passes.

**Architecture:** `version-bump.mjs` (repo root, plain Node ESM) has six `writeFileSync` calls that write `JSON.stringify(value, null, 2)`. Each gets `+ "\n"` appended. The four package.json files currently end in `}` with no newline. They get that newline added, and nothing else changes. There is no unit test: the repo's vitest config only collects `packages/**/*.test.ts(x)`, and the spec makes the test optional. A run of the script against a temp copy is the failing-then-passing check, and the spec's required check is `format:check` after a scratch bump that is not committed.

**Tech Stack:** Node 20 ESM script, pnpm, Prettier (default config; no `.prettierrc` in the repo).

**Spec:** `docs/superpowers/specs/2026-10-26-fix-version-bump-script-trailing-newline-design.md` (on the `docket` metadata branch)

## Global Constraints

- Every JSON write in `version-bump.mjs` must append `"\n"`: the four `packages/*/package.json` writes, `manifest.json`, and `versions.json`.
- The four `packages/*/package.json` files keep version `0.15.2-rc1`. Only the trailing newline is added.
- Verification: run `node version-bump.mjs specified 0.15.2-rc2`, then `pnpm run format:check`, which must pass. **Do not commit that bump.**
- Out of scope: the bump and release workflows (`.github/workflows/*.yml`), `version-bump.sh`, the tagging scheme, and the `0.15.2-rc1` tag.
- The worktree has no `node_modules`. Run `pnpm install` once (after `corepack enable` if `pnpm` is missing) before any `pnpm` command. Never commit lockfile churn from that install. If `pnpm-lock.yaml` changes, run `git checkout -- pnpm-lock.yaml`.

## Review Focus

- **Release (non-prerelease) bumps:** `manifest.json` and `versions.json` are written only when the target version has no `-rc`/`-alpha`/`-beta` suffix. An rc-only check would never exercise those two writes. Task 1's check also runs `specified 0.15.3`.
- **Files outside `format:check`:** `format:check` only covers `packages`, `test-setup.ts`, `playwright.config.ts` and `vitest.config.ts`, so a missing newline in `manifest.json` or `versions.json` would pass CI unnoticed. Task 1 checks those bytes directly.
- **Exactly one newline:** a file must end in `}\n`, never `}\n\n`. Task 1 checks the last two bytes.
- **Repeat bumps:** a second bump over an already-fixed file must still leave exactly one newline. JSON.parse ignores whitespace, so it should. Task 1 bumps twice.
- **Scratch bump leaking into the branch:** the Task 2 verification bump rewrites tracked files in the worktree. It must be reverted, and the worktree must be clean when the task ends.

---

### Task 1: Append Trailing Newline to Every JSON Write in `version-bump.mjs`

**Files:**
- Modify: `version-bump.mjs` (the `writeFileSync` call in the package loop, plus the `manifest.json` and `versions.json` writes inside `if (!isPreRelease)`)

**Interfaces:**
- Consumes: nothing.
- Produces: every JSON file `version-bump.mjs` writes ends in exactly one `"\n"`. Task 2 relies on this.

- [ ] **Step 1: Write the failing check (temp-copy run)**

From the worktree root, copy the script and its inputs into a fresh temp dir. Bump twice, once as a prerelease and once as a release, then check the last two bytes of each written file:

```bash
WT="$(pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/vbump.XXXXXX")"
mkdir -p "$T/packages"/{open-tts,ui,obsidian,web}
for p in open-tts ui obsidian web; do cp "$WT/packages/$p/package.json" "$T/packages/$p/"; done
cp "$WT/version-bump.mjs" "$WT/manifest.json" "$WT/versions.json" "$T/"
( cd "$T" && node version-bump.mjs specified 0.15.2-rc2 && node version-bump.mjs specified 0.15.3 && node version-bump.mjs specified 0.15.4 )
fail=0
for f in "$T"/packages/*/package.json "$T/manifest.json" "$T/versions.json"; do
  last2="$(tail -c 2 "$f" | xxd -p)"
  [ "$last2" = "7d0a" ] || { echo "BAD $f -> $last2"; fail=1; }
done
grep -q '"0.15.4"' "$T/versions.json" || { echo "BAD versions.json missing 0.15.4"; fail=1; }
echo "fail=$fail"
```

- [ ] **Step 2: Run it to verify it fails**

Expected: one `BAD ... -> 0a7d` line for each of the six files, then `fail=1`. Each file ends in `\n}` with no final newline.

- [ ] **Step 3: Implement**

In `version-bump.mjs`, change each of the three `writeFileSync(path, JSON.stringify(x, null, 2))` call sites to `writeFileSync(path, JSON.stringify(x, null, 2) + "\n")`. The package loop counts as one call site that covers four files. Change nothing else in the script.

- [ ] **Step 4: Rerun the Step 1 check against a fresh temp dir**

Run the whole Step 1 block again (it creates a new `$T` from the edited script).
Expected: no `BAD` lines and `fail=0`. That proves all six files end in `}\n` after three consecutive bumps, including two release bumps that write `manifest.json` and `versions.json`.

- [ ] **Step 5: Confirm only the script changed**

Run: `git status --porcelain`
Expected: exactly ` M version-bump.mjs`. The temp dir is outside the worktree.

- [ ] **Step 6: Commit**

```bash
git add version-bump.mjs
git commit -m "fix: end JSON written by version-bump.mjs with a newline"
```

### Task 2: Reformat the Four Package Manifests and Verify `format:check` After a Scratch Bump

**Files:**
- Modify: `packages/open-tts/package.json`, `packages/ui/package.json`, `packages/obsidian/package.json`, `packages/web/package.json` (add the trailing newline only)

**Interfaces:**
- Consumes: Task 1's fixed `version-bump.mjs`, which writes `}\n`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Install dependencies**

Run: `pnpm install` (after `corepack enable` if needed). If `git status --porcelain` then shows `pnpm-lock.yaml`, run `git checkout -- pnpm-lock.yaml`.
Expected: install succeeds and `git status --porcelain` is empty.

- [ ] **Step 2: Run the failing check**

Run: `pnpm run format:check`
Expected: FAIL. Prettier flags exactly the four `packages/*/package.json` files. If it flags any other file, stop and report BLOCKED with the list, because the spec assumes only these four are dirty.

- [ ] **Step 3: Reformat only the four files**

Run: `pnpm exec prettier --write packages/open-tts/package.json packages/ui/package.json packages/obsidian/package.json packages/web/package.json`

- [ ] **Step 4: Verify the diff is newline-only and the check passes**

Run: `git diff --stat` and `git diff`
Expected: four files, each `1 insertion(+), 1 deletion(-)`. The only hunk is the closing `}`, with the `\ No newline at end of file` marker removed. Every `"version"` is still `"0.15.2-rc1"`.

Run: `pnpm run format:check`
Expected: PASS ("All matched files use Prettier code style!").

- [ ] **Step 5: Commit**

```bash
git add packages/open-tts/package.json packages/ui/package.json packages/obsidian/package.json packages/web/package.json
git commit -m "style: add trailing newline to package manifests"
```

- [ ] **Step 6: Scratch bump and `format:check` (spec verification, not committed)**

Run from the worktree root:

```bash
node version-bump.mjs specified 0.15.2-rc2
pnpm run format:check
```

Expected: the bump rewrites the four package.json files to `0.15.2-rc2`, and `format:check` PASSES.

- [ ] **Step 7: Discard the scratch bump**

Run: `git checkout -- packages/open-tts/package.json packages/ui/package.json packages/obsidian/package.json packages/web/package.json manifest.json versions.json && git status --porcelain`
Expected: empty output, and `grep '"version"' packages/obsidian/package.json` shows `"0.15.2-rc1"`. Do not commit anything in this step.
