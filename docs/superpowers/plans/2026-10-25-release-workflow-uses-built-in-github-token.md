<!-- docket:backlink:start (generated — do not hand-edit) -->
> ↩ **[Change 0003 — Release workflow uses built-in GitHub token](../../changes/archive/2026-10-26-0003-release-workflow-uses-built-in-github-token.md)**
<!-- docket:backlink:end -->

# Release Workflow Uses Built-In GitHub Token Implementation Plan

> **For agentic workers:** This plan is executed by `docket-build`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The release workflow creates GitHub releases with the built-in `github.token` and job-level `contents: write` permission instead of the undefined `GH_RELEASE_TOKEN` secret.

**Architecture:** A two-line configuration change to `.github/workflows/release.yml`: add a `permissions` block to the `build` job and swap the token expression on the "Create release" step. Nothing else in the workflow changes.

**Tech Stack:** GitHub Actions YAML, `gh` CLI (already used by the step), pnpm/vitest for the regression suite.

**Spec:** `docs/superpowers/specs/2026-10-26-release-workflow-uses-built-in-github-token-design.md`

## Global Constraints

- The `build` job gets exactly `permissions:` with `contents: write` (job level, not workflow level).
- The "Create release" step's env becomes `GITHUB_TOKEN: ${{ github.token }}`.
- No other change to the workflow: triggers (including `pull_request`), build/lint/test steps, the release step's `if:` gate, the tag logic, and the asset list (`packages/obsidian/main.js manifest.json packages/obsidian/styles.css`) stay byte-identical.
- Do not touch `.github/workflows/version-bump.yml` or any other workflow.
- Commit messages use conventional prefixes (`ci:` / `chore:`), matching repository history.

## Review Focus

1. Indentation of the new `permissions:` block: it must sit at the same level as `runs-on:` under `build:` (four spaces), or GitHub rejects the workflow or applies it to the wrong scope. Pinned by the YAML-parse check in Task 1 Step 3.
2. Leftover references to `GH_RELEASE_TOKEN` anywhere in `.github/` would keep the failure alive. Pinned by the grep check in Task 1 Step 3.
3. Accidental edits to the rest of the workflow (triggers, `if:` gate, asset list). Pinned by the `git diff --stat` / diff review in Task 1 Step 4: the diff must show only the two intended hunks.
4. A workflow-level `permissions:` block would also restrict `pull_request` runs and future jobs; the spec requires job level. Pinned by the parse check asserting the key lives under `jobs.build`, and no top-level `permissions` key exists.
5. `version-bump.yml` dispatches `release.yml` via `workflow_dispatch`; that path must keep working, which it does as long as the `workflow_dispatch` trigger and its `version` input are untouched (covered by item 3).

---

### Task 1: Switch Release Step to Built-In Token

**Files:**
- Modify: `.github/workflows/release.yml` (the `build:` job header near line 19-20, and the "Create release" step `env:` near line 44-45)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks rely on.

There is no unit-test harness for workflow files. The "failing test" is a pair of checks that fail against the current file and pass after the edit.

- [ ] **Step 1: Run the checks against the current file to see them fail**

Run from the worktree root:

```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/release.yml')); b=d['jobs']['build']; assert 'permissions' not in d, 'workflow-level permissions present'; assert b.get('permissions')=={'contents':'write'}, b.get('permissions'); s=[x for x in b['steps'] if x.get('name')=='Create release'][0]; assert s['env']=={'GITHUB_TOKEN':'\${{ github.token }}'}, s['env']; print('OK')"
grep -rn "GH_RELEASE_TOKEN" .github/ && echo "FOUND" || echo "CLEAN"
```

Expected: the Python check fails with `AssertionError: None` (no job permissions yet); grep prints the `secrets.GH_RELEASE_TOKEN` line and `FOUND`.

- [ ] **Step 2: Edit `.github/workflows/release.yml`**

Under `jobs: build:`, directly after `runs-on: ubuntu-latest`, add:

```yaml
    permissions:
      contents: write
```

In the "Create release" step, change `GITHUB_TOKEN: ${{ secrets.GH_RELEASE_TOKEN }}` to `GITHUB_TOKEN: ${{ github.token }}`. Keep the env var name `GITHUB_TOKEN` (the `gh` CLI reads it).

- [ ] **Step 3: Re-run the checks to see them pass**

Run the same two commands from Step 1.
Expected: Python prints `OK`; grep prints `CLEAN`.

- [ ] **Step 4: Confirm the diff is only the two intended hunks**

Run: `git diff --stat && git diff`
Expected: `1 file changed, 3 insertions(+), 1 deletion(-)`; the diff shows only the added `permissions:` / `contents: write` lines and the one-line token swap.

- [ ] **Step 5: Run the project suite as a regression gate**

Run: `pnpm install && pnpm run test`
Expected: vitest exits 0 (no source code changed; this confirms nothing else regressed). `pnpm run format:check` does not cover `.github/`, so no formatter step applies to this file.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: create releases with the built-in GitHub token"
```

## Post-Merge Verification (Not Part Of The Build)

Per the spec, the workflow cannot run locally. After merge, run the version-bump workflow with `bump: rc` on `main` and confirm a pre-release appears with `main.js`, `manifest.json` and `styles.css` attached. Note this in the PR description; the build does not perform it.
