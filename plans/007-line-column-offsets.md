# Plan 007: Add optional line/column positions to `QuoteLocation` (direction)

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
- **Effort**: S–M
- **Risk**: MED (touches the public `QuoteLocation` shape — see Step 0)
- **Depends on**: 003 (test conventions); land 004/005/006 first if open (all touch `src/index.ts`)
- **Category**: direction
- **Planned at**: commit `143e9ae`, 2026-06-30

## Why this matters

`locateQuote` returns character offsets (`start`/`end`) into the source string.
Evidence and document-review UIs — the stated use case (`README.md:9`) — usually
anchor on **line and column**, not raw character indices: "found on line 42".
Converting offsets to line/column is mechanical (count newlines up to the
offset), and the library already has the offsets in hand, so exposing line/column
saves every caller from re-deriving it. The risk is purely API-surface: this
changes the published return type, so the *shape* decision in Step 0 matters more
than the code.

## Current state

- Return type (`src/index.ts:3-10`):

```ts
type QuoteLocation = {
  found: boolean; score: number;
  start: number | null; end: number | null;
  matchedText: string | null;
  method: "exact" | "normalized" | "fuzzy" | "none";
};
```

- All matches are built by `makeMatch` (`src/index.ts:78-93`), which already has
  `sourceText`, `start`, and `end` — the natural place to compute line/column.
  `noMatch` (`src/index.ts:67-76`) is the no-match shape.
- `normalizedMatch` (`src/index.ts:95-107`) calls `makeMatch`, so anything added
  there flows through all match methods automatically.
- README documents the return shape at `README.md:60-71` and would need updating.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` | exit 0 |
| Build | `npm run build` | exit 0 (tsc strict, declarations emitted) |
| Build + test | `npm test` | exit 0, all tests pass |

## Scope

**In scope**:
- `src/index.ts` — extend the return type and `makeMatch`/`noMatch`
- `test/quote-locator.test.mjs` — tests for line/column
- `README.md` — update the return-shape doc

**Out of scope** (do NOT touch):
- `src/cli.ts` — it prints whatever `locateQuote` returns; the new fields appear
  automatically with no code change. Do not reformat its output.
- The matching algorithm — this plan only annotates results with positions.

## Git workflow

- Branch: `advisor/007-line-column-offsets`
- One commit, plain imperative message, no prefix/emoji, e.g.
  `Add line and column to QuoteLocation`.
- Do NOT push or open a PR unless instructed.

## Step 0: Resolve the shape (decision gate)

The library is `0.1.0` (pre-1.0), so an additive field is acceptable without a
major bump. Use these decisions unless the operator overrides them:

- **Additive, nested, nullable**: add one optional field
  `position: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null`.
  On a match it is populated; on `noMatch` it is `null`. This keeps `start`/`end`
  unchanged so existing callers break nothing.
- **1-based lines, 1-based columns** (the editor convention "line 42, column 7").
  State this explicitly in the README and a test.
- **`end` position is the offset *after* the last matched character** (consistent
  with `end` being exclusive in the existing offsets — `matchedText` is
  `slice(start, end)`).
- **Newlines**: count `\n`. Treat `\r\n` by counting the `\n` only (a `\r`
  stays on its line). Document this.

If the operator wants flat fields (`startLine`, `startColumn`, ...) instead of a
nested `position`, or 0-based indexing, STOP and confirm before coding.

## Steps

### Step 1: Extend the type and add a converter

In `src/index.ts`:

1. Add the `position` field to `QuoteLocation` (and export any new type used).
2. Add a private `toLineColumn(text: string, offset: number): { line: number; column: number }`
   that counts `\n` before `offset` (1-based line and column). Keep it small and
   pure; no regex needed beyond scanning.
3. In `makeMatch`, compute `position` from `start` and `end` and include it.
4. In `noMatch`, set `position: null`.

**Verify**: `npm run build` → exit 0; `grep -n "position" dist/index.d.ts` → non-empty.

### Step 2: Update the README return-shape doc

Update the `QuoteLocation` type block and the surrounding prose in `README.md`
(`README.md:60-71`) to include `position`, stating: 1-based line and column,
`end` is exclusive, `null` when not found. Keep it terse, no emoji.

**Verify**: `grep -n "position" README.md` → non-empty.

## Test plan

Add to `test/quote-locator.test.mjs`:

- **Single-line match**: a source with no newlines → `position.startLine === 1`,
  `position.startColumn === start + 1`.
- **Multi-line match**: a source like `"line one\nline two\nfind me here"` where
  the quote is on line 3 → assert `position.startLine === 3` and the column is
  1-based from the start of that line.
- **No match → `position` is `null`** (alongside the existing `noMatch` assertions).
- Existing tests must still pass; if any asserts the full object equality of a
  result, update it to include `position` deliberately (note it in the commit).

**Verify**: `npm test` → exit 0, all pass.

## Done criteria

ALL must hold:

- [ ] `npm run build` exits 0; `dist/index.d.ts` includes `position`
- [ ] `npm test` exits 0; line/column tests pass (single-line, multi-line, no-match null)
- [ ] `start`/`end`/`matchedText`/`method`/`score`/`found` semantics are unchanged (existing tests pass without weakening)
- [ ] `README.md` documents `position` (1-based, end-exclusive, null when not found)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `src/index.ts` does not match the "Current state" excerpt (drift).
- Step 0's shape conflicts with operator intent (flat vs nested, 0- vs 1-based)
  and you cannot confirm.
- Existing tests assert exact full-object equality and updating them would change
  asserted `start`/`end` values — that would mean the offsets shifted, which they
  must not; investigate before changing test expectations.

## Maintenance notes

- `toLineColumn` is O(offset); for very large sources with many matches this is
  re-scanned per match. Fine for single-match `locateQuote`; if 006
  (`locateAllQuotes`) lands and returns many results, consider precomputing a
  newline-offset index once. Explicitly deferred here.
- This is a public-API addition. Before a 1.0, decide whether `position` should
  be opt-in (via an option) to keep payloads minimal for callers who only want
  offsets — noted as an open question, not decided here.
- Reviewer should confirm the column for an offset at the very start of a line is
  `1`, not `0`, and that `\r\n` is handled as documented.
