# Plan 005: Add a source-size guard so fuzzy search can't hang on huge inputs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 143e9ae..HEAD -- src/index.ts`
> If `src/index.ts` changed since this plan was written, compare the "Current
> state" excerpt against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: 003 (test conventions), 004 (avoid editing the same exact-match region twice — land 004 first)
- **Category**: perf
- **Planned at**: commit `143e9ae`, 2026-06-30

## Why this matters

The fuzzy fallback is the expensive path: for each window start (strided across
the whole normalized source) it scores several window lengths, and each score is
an O(quoteLen × windowLen) Levenshtein computation that allocates two arrays per
call (`src/index.ts:137-189`). Total work scales roughly with
`sourceLength × quoteLength`. The README pitches "document review tools"
(`README.md:9`), and the CLI reads an entire file with no size limit
(`src/cli.ts:13`). On a multi-megabyte source that misses both the exact and
normalized paths, `locateQuote` can run for a very long time with no signal —
an effective hang for the caller.

This is a *known ceiling*, not a hot bug: today's coarse `step` sampling keeps
typical inputs tolerable, and most real calls hit the exact or normalized path
and never reach fuzzy. The goal here is a cheap, predictable guard, not an
algorithm rewrite. **Do not** replace Levenshtein or rebuild the search.

## Current state

- Fuzzy entry and loop (`src/index.ts:137-164`):

```ts
function bestFuzzyWindow(
  sourceText: string, normalizedSource: NormalizedText, normalizedQuote: string,
  minScore: number, maxWindowExpansion: number,
): QuoteLocation | null {
  const quoteLength = normalizedQuote.length;
  const minLength = Math.max(1, Math.floor(quoteLength * (1 - maxWindowExpansion)));
  const maxLength = Math.max(minLength, Math.ceil(quoteLength * (1 + maxWindowExpansion)));
  const step = Math.max(1, Math.floor(quoteLength / 8));
  let best: QuoteLocation | null = null;
  for (let start = 0; start < normalizedSource.text.length; start += step) {
    for (let length = minLength; length <= maxLength; length += step) {
      const window = normalizedSource.text.slice(start, start + length);
      if (window.length < minLength) continue;
      const score = similarity(normalizedQuote, window);
      if (score < minScore || score <= (best?.score ?? 0)) continue;
      best = normalizedMatch(sourceText, normalizedSource, start, window.length, roundScore(score), "fuzzy");
    }
  }
  return best;
}
```

- `bestFuzzyWindow` is called once, from `locateQuote` (`src/index.ts:56-64`),
  only after exact and normalized both miss.
- `LocateQuoteOptions` (`src/index.ts:12-16`):

```ts
type LocateQuoteOptions = {
  minScore?: number;
  caseSensitive?: boolean;
  maxWindowExpansion?: number;
};
```

- Defaults are declared as module constants near the top
  (`src/index.ts:23-24`): `DEFAULT_MIN_SCORE`, `DEFAULT_MAX_WINDOW_EXPANSION`.
  Follow that exact pattern for any new default.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build | `npm run build` | exit 0 (tsc strict) |
| Build + test | `npm test` | exit 0, all tests pass |

## Scope

**In scope** (the only files you should modify):
- `src/index.ts` — add the option, default constant, and the guard in the fuzzy path
- `test/quote-locator.test.mjs` — add tests for the guard
- `README.md` — document the new option in the options table only

**Out of scope** (do NOT touch):
- The Levenshtein implementation and the window-scoring math — do not "optimize"
  them. This plan adds a guard, nothing else.
- `src/cli.ts` — the CLI passes no options; leave it.
- The exact and normalized paths.

## Git workflow

- Branch: `advisor/005-large-source-guard`
- One commit, plain imperative message, no prefix/emoji, e.g.
  `Add maxSourceLength guard to fuzzy search`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a `maxFuzzySourceLength` option with a default

Add to `LocateQuoteOptions` (`src/index.ts:12-16`):

