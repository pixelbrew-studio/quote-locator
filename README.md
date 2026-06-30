# quote-locator

Find a claimed quote inside source text.

[Built by Pixelbrew Studio](https://pixelbrew.studio/work/quote-locator) as part of its public workbench for evidence-backed AI interfaces.

`quote-locator` tries the boring path first: exact match. If that fails, it tries normalized matching for casing, whitespace, and punctuation differences. If that still fails, it uses a small fuzzy window search and returns the best source span above a configurable score.

Useful for evidence-backed AI interfaces, research notes, document review tools, and anywhere a system should show where a claim came from.

## Install

```bash
npm install quote-locator
```

## Use

```ts
import { locateQuote } from "quote-locator";

const result = locateQuote(
  "The committee approved the budget after a short review.",
  "committee approved the budget"
);

console.log(result);
// {
//   found: true,
//   score: 1,
//   start: 4,
//   end: 33,
//   matchedText: "committee approved the budget",
//   method: "exact"
// }
```

## CLI

```bash
quote-locator source.txt quote.txt
```

The CLI prints JSON and exits with code `0` when a quote is found, `1` when no acceptable match is found, and `2` for usage or file errors.

## API

```ts
locateQuote(sourceText, quote, options?)
```

Options:

| Option | Default | Meaning |
|---|---:|---|
| `minScore` | `0.72` | Minimum fuzzy score accepted as a match. |
| `caseSensitive` | `false` | Keep case during exact matching. |
| `maxWindowExpansion` | `0.35` | Fuzzy windows may be this much shorter/longer than the quote. |
| `maxFuzzySourceLength` | `100000` | Skip fuzzy matching when the normalized source is longer than this many characters. |

Return shape:

```ts
type QuoteLocation = {
  found: boolean;
  score: number;
  start: number | null;
  end: number | null;
  matchedText: string | null;
  method: "exact" | "normalized" | "fuzzy" | "none";
  position: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  } | null;
};
```

`position` reports 1-based line and column for the match (`null` when not found). `start`/`end` are character offsets into `sourceText` and are unchanged. Like `end`, `endColumn` is exclusive: it points just after the last matched character. Newlines are counted by `\n`; in a `\r\n` sequence only the `\n` advances the line, so the `\r` stays on the previous line.

### `locateAllQuotes`

```ts
locateAllQuotes(sourceText, quote, options?): QuoteLocation[]
```

Returns every span at or above `minScore` instead of just the best one. Useful for highlight-all and multi-citation flows where a quote can appear more than once.

Accepts the same options as `locateQuote`, plus an optional `limit` (maximum number of results; default unlimited).

Results are ordered by `score` descending, then `start` ascending, and never overlap in source character range. When two candidate spans overlap, the higher-scoring one is kept. Empty source, blank quote, or no match returns `[]`.

## Notes

This package does not prove that a quote supports a claim. It only locates text spans. Judgment still belongs in your application.

## Related Work

- [Pixelbrew Studio](https://pixelbrew.studio) - independent AI-native product lab for small tools and public experiments.
- [pb-suite](https://github.com/pixelbrew-studio/pb-suite) - local command suite for AI-assisted product engineering, reviews, QA, and release discipline.
- [eval-metrics-ts](https://github.com/pixelbrew-studio/eval-metrics-ts) - dependency-light metrics for classification and ranking evaluations.
