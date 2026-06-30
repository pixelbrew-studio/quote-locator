# Plan 004: Fix wrong exact-match span when lowercasing changes string length

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

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 003 (uses the test file conventions established there; not strictly required, but land 003 first if both are open)
- **Category**: bug
- **Planned at**: commit `143e9ae`, 2026-06-30

## Why this matters

`locateQuote` returns the wrong source span — wrong `start`, `end`, and
`matchedText` — when `caseSensitive` is false (the default) and a character
whose `String.prototype.toLowerCase()` changes the string's length appears in
the source before the matched text. The canonical trigger is `İ` (U+0130,
Latin capital I with dot above), which lowercases to two code units (`i` +
combining dot). The exact-match path computes the index in the *lowercased*
string but slices the *original* string with it, so every index is shifted by
the length delta.

Demonstrated against current code:

```
source: "İ said: careful sentence"   quote: "careful sentence"
returned matchedText: "areful sentence"   ← should be "careful sentence"
```

For a library whose whole purpose is anchoring evidence to exact source spans,
silently returning an off-by-N span is a real correctness defect, not cosmetic.

## Current state

`src/index.ts` — the exact-match branch (`src/index.ts:35-42`):

```ts
const caseSensitive = options.caseSensitive ?? false;
const exactSource = caseSensitive ? sourceText : sourceText.toLowerCase();
const exactQuote = caseSensitive ? quote : quote.toLowerCase();
const exactIndex = exactSource.indexOf(exactQuote);

if (exactIndex >= 0) {
  return makeMatch(sourceText, exactIndex, exactIndex + quote.length, 1, "exact");
}
```

The bug: when `!caseSensitive`, `exactSource.length` may differ from
`sourceText.length` (and `exactQuote.length` from `quote.length`). `exactIndex`
and `quote.length` are then in lowercased-space, but `makeMatch` slices the
original `sourceText` with them (`src/index.ts:78-93`).

Crucially, the code already has a fully index-safe fallback: the **normalized**
path (`src/index.ts:44-53`, using `normalizeWithMap`) lowercases per character
and keeps a `map: number[]` of normalized-index → original-index, so its spans
are correct even when lowercasing changes length. For the example above, the
normalized path returns the correct span with `method: "normalized"`. The fix is
to *not trust the fast exact path when it is unsafe* and let the normalized path
handle it.

