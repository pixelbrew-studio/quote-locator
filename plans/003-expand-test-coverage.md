# Plan 003: Expand test coverage for options, edge cases, and CLI exit codes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 143e9ae..HEAD -- src/index.ts src/cli.ts test/quote-locator.test.mjs`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `143e9ae`, 2026-06-30

## Why this matters

This library sells correct source spans for evidence/citation use, but the
suite is 5 tests (`test/quote-locator.test.mjs`) and never exercises: the
`caseSensitive` option, the `maxWindowExpansion` option, the `minScore`
boundary, empty/whitespace inputs, the normalized index-mapping boundaries
(internal punctuation in the matched span), or the CLI's non-zero exit codes.
The CLI documents exit `1` (no match) and `2` (usage/file error) in
`README.md:44` but no test pins them. Every gap here is a behavior a future
refactor could silently break. This plan adds **only tests that pass against
the current code** — it is pure characterization, no source changes. (The
Unicode exact-match span bug is fixed and regression-tested separately in
plan 004; do not add that test here, it would fail.)

## Current state

- `src/index.ts` — core. Public API `locateQuote(sourceText, quote, options?)`
  returns `QuoteLocation` (`src/index.ts:3-10`):

```ts
type QuoteLocation = {
  found: boolean; score: number;
  start: number | null; end: number | null;
  matchedText: string | null;
  method: "exact" | "normalized" | "fuzzy" | "none";
};
```

  Options and defaults (`src/index.ts:12-24`):
  - `minScore` default `0.72`
  - `caseSensitive` default `false`
  - `maxWindowExpansion` default `0.35`

  Early return on empty source / blank quote (`src/index.ts:31-33`): returns
  `noMatch()` (`found:false, score:0, start:null, end:null, matchedText:null, method:"none"`).

- `src/cli.ts` — CLI. Exit codes (`src/cli.ts:5-22`): `2` when args missing or
  on a read error (caught), `result.found ? 0 : 1` on success. Prints
  `JSON.stringify(result, null, 2)` to stdout, error message to stderr.

- `test/quote-locator.test.mjs` — existing suite, the **pattern to match**.
  It imports from the built output, not the source (`test/quote-locator.test.mjs:8`):

```ts
import { locateQuote } from "../dist/index.js";
```

  CLI is tested by spawning the built file (`test/quote-locator.test.mjs:42-56`):

```ts
const result = spawnSync("node", ["dist/cli.js", source, quote], {
  cwd: new URL("..", import.meta.url).pathname, encoding: "utf8",
});
assert.equal(result.status, 0);
```

Conventions to match exactly:
- Tests are `node:test` + `node:assert/strict`, ESM `.mjs`, importing from
  `../dist/index.js` (NOT from `src`). `npm test` builds first, so `dist/` is
  fresh.
- Use `mkdtempSync(join(tmpdir(), "quote-locator-"))` for CLI fixture files,
  exactly as the existing CLI test does.
- One `test("...", () => { ... })` per behavior, flat, no nesting.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build + test | `npm test` | exit 0, all tests pass (existing 5 + your new ones) |

There is no separate lint or typecheck script; `tsc` runs inside `npm run build`
(invoked by `npm test`). Test files are `.mjs` and are not type-checked.

## Scope

**In scope** (the only file you should modify):
- `test/quote-locator.test.mjs` (add tests to the existing file)

**Out of scope** (do NOT touch):
- `src/index.ts`, `src/cli.ts` — no source changes. If a test you write does
  not pass against current behavior, that is a STOP condition (see below), not a
  reason to edit source.
- Do not add a test framework, config, fixtures dir, or coverage tooling.

## Git workflow

- Branch: `advisor/003-expand-test-coverage`
- One commit, plain imperative message, no prefix/emoji, e.g.
  `Add tests for options, edge cases and CLI exit codes`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add option and edge-case tests to the existing file

Append these tests to `test/quote-locator.test.mjs` (keep the existing five).
Each must pass against current behavior. Verify each expectation by reading
`src/index.ts` if unsure — do not assume.

1. **`caseSensitive: true` makes a case-mismatched exact match fall through.**
   `locateQuote("The Budget passed.", "budget", { caseSensitive: true })` — the
   exact path won't match `Budget` vs `budget`; assert it still resolves via the
   normalized path (`found: true`, `method` is `"normalized"`, `matchedText` is
   `"Budget"`). Confirm against `src/index.ts:35-53` before asserting the method.