```ts
  maxFuzzySourceLength?: number;
```

Add a default constant next to the existing ones (`src/index.ts:23-24`), matching
their `const DEFAULT_* = value;` style:

```ts
const DEFAULT_MAX_FUZZY_SOURCE_LENGTH = 100_000;
```

(100k characters of *normalized* source. This is a deliberate, documented
ceiling: above it, the fuzzy fallback is skipped and the call returns no match
rather than spending unbounded time. Callers who genuinely need fuzzy matching
on larger documents can raise it explicitly.)

### Step 2: Skip fuzzy when the normalized source exceeds the limit

In `locateQuote`, at the call site (`src/index.ts:56-64`), pass the option
through, and in `bestFuzzyWindow` return `null` immediately when
`normalizedSource.text.length` exceeds the limit. Add the parameter to
`bestFuzzyWindow`'s signature and the early return as the first statement:

```ts
  if (normalizedSource.text.length > maxFuzzySourceLength) {
    return null;
  }
```

Wire the value from `options.maxFuzzySourceLength ?? DEFAULT_MAX_FUZZY_SOURCE_LENGTH`
at the call site, mirroring how `minScore` and `maxWindowExpansion` are already
threaded (`src/index.ts:60-61`).

**Verify**: `npm run build` → exit 0.

### Step 3: Document the option in the README table

Add a row to the options table in `README.md` (the table at `README.md:54-58`),
matching the existing column format:

```
| `maxFuzzySourceLength` | `100000` | Skip fuzzy matching when the normalized source is longer than this many characters. |
```

Do not change any other README prose.

**Verify**: `grep -n "maxFuzzySourceLength" README.md` → prints the new row.

## Test plan

Add to `test/quote-locator.test.mjs` (same conventions, import from
`../dist/index.js`):

1. **Guard skips fuzzy on an over-limit source.** Build a long source string
   (e.g. `"x ".repeat(60000)` → normalized length well over a small limit) that
   would otherwise fuzzy-match a quote, and call with
   `{ maxFuzzySourceLength: 10 }`. Assert `found: false`, `method: "none"`.
2. **Exact/normalized still work above the limit.** With the same tiny
   `maxFuzzySourceLength: 10`, an *exact* substring match must still be found
   (the guard only affects the fuzzy fallback). Assert `found: true`,
   `method: "exact"`.
3. **Default allows normal fuzzy matches.** Re-assert an existing fuzzy case
   (model after `finds near fuzzy matches`, `test/quote-locator.test.mjs:25-34`)
   with no `maxFuzzySourceLength` set → still `found: true`, `method: "fuzzy"`.

**Verify**: `npm test` → exit 0, all tests pass.

## Done criteria

ALL must hold:

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0; the three guard tests pass and all pre-existing tests still pass
- [ ] `README.md` options table documents `maxFuzzySourceLength`
- [ ] Levenshtein and window-scoring code are byte-for-byte unchanged except for the added early-return parameter wiring (`git diff src/index.ts` shows no edits inside `levenshtein`/`similarity`)
- [ ] Only `src/index.ts`, `test/quote-locator.test.mjs`, `README.md` changed (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `src/index.ts` does not match the "Current state" excerpt (drift).
- Adding the parameter forces edits inside `levenshtein` or `similarity` — it
  should not; the guard is a single early return in `bestFuzzyWindow`. If you
  find yourself changing the scoring math, stop.
- A pre-existing fuzzy test starts failing — the default (100k) must not change
  behavior for any existing test input.

## Maintenance notes

- The default 100k is a heuristic ceiling, tunable per call. If profiling later
  shows the real bottleneck is per-window allocation rather than total length, a
  follow-up could reuse the Levenshtein arrays — explicitly deferred here.
- A reviewer should confirm the guard returns `null` (→ `noMatch()` upstream)
  rather than throwing, so oversized inputs degrade to "not found", never an error.