`makeMatch` / `noMatch` / `normalizedMatch` signatures are unchanged by this
plan (`src/index.ts:67-107`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build | `npm run build` | exit 0 (tsc strict) |
| Build + test | `npm test` | exit 0, all tests pass |

## Scope

**In scope** (the only files you should modify):
- `src/index.ts` — the exact-match branch AND `normalizeWithMap` (see Step 2b — added by amendment after the original plan's assumption proved wrong)
- `test/quote-locator.test.mjs` — add one regression test

**Out of scope** (do NOT touch):
- The `bestFuzzyWindow`, `similarity`, `levenshtein`, `normalizedMatch`,
  `roundScore` functions — no changes there.
- The public types and `QuoteLocation` shape — unchanged.
- `src/cli.ts`, `package.json`, CI.

> **Amendment (2026-06-30)**: the original plan assumed the normalized fallback
> already produced a correct span for length-changing-lowercase input. It does
> not — `normalizeWithMap` has the *same* class of bug. Verified: with the
> Step 2 guard applied, `locateQuote("İ said: careful sentence","careful sentence")`
> returns `{start:9, matchedText:"areful sentence", method:"normalized"}` —
> still off by one. Root cause: `"İ".toLowerCase()` yields two UTF-16 code units
> (`i` + combining dot), but `normalizeWithMap` pushes only one `map` entry per
> source char, so `text` and `map` desync after any expanding char. Step 2b
> fixes it. Both Step 2 (guard) and Step 2b (map) are required: the guard routes
> away from the broken exact path, the map fix makes the normalized fallback
> land the span correctly.

## Git workflow

- Branch: `advisor/004-fix-exact-match-span-unicode`
- Two commits is fine (test, then fix) or one combined. Plain imperative
  messages, no prefix/emoji, e.g. `Fix exact-match span when lowercasing changes length`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the failing regression test

In `test/quote-locator.test.mjs` (same conventions as the existing tests:
`node:test`, `node:assert/strict`, import from `../dist/index.js`), add:

```ts
test("returns correct span when lowercasing changes length before the match", () => {
  const result = locateQuote("İ said: careful sentence", "careful sentence");
  assert.equal(result.found, true);
  assert.equal(result.matchedText, "careful sentence");
  // start/end must index the ORIGINAL string, not the lowercased one
  assert.equal(result.start, "İ said: ".length);
  assert.equal(result.end, "İ said: careful sentence".length);
});
```

(`İ` is `İ`. Do NOT assert `method` here — after the fix this resolves via
the normalized path, and asserting `"exact"` would wrongly fail. Asserting the
span is the point.)

**Verify (expect RED)**: `npm test` → this new test FAILS, reporting
`matchedText` of `"areful sentence"` (or a shifted span). If it already passes,
STOP — the bug may have been fixed already; report that.

### Step 2: Guard the exact-match fast path against length-changing lowercasing

Edit the exact-match branch in `src/index.ts` so it only takes the fast path
when lowercasing did not change lengths. When it did, fall through to the
normalized path (which produces a correct span). Target shape:

```ts
const caseSensitive = options.caseSensitive ?? false;
const exactSource = caseSensitive ? sourceText : sourceText.toLowerCase();
const exactQuote = caseSensitive ? quote : quote.toLowerCase();

const lengthsPreserved =
  exactSource.length === sourceText.length && exactQuote.length === quote.length;

if (lengthsPreserved) {
  const exactIndex = exactSource.indexOf(exactQuote);
  if (exactIndex >= 0) {
    return makeMatch(sourceText, exactIndex, exactIndex + quote.length, 1, "exact");
  }
}
```

Rationale: when `caseSensitive` is true, `exactSource === sourceText` and
`exactQuote === quote`, so `lengthsPreserved` is trivially true and behavior is
unchanged. When `caseSensitive` is false and lowercasing preserved length (the
overwhelmingly common ASCII case), behavior is unchanged. Only the rare
length-changing case now skips the unsafe fast path and is handled correctly by
the normalized branch below it.

**Verify**: `npm run build` → exit 0 (no TypeScript errors).

### Step 2b: Fix the `map` desync in `normalizeWithMap` (added by amendment)

`normalizeWithMap` (`src/index.ts:114-138`) builds the normalized `text` and a
parallel `map[normalizedIndex] = sourceIndex`. The alnum branch does:

```ts
      pendingSpace = null;
      text += normalized;        // may append >1 code unit (e.g. "İ" → "i̇")
      map.push(index);           // BUG: always pushes exactly one entry
```

When `normalized` is more than one UTF-16 code unit, `text` grows by N but `map`
grows by 1, so every later entry is shifted. Fix: push one `map` entry per
appended code unit, all pointing at the same source `index`:

```ts
      pendingSpace = null;
      text += normalized;
      for (let unit = 0; unit < normalized.length; unit += 1) {
        map.push(index);
      }
```

Do not change anything else in the function (the punctuation/space handling and
the `text.trim()` at the end stay as-is). This keeps `text.length === map.length`
for all inputs, so `normalizedMatch` translates indices correctly.

**Verify**: `npm run build` → exit 0.

### Step 3: Confirm green and no regressions

**Verify**: `npm test` → exit 0, ALL tests pass, including the Step 1
regression test and every pre-existing test (the original `finds exact quotes`
test must still report `method: "exact"`).

## Test plan

- One new regression test in `test/quote-locator.test.mjs` (Step 1), asserting
  the correct original-string span for a source containing `İ` before the match.
- The existing `finds exact quotes` test guards that ordinary ASCII exact
  matches still report `method: "exact"` — do not remove or weaken it.
- Verification: `npm test` → all pass.

## Done criteria

ALL must hold:

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0; the new "lowercasing changes length" test passes
- [ ] The original `finds exact quotes` test still passes with `method: "exact"`
- [ ] Only `src/index.ts` (exact branch) and `test/quote-locator.test.mjs` changed (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `src/index.ts` does not match the "Current state" excerpt (drift).
- The Step 1 test passes before any source change (already fixed) — report it.
- After the Step 2 change the new test still fails — this would mean the
  normalized path does not catch this input as expected. Do NOT start rewriting
  the normalized matcher; report the observed `result` object so the approach
  can be reconsidered.
- Any previously-passing test now fails.

## Maintenance notes

- This fix changes the reported `method` from `"exact"` to `"normalized"` for
  the narrow class of inputs where lowercasing changes length. That is
  acceptable (score stays `1`, span is now correct). If a future requirement
  needs `method: "exact"` preserved for these inputs, the exact path would need
  its own index map (mirroring `normalizeWithMap`) — out of scope here.
- Other length-changing lowercase characters exist (e.g. some ligatures); the
  guard is general (it checks lengths, not specific characters), so no
  per-character list needs maintaining.
- A reviewer should confirm the common ASCII and `caseSensitive: true` paths are
  untouched in behavior (still `method: "exact"`).