2. **`caseSensitive: false` (default) exact match is case-insensitive.**
   `locateQuote("The Budget passed.", "budget")` → `found:true`,
   `method:"exact"`, `matchedText:"Budget"`, `start:4`.

3. **`minScore` boundary rejects a weak fuzzy match.** Take an input that
   matches fuzzily at a modest score and assert that a high `minScore`
   (e.g. `0.95`) returns `found:false, method:"none"`, while a low `minScore`
   (e.g. `0.6`) returns `found:true, method:"fuzzy"`. Reuse the style of the
   existing "finds near fuzzy matches" test (`test/quote-locator.test.mjs:25-34`).

4. **`maxWindowExpansion` widens the accepted fuzzy window.** Construct a quote
   whose best source span is noticeably longer than the quote (extra words),
   such that it is found with a generous `maxWindowExpansion` (e.g. `0.6`) but
   not with a tight one (e.g. `0.05`). Assert the two outcomes differ
   (`found:true` vs `found:false`). If you cannot construct a stable pair after
   two attempts, see STOP conditions.

5. **Empty source returns no match.** `locateQuote("", "anything")` →
   `{found:false, score:0, start:null, end:null, matchedText:null, method:"none"}`.

6. **Blank/whitespace quote returns no match.** `locateQuote("some text", "   ")`
   → same no-match shape as above.

7. **Punctuation-only quote returns no match.** `locateQuote("a, b, c", "...")`
   → no-match shape (normalized quote is empty; `src/index.ts:47-49`).

8. **Normalized match span includes internal punctuation.** This pins the
   index-mapping: `locateQuote("Alpha, beta: gamma.", "alpha beta gamma")` →
   `method:"normalized"`, `matchedText:"Alpha, beta: gamma"`, and `start:0`.
   (Mirrors the existing normalized test but also asserts `start`.)

**Verify**: `npm test` → exit 0, all tests pass (the 5 originals + 8 new).

### Step 2: Add CLI exit-code tests

Add two CLI tests modeled on the existing CLI test
(`test/quote-locator.test.mjs:42-56`), using `mkdtempSync`/`writeFileSync`/`spawnSync`:

1. **No match → exit 1.** Write a source and a quote that do not match
   (e.g. source `"nothing relevant here"`, quote `"committee approved budget"`).
   Spawn `node dist/cli.js <source> <quote>`. Assert `result.status === 1` and
   `JSON.parse(result.stdout).found === false`.

2. **Missing file → exit 2.** Spawn `node dist/cli.js <nonexistent-path> <quote>`
   where the source path does not exist. Assert `result.status === 2` and that
   `result.stderr` is non-empty. (The CLI catches the read error and exits 2 —
   `src/cli.ts:18-22`.)

Optionally also assert **missing args → exit 2**: spawn `node dist/cli.js` with
no file arguments; assert `result.status === 2` (`src/cli.ts:7-10`).

**Verify**: `npm test` → exit 0, all tests pass.

## Test plan

- All new tests live in `test/quote-locator.test.mjs`, following the existing
  `node:test` + `node:assert/strict` pattern and importing from `../dist/index.js`.
- CLI tests follow the existing `spawnSync(... "dist/cli.js" ...)` pattern with
  `cwd: new URL("..", import.meta.url).pathname`.
- Verification: `npm test` → all pass, including the ~10 new tests.

## Done criteria

ALL must hold:

- [ ] `npm test` exits 0 with all tests passing
- [ ] `test/quote-locator.test.mjs` contains tests covering: `caseSensitive` true and false, `minScore` boundary, `maxWindowExpansion` effect, empty source, blank quote, punctuation-only quote, normalized span with internal punctuation, CLI exit 1, CLI exit 2
- [ ] No files outside `test/quote-locator.test.mjs` are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not edit source) if:

- Any in-scope file does not match the "Current state" excerpts (drift).
- A test you wrote to assert *current* behavior fails — that means the behavior
  differs from what this plan describes. Report the discrepancy; do not "fix"
  source to make your test pass.
- After two attempts you cannot construct a stable input pair for the
  `minScore` (step 1.3) or `maxWindowExpansion` (step 1.4) test — report what
  you tried and the scores you observed, rather than asserting on a flaky value.

## Maintenance notes

- These are characterization tests: they lock in *today's* behavior. If a future
  change intentionally alters a behavior (e.g. a normalized span boundary), the
  corresponding test must be updated deliberately, with the change called out in
  review — a surprised test failure here is a signal, not noise.
- Plan 004 adds the Unicode exact-match regression test; it intentionally lives
  with the fix, not here.
