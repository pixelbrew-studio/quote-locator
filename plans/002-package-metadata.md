# Plan 002: Complete the npm package metadata

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

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (edits the same file as 001; if both are open, land 001 first to avoid a trivial merge)
- **Category**: tech-debt
- **Planned at**: commit `143e9ae`, 2026-06-30

## Why this matters

The published package is missing standard manifest fields that populate the npm
page and feed downstream tooling: `repository`, `bugs`, `homepage`, `author`,
and `engines.node`. Without `repository`/`bugs`, the npm page has no "Repository"
link and no issues link. Without `engines.node`, nothing communicates the
runtime floor — the code targets ES2022 with `NodeNext` module resolution and
CI runs on Node 24 (`.github/workflows/ci.yml:16`), but a consumer on Node 16
gets no install-time signal. These are one-time, low-risk additions.

## Current state

- `package.json` — package manifest. Full relevant context (`package.json:1-37`):

```json
{
  "name": "quote-locator",
  "version": "0.1.0",
  "description": "Find claimed quotes inside source text with exact, normalized, and fuzzy matching.",
  "type": "module",
  "bin": { "quote-locator": "./dist/cli.js" },
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist", "README.md", "LICENSE", "SECURITY.md"],
  "scripts": { ... },
  "keywords": ["citations", "quotes", "fuzzy-matching", "typescript", "ai-tools"],
  "license": "MIT",
  "devDependencies": { "@types/node": "^24.0.0", "typescript": "^5.8.0" }
}
```

- `README.md:80` shows the org GitHub: `https://github.com/pixelbrew-studio`.
  Sibling repos use `github.com/pixelbrew-studio/<repo>` (README.md:80-81).
- `SECURITY.md:7` lists the contact email `hello@pixelbrew.studio`.
- `.github/workflows/ci.yml:16` pins `node-version: 24`.
- Author/publisher is Pixelbrew Studio (`README.md:5`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Validate JSON | `node -e "require('./package.json')"` | exit 0 (no parse error) |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only file you should modify):
- `package.json`

**Out of scope** (do NOT touch):
- `README.md`, `SECURITY.md`, source, tests, CI.

## Git workflow

- Branch: `advisor/002-package-metadata`
- One commit. Plain imperative message, no prefix, no emoji, e.g.
  `Add repository, bugs, homepage, author and engines fields`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the metadata fields

Add the following top-level keys to `package.json`. Place `repository`, `bugs`,
`homepage`, and `author` near the existing `license`/`keywords` block, and add
`engines` as a top-level key. Use the canonical npm shapes:

```json
  "repository": {
    "type": "git",
    "url": "git+https://github.com/pixelbrew-studio/quote-locator.git"
  },
  "bugs": {
    "url": "https://github.com/pixelbrew-studio/quote-locator/issues"
  },
  "homepage": "https://github.com/pixelbrew-studio/quote-locator#readme",
  "author": "Pixelbrew Studio (https://pixelbrew.studio)",
  "engines": {
    "node": ">=18"
  },
```

Notes:
- `>=18` is the conservative floor for top-level-await-free ES2022 + `node:test`.
  If you have evidence a higher floor is required (e.g. an API used that needs
  Node 20+), set it accordingly and note why in the commit message; otherwise
  use `>=18`.
- Do not invent a different repo slug. If the repository is not actually at
  `pixelbrew-studio/quote-locator`, see STOP conditions.

**Verify**: `node -e "const p=require('./package.json'); for (const k of ['repository','bugs','homepage','author','engines']) if(!p[k]) {console.error('missing',k); process.exit(1)}"` → exit 0

### Step 2: Confirm the manifest still parses and builds

**Verify**: `node -e "require('./package.json')" && npm run build` → exit 0

## Test plan

No unit tests — manifest-only change. Do not add a test.

## Done criteria

ALL must hold:

- [ ] `package.json` contains `repository`, `bugs`, `homepage`, `author`, and `engines.node`
- [ ] `node -e "require('./package.json')"` exits 0 (valid JSON)
- [ ] `npm run build` exits 0
- [ ] No files outside `package.json` are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `package.json` no longer matches the "Current state" excerpt (drift).
- You cannot confirm the GitHub repository slug. The README points at the
  `pixelbrew-studio` org but does not name this repo's exact path. If the repo
  has a git remote, use `git remote get-url origin` to confirm the slug; if that
  disagrees with `pixelbrew-studio/quote-locator`, STOP and report the real
  remote rather than guessing.

## Maintenance notes

- Keep `engines.node` in sync with the Node version CI actually exercises
  (`.github/workflows/ci.yml`). If CI drops below the declared floor, that is a
  release blocker.
- A reviewer should sanity-check the repository URL resolves before the next publish.
