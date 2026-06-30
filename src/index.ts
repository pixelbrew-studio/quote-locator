export type QuoteMatchMethod = "exact" | "normalized" | "fuzzy" | "none";

export type QuotePosition = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type QuoteLocation = {
  found: boolean;
  score: number;
  start: number | null;
  end: number | null;
  matchedText: string | null;
  method: QuoteMatchMethod;
  position: QuotePosition | null;
};

export type LocateQuoteOptions = {
  minScore?: number;
  caseSensitive?: boolean;
  maxWindowExpansion?: number;
  maxFuzzySourceLength?: number;
};

export type LocateAllQuotesOptions = LocateQuoteOptions & {
  limit?: number;
};

type NormalizedText = {
  text: string;
  map: number[];
};

const DEFAULT_MIN_SCORE = 0.72;
const DEFAULT_MAX_WINDOW_EXPANSION = 0.35;
const DEFAULT_MAX_FUZZY_SOURCE_LENGTH = 100_000;

export function locateQuote(
  sourceText: string,
  quote: string,
  options: LocateQuoteOptions = {},
): QuoteLocation {
  if (sourceText.length === 0 || quote.trim().length === 0) {
    return noMatch();
  }

  const caseSensitive = options.caseSensitive ?? false;
  const exact = firstExactMatch(sourceText, quote, caseSensitive);

  if (exact) {
    return exact;
  }

  const normalizedSource = normalizeWithMap(sourceText);
  const normalizedQuote = normalizeWithMap(quote).text;

  if (normalizedQuote.length === 0) {
    return noMatch();
  }

  const normalizedIndex = normalizedSource.text.indexOf(normalizedQuote);
  if (normalizedIndex >= 0) {
    return normalizedMatch(sourceText, normalizedSource, normalizedIndex, normalizedQuote.length, 1, "normalized");
  }

  const fuzzy = bestFuzzyWindow(
    sourceText,
    normalizedSource,
    normalizedQuote,
    options.minScore ?? DEFAULT_MIN_SCORE,
    options.maxWindowExpansion ?? DEFAULT_MAX_WINDOW_EXPANSION,
    options.maxFuzzySourceLength ?? DEFAULT_MAX_FUZZY_SOURCE_LENGTH,
  );

  return fuzzy ?? noMatch();
}

export function locateAllQuotes(
  sourceText: string,
  quote: string,
  options: LocateAllQuotesOptions = {},
): QuoteLocation[] {
  if (sourceText.length === 0 || quote.trim().length === 0) {
    return [];
  }

  const caseSensitive = options.caseSensitive ?? false;
  const candidates: QuoteLocation[] = [];

  candidates.push(...allExactMatches(sourceText, quote, caseSensitive));

  const normalizedSource = normalizeWithMap(sourceText);
  const normalizedQuote = normalizeWithMap(quote).text;

  if (normalizedQuote.length === 0) {
    return [];
  }

  for (
    let from = normalizedSource.text.indexOf(normalizedQuote);
    from >= 0;
    from = normalizedSource.text.indexOf(normalizedQuote, from + 1)
  ) {
    candidates.push(
      normalizedMatch(sourceText, normalizedSource, from, normalizedQuote.length, 1, "normalized"),
    );
  }

  for (const fuzzy of allFuzzyWindows(
    sourceText,
    normalizedSource,
    normalizedQuote,
    options.minScore ?? DEFAULT_MIN_SCORE,
    options.maxWindowExpansion ?? DEFAULT_MAX_WINDOW_EXPANSION,
    options.maxFuzzySourceLength ?? DEFAULT_MAX_FUZZY_SOURCE_LENGTH,
  )) {
    candidates.push(fuzzy);
  }

  return dedupeAndOrder(candidates, options.limit);
}

function dedupeAndOrder(candidates: QuoteLocation[], limit?: number): QuoteLocation[] {
  candidates.sort((a, b) => b.score - a.score || a.start! - b.start!);

  const kept: QuoteLocation[] = [];
  for (const candidate of candidates) {
    if (limit !== undefined && kept.length >= limit) break;
    const overlaps = kept.some(
      (other) => candidate.start! < other.end! && other.start! < candidate.end!,
    );
    if (!overlaps) {
      kept.push(candidate);
    }
  }

  return kept;
}

function firstExactMatch(
  sourceText: string,
  quote: string,
  caseSensitive: boolean,
): QuoteLocation | null {
  if (caseSensitive) {
    const exactIndex = sourceText.indexOf(quote);
    return exactIndex >= 0 ? makeMatch(sourceText, exactIndex, exactIndex + quote.length, 1, "exact") : null;
  }

  const foldedSource = caseFoldWithMap(sourceText);
  const foldedQuote = quote.toLowerCase();
  const foldedIndex = foldedSource.text.indexOf(foldedQuote);

  return foldedIndex >= 0
    ? mappedMatch(sourceText, foldedSource, foldedIndex, foldedQuote.length, 1, "exact")
    : null;
}

