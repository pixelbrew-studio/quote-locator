# Plan 001: `npm publish` always ships a freshly built `dist/`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 143e9ae..HEAD -- package.json`
> If `package.json` changed since this plan was written, compare the
> "Current state" excerpt against the live file before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `143e9ae`, 2026-06-30

## Why this matters

This is a library whose entire value is being published to npm correctly. The
build output lives in `dist/`, which is gitignored (`.gitignore:2`) and is only
ever produced as a side effect of `npm run build` or `npm test`. Nothing runs
the build at publish time. If a maintainer runs `npm publish` on a clean
checkout (or in CI) without having just built, npm ships whatever happens to be
in `dist/` — stale output, or nothing at all. The package declares
`"files": ["dist", ...]` and a `bin` pointing at `dist/cli.js`, so a publish
with an empty `dist/` produces an installable package that imports nothing and
whose CLI is missing. Adding a `prepublishOnly` script makes `npm publish`
build first, every time.

## Current state

- `package.json` — package manifest. Relevant excerpt (`package.json:21-24`):

```json
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "npm run build && node --test test/*.test.mjs"
  },
```

- `.gitignore:2` contains `dist/` — build output is not committed.
- `package.json:6-8` declares the CLI bin: `"quote-locator": "./dist/cli.js"`.
- `package.json:15-20` declares `"files": ["dist", "README.md", "LICENSE", "SECURITY.md"]`.

Convention: scripts here are plain npm scripts, double-quoted JSON, no extra
tooling. Match that style.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build | `npm run build` | exit 0, populates `dist/` |
| Test | `npm test` | exit 0, all tests pass |
| Dry-run publish | `npm publish --dry-run` | exit 0; file list includes `dist/index.js`, `dist/cli.js`, `dist/index.d.ts` |

## Scope

**In scope** (the only file you should modify):
- `package.json`

**Out of scope** (do NOT touch):
- `tsconfig.json`, `src/**`, `test/**` — no code changes are needed.
- `.github/workflows/ci.yml` — CI already runs `npm test`, which builds; leave it.

## Git workflow

- Branch: `advisor/001-prepublish-build-hook`
- One commit. Message style matches `git log` (plain imperative, no prefix, no emoji),
  e.g. `Build dist on prepublish`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `prepublishOnly` script

Edit the `scripts` block in `package.json` to add a `prepublishOnly` entry that
runs the existing build. Result shape:

```json
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "npm run build && node --test test/*.test.mjs",
    "prepublishOnly": "npm run build"
  },
```

(`prepublishOnly` runs only on `npm publish`, not on `npm install` by
consumers — that is the intended trigger. Do not use `prepare`, which would
also run on every consumer install and fail because `typescript` is a
devDependency.)

**Verify**: `node -e "process.exit(require('./package.json').scripts.prepublishOnly === 'npm run build' ? 0 : 1)"` → exit 0

### Step 2: Confirm a publish would include the built artifacts

Run a clean build then a dry-run publish.

**Verify**: `npm run build && npm publish --dry-run 2>&1 | grep -E "dist/(index|cli)\.js"` → prints lines for `dist/index.js` and `dist/cli.js` (exit 0)

## Test plan

No new unit tests — this is a packaging change. The verification is the
dry-run publish file list in Step 2. Do not add a test framework or a test for
this.

## Done criteria

ALL must hold:

- [ ] `package.json` `scripts.prepublishOnly` equals `"npm run build"`
- [ ] `npm run build` exits 0
- [ ] `npm publish --dry-run` exits 0 and its file list includes `dist/index.js`, `dist/cli.js`, and `dist/index.d.ts`
- [ ] No files outside `package.json` are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `package.json` no longer matches the "Current state" excerpt (drift).
- `npm publish --dry-run` reports a private or auth error you cannot resolve
  read-only — the dry run should not require auth; if it does, report it rather
  than logging in.
- The build fails after `npm ci` — that is a separate problem; report it.

## Maintenance notes

- If a `prepare`/`prepack` step is ever added, make sure it does not run for
  downstream consumers (they don't have `typescript` installed).
- A reviewer should confirm `dist/` is still gitignored (it should be) so the
  build artifact is never committed alongside this change.
