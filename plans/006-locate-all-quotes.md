# Plan 006: Add `locateAllQuotes` to return every span above threshold (direction)

> **Executor instructions**: This is a feature plan with one open API decision
> (Step 0). Resolve Step 0 first — STOP and ask the operator if you cannot
> resolve it from this file. Then follow the steps, running every verification
> command. When done, update the status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 143e9ae..HEAD -- src/index.ts`
> If `src/index.ts` changed since this plan was written, compare the "Current
> state" excerpt against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: 003 (test conventions); land 004 and 005 first if open (all touch `src/index.ts`)
- **Category**: direction
- **Planned at**: commit `143e9ae`, 2026-06-30

## Why this matters

Today `locateQuote` returns only the single best match (the exact/normalized
path returns the first occurrence; the fuzzy path keeps only the highest-scoring
window — `src/index.ts:149-163`). The README's stated use cases — "document
review tools" and highlighting where a claim came from (`README.md:9`) — often
need *every* place a quote appears, not just one. A `locateAllQuotes` that
returns all non-overlapping spans at or above `minScore`, best-first, unlocks
highlight-all and multi-citation flows without callers re-implementing the
window search. This is additive: `locateQuote` stays exactly as is.

## Current state

- Public surface (`src/index.ts:1-16`): `locateQuote(sourceText, quote, options?)`
  returning a single `QuoteLocation`. Methods: `exact | normalized | fuzzy | none`.
- The fuzzy search already enumerates candidate windows and keeps the best
  (`src/index.ts:137-164`); `locateAllQuotes` generalizes "keep the best" to
  "collect all, then de-overlap".
- Exact/normalized currently short-circuit on the first occurrence
  (`src/index.ts:38-53`) — `locateAllQuotes` must instead scan for all
  occurrences (use a loop over `indexOf(..., fromIndex)`).
- Helpers available for reuse: `makeMatch`, `normalizedMatch`, `normalizeWithMap`,
  `bestFuzzyWindow`'s scoring (`similarity`/`levenshtein`), `roundScore`
  (`src/index.ts:67-194`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build | `npm run build` | exit 0 (tsc strict, declarations emitted) |
| Build + test | `npm test` | exit 0, all tests pass |

## Scope

**In scope**:
- `src/index.ts` — add the `locateAllQuotes` export and any private helpers it needs
- `test/quote-locator.test.mjs` — tests for the new function
- `README.md` — document the new function under the API section

**Out of scope** (do NOT touch):
- `locateQuote` behavior and its return shape — must be byte-for-byte unchanged.
- `src/cli.ts` — no CLI surface for this in this plan (deferred).
- The Levenshtein/scoring math.

## Git workflow

- Branch: `advisor/006-locate-all-quotes`
- One commit, plain imperative message, no prefix/emoji, e.g.
  `Add locateAllQuotes for multiple matches`.
- Do NOT push or open a PR unless instructed.

## Step 0: Resolve the API shape (decision gate)

Use these decisions unless the operator overrides them. They are chosen to match
the existing style and keep scope small:

- **Signature**: `locateAllQuotes(sourceText, quote, options?): QuoteLocation[]`.
  Same options as `locateQuote`, plus an optional `limit?: number` (max results;
  default unlimited). Reuse `LocateQuoteOptions` extended with `limit?`.
- **Ordering**: results sorted by `score` descending, then `start` ascending.
- **Overlap**: results must not overlap in source character ranges. When two
  candidate spans overlap, keep the higher-scoring one (greedy, best-first).
- **Methods**: a single call may return a mix — exact/normalized occurrences
  (score 1) plus fuzzy ones below them. Collect exact+normalized occurrences
  first, then fuzzy windows that don't overlap an already-kept span.
- **Empty/blank inputs**: return `[]` (mirrors `locateQuote`'s `noMatch`
  guard at `src/index.ts:31-33`).

If any of these conflicts with operator intent, STOP and confirm before coding.

## Steps

### Step 1: Implement `locateAllQuotes`

Add an exported `locateAllQuotes` to `src/index.ts`. Suggested internal shape:

1. Guard empty source / blank quote → return `[]`.
2. Collect all exact (and, separately, normalized) occurrences by looping
   `indexOf(needle, fromIndex)` and advancing `fromIndex` past each hit; map each
   to a `QuoteLocation` via `makeMatch`/`normalizedMatch` (reuse the existing
   index-mapping in `normalizedMatch` — `src/index.ts:95-107`).
3. Collect fuzzy windows ≥ `minScore` using the same window enumeration as
   `bestFuzzyWindow`, but push *all* qualifying windows instead of keeping one.
4. Merge: sort by score desc then start asc; greedily accept spans that don't
   overlap an already-accepted `[start, end)`; stop at `limit` if set.

Keep `locateQuote` untouched — do not refactor it to call the new function in
this plan (a later refactor can unify them once `locateAllQuotes` is proven).

**Verify**: `npm run build` → exit 0, and `dist/index.d.ts` declares
`locateAllQuotes` (`grep -n "locateAllQuotes" dist/index.d.ts` → non-empty).

### Step 2: Document the function in the README

Add a short subsection under `## API` in `README.md` (after the `locateQuote`
options table, around `README.md:71`) describing `locateAllQuotes`, its return
type (`QuoteLocation[]`), ordering, non-overlap guarantee, and the `limit`
option. Keep it terse, matching the existing doc tone. No emoji.

**Verify**: `grep -n "locateAllQuotes" README.md` → non-empty.

## Test plan

Add to `test/quote-locator.test.mjs`:

- **Multiple exact occurrences**: a source with the quote appearing twice →
  array length 2, both `found:true`, non-overlapping `start`/`end`, sorted as specified.
- **Mixed exact + fuzzy**: one exact occurrence and one near-miss elsewhere →
  exact first (score 1), fuzzy second (score < 1).
- **Non-overlap**: overlapping candidate windows collapse to one result.
- **`limit`**: with `{ limit: 1 }`, exactly one result (the best).
- **No matches** / empty source / blank quote → `[]`.
- **`locateQuote` unchanged**: existing tests must still pass untouched.

**Verify**: `npm test` → exit 0, all pass.

## Done criteria

ALL must hold:

- [ ] `npm run build` exits 0; `dist/index.d.ts` exports `locateAllQuotes`
- [ ] `npm test` exits 0; new `locateAllQuotes` tests pass; all `locateQuote` tests unchanged and passing
- [ ] Results are non-overlapping and ordered (score desc, start asc), verified by a test
- [ ] `README.md` documents `locateAllQuotes`
- [ ] `git diff src/index.ts` shows no behavioral change to `locateQuote`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `src/index.ts` does not match the "Current state" excerpt (drift).
- Step 0's decisions conflict with operator intent, or the operator has not
  confirmed and you are unsure about overlap/ordering semantics.
- Implementing this forces a change to `locateQuote`'s behavior or return shape.
- A fuzzy "collect all windows" pass is prohibitively slow on the test inputs —
  report it; the 005 source-size guard may need to apply here too.

## Maintenance notes

- This duplicates some window-enumeration logic from `bestFuzzyWindow`. A
  deliberate follow-up (out of scope) could express `locateQuote` as
  `locateAllQuotes(...)[0] ?? noMatch()` once semantics are settled — note the
  edge case that `locateQuote` returns a `noMatch` *object*, not `undefined`.
- If 005 (source-size guard) has landed, apply the same guard to the fuzzy
  collection here so `locateAllQuotes` can't hang on huge inputs either.
- Reviewer should scrutinize the overlap/sort logic — that is where correctness
  bugs will hide.