function allExactMatches(
  sourceText: string,
  quote: string,
  caseSensitive: boolean,
): QuoteLocation[] {
  if (caseSensitive) {
    const matches: QuoteLocation[] = [];
    for (let from = sourceText.indexOf(quote); from >= 0; from = sourceText.indexOf(quote, from + 1)) {
      matches.push(makeMatch(sourceText, from, from + quote.length, 1, "exact"));
    }
    return matches;
  }

  const foldedSource = caseFoldWithMap(sourceText);
  const foldedQuote = quote.toLowerCase();
  const matches: QuoteLocation[] = [];

  for (
    let from = foldedSource.text.indexOf(foldedQuote);
    from >= 0;
    from = foldedSource.text.indexOf(foldedQuote, from + 1)
  ) {
    matches.push(mappedMatch(sourceText, foldedSource, from, foldedQuote.length, 1, "exact"));
  }

  return matches;
}

function caseFoldWithMap(input: string): NormalizedText {
  let text = "";
  const map: number[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const folded = input[index]!.toLowerCase();
    text += folded;
    for (let unit = 0; unit < folded.length; unit += 1) {
      map.push(index);
    }
  }

  return { text, map };
}

function noMatch(): QuoteLocation {
  return {
    found: false,
    score: 0,
    start: null,
    end: null,
    matchedText: null,
    method: "none",
    position: null,
  };
}

function makeMatch(
  sourceText: string,
  start: number,
  end: number,
  score: number,
  method: QuoteMatchMethod,
): QuoteLocation {
  const startPosition = toLineColumn(sourceText, start);
  const endPosition = toLineColumn(sourceText, end);
  return {
    found: true,
    score,
    start,
    end,
    matchedText: sourceText.slice(start, end),
    method,
    position: {
      startLine: startPosition.line,
      startColumn: startPosition.column,
      endLine: endPosition.line,
      endColumn: endPosition.column,
    },
  };
}

function toLineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

function normalizedMatch(
  sourceText: string,
  normalizedSource: NormalizedText,
  normalizedStart: number,
  normalizedLength: number,
  score: number,
  method: QuoteMatchMethod,
): QuoteLocation {
  return mappedMatch(sourceText, normalizedSource, normalizedStart, normalizedLength, score, method);
}

function mappedMatch(
  sourceText: string,
  mappedText: NormalizedText,
  mappedStart: number,
  mappedLength: number,
  score: number,
  method: QuoteMatchMethod,
): QuoteLocation {
  const start = mappedText.map[mappedStart] ?? 0;
  const lastMapIndex = Math.min(mappedStart + mappedLength - 1, mappedText.map.length - 1);
  const end = (mappedText.map[lastMapIndex] ?? start) + 1;
  return makeMatch(sourceText, start, end, score, method);
}

function normalizeWithMap(input: string): NormalizedText {
  let text = "";
  const map: number[] = [];
  let pendingSpace: number | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    const normalized = char.toLowerCase();

    if (/[\p{L}\p{N}]/u.test(normalized)) {
      if (pendingSpace !== null && text.length > 0) {
        text += " ";
        map.push(pendingSpace);
      }
      pendingSpace = null;
      text += normalized;
      for (let unit = 0; unit < normalized.length; unit += 1) {
        map.push(index);
      }
      continue;
    }

    if (text.length > 0) {
      pendingSpace = pendingSpace ?? index;
    }
  }

  return { text: text.trim(), map };
}

function bestFuzzyWindow(
  sourceText: string,
  normalizedSource: NormalizedText,
  normalizedQuote: string,
  minScore: number,
  maxWindowExpansion: number,
  maxFuzzySourceLength: number,
): QuoteLocation | null {
  if (normalizedSource.text.length > maxFuzzySourceLength) {
    return null;
  }

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

function allFuzzyWindows(
  sourceText: string,
  normalizedSource: NormalizedText,
  normalizedQuote: string,
  minScore: number,
  maxWindowExpansion: number,
  maxFuzzySourceLength: number,
): QuoteLocation[] {
  if (normalizedSource.text.length > maxFuzzySourceLength) {
    return [];
  }

  const quoteLength = normalizedQuote.length;
  const minLength = Math.max(1, Math.floor(quoteLength * (1 - maxWindowExpansion)));
  const maxLength = Math.max(minLength, Math.ceil(quoteLength * (1 + maxWindowExpansion)));
  const step = Math.max(1, Math.floor(quoteLength / 8));

  const windows: QuoteLocation[] = [];

  for (let start = 0; start < normalizedSource.text.length; start += step) {
    for (let length = minLength; length <= maxLength; length += step) {
      const window = normalizedSource.text.slice(start, start + length);
      if (window.length < minLength) continue;

      const score = similarity(normalizedQuote, window);
      if (score < minScore) continue;

      windows.push(
        normalizedMatch(sourceText, normalizedSource, start, window.length, roundScore(score), "fuzzy"),
      );
    }
  }

  return windows;
}

function similarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(a, b) / maxLength;
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + substitution,
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length]!;
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}
