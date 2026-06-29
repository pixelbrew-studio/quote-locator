export type QuoteMatchMethod = "exact" | "normalized" | "fuzzy" | "none";

export type QuoteLocation = {
  found: boolean;
  score: number;
  start: number | null;
  end: number | null;
  matchedText: string | null;
  method: QuoteMatchMethod;
};

export type LocateQuoteOptions = {
  minScore?: number;
  caseSensitive?: boolean;
  maxWindowExpansion?: number;
};

type NormalizedText = {
  text: string;
  map: number[];
};

const DEFAULT_MIN_SCORE = 0.72;
const DEFAULT_MAX_WINDOW_EXPANSION = 0.35;

export function locateQuote(
  sourceText: string,
  quote: string,
  options: LocateQuoteOptions = {},
): QuoteLocation {
  if (sourceText.length === 0 || quote.trim().length === 0) {
    return noMatch();
  }

  const caseSensitive = options.caseSensitive ?? false;
  const exactSource = caseSensitive ? sourceText : sourceText.toLowerCase();
  const exactQuote = caseSensitive ? quote : quote.toLowerCase();
  const exactIndex = exactSource.indexOf(exactQuote);

  if (exactIndex >= 0) {
    return makeMatch(sourceText, exactIndex, exactIndex + quote.length, 1, "exact");
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
  );

  return fuzzy ?? noMatch();
}

function noMatch(): QuoteLocation {
  return {
    found: false,
    score: 0,
    start: null,
    end: null,
    matchedText: null,
    method: "none",
  };
}

function makeMatch(
  sourceText: string,
  start: number,
  end: number,
  score: number,
  method: QuoteMatchMethod,
): QuoteLocation {
  return {
    found: true,
    score,
    start,
    end,
    matchedText: sourceText.slice(start, end),
    method,
  };
}

function normalizedMatch(
  sourceText: string,
  normalizedSource: NormalizedText,
  normalizedStart: number,
  normalizedLength: number,
  score: number,
  method: QuoteMatchMethod,
): QuoteLocation {
  const start = normalizedSource.map[normalizedStart] ?? 0;
  const lastMapIndex = Math.min(normalizedStart + normalizedLength - 1, normalizedSource.map.length - 1);
  const end = (normalizedSource.map[lastMapIndex] ?? start) + 1;
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
      map.push(index);
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

