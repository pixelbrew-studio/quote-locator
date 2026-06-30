import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { locateQuote, locateAllQuotes } from "../dist/index.js";

test("finds exact quotes", () => {
  const result = locateQuote("One careful sentence lives here.", "careful sentence");
  assert.equal(result.found, true);
  assert.equal(result.method, "exact");
  assert.equal(result.matchedText, "careful sentence");
  assert.equal(result.start, 4);
});

test("returns correct span when lowercasing changes length before the match", () => {
  const result = locateQuote("İ said: careful sentence", "careful sentence");
  assert.equal(result.found, true);
  assert.equal(result.method, "exact");
  assert.equal(result.matchedText, "careful sentence");
  // start/end must index the ORIGINAL string, not the lowercased one
  assert.equal(result.start, "İ said: ".length);
  assert.equal(result.end, "İ said: careful sentence".length);
});

test("keeps exact matching when lowercasing changes length after the match", () => {
  const result = locateQuote("careful sentence. İ said so.", "careful sentence");
  assert.equal(result.found, true);
  assert.equal(result.method, "exact");
  assert.equal(result.matchedText, "careful sentence");
  assert.equal(result.start, 0);
});

test("case-insensitive exact matching maps expanded lowercase spans to original offsets", () => {
  const result = locateQuote("İ said so.", "i̇ said");
  assert.equal(result.found, true);
  assert.equal(result.method, "exact");
  assert.equal(result.matchedText, "İ said");
  assert.equal(result.start, 0);
  assert.equal(result.end, "İ said".length);
});

test("finds normalized whitespace and punctuation variants", () => {
  const result = locateQuote("Alpha, beta: gamma.", "alpha beta gamma");
  assert.equal(result.found, true);
  assert.equal(result.method, "normalized");
  assert.equal(result.matchedText, "Alpha, beta: gamma");
});

test("finds near fuzzy matches", () => {
  const result = locateQuote(
    "The board approved a narrow pilot after the review.",
    "board approved the narrow pilot",
    { minScore: 0.7 },
  );
  assert.equal(result.found, true);
  assert.equal(result.method, "fuzzy");
  assert.ok(result.score >= 0.7);
});

test("returns no match below threshold", () => {
  const result = locateQuote("Nothing relevant appears here.", "committee approved budget");
  assert.equal(result.found, false);
  assert.equal(result.method, "none");
});

test("CLI returns JSON for a match", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const source = join(dir, "source.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(source, "A small useful tool.", "utf8");
  writeFileSync(quote, "useful tool", "utf8");

  const result = spawnSync("node", ["dist/cli.js", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).found, true);
});

test("caseSensitive true falls through exact to a normalized match", () => {
  const result = locateQuote("The Budget passed.", "budget", { caseSensitive: true });
  assert.equal(result.found, true);
  assert.equal(result.method, "normalized");
  assert.equal(result.matchedText, "Budget");
});

test("caseSensitive default exact match is case-insensitive", () => {
  const result = locateQuote("The Budget passed.", "budget");
  assert.equal(result.found, true);
  assert.equal(result.method, "exact");
  assert.equal(result.matchedText, "Budget");
  assert.equal(result.start, 4);
});

test("minScore boundary rejects a weak fuzzy match", () => {
  const source = "The board approved a narrow pilot after the review.";
  const quote = "board approved the narrow pilot";

  const strict = locateQuote(source, quote, { minScore: 0.95 });
  assert.equal(strict.found, false);
  assert.equal(strict.method, "none");

  const lenient = locateQuote(source, quote, { minScore: 0.6 });
  assert.equal(lenient.found, true);
  assert.equal(lenient.method, "fuzzy");
});

test("maxWindowExpansion widens the accepted fuzzy window", () => {
  const source = "The annual report shows strong revenue growth this year.";
  const quote = "annual report strong revenue growth year";

  const tight = locateQuote(source, quote, { minScore: 0.7, maxWindowExpansion: 0.05 });
  assert.equal(tight.found, false);

  const wide = locateQuote(source, quote, { minScore: 0.7, maxWindowExpansion: 0.6 });
  assert.equal(wide.found, true);
  assert.equal(wide.method, "fuzzy");
});

test("empty source returns no match", () => {
  const result = locateQuote("", "anything");
  assert.deepEqual(result, {
    found: false,
    score: 0,
    start: null,
    end: null,
    matchedText: null,
    method: "none",
    position: null,
  });
});

test("blank whitespace quote returns no match", () => {
  const result = locateQuote("some text", "   ");
  assert.deepEqual(result, {
    found: false,
    score: 0,
    start: null,
    end: null,
    matchedText: null,
    method: "none",
    position: null,
  });
});

test("punctuation-only quote returns no match", () => {
  const result = locateQuote("a, b, c", "...");
  assert.deepEqual(result, {
    found: false,
    score: 0,
    start: null,
    end: null,
    matchedText: null,
    method: "none",
    position: null,
  });
});

test("normalized match span includes internal punctuation", () => {
  const result = locateQuote("Alpha, beta: gamma.", "alpha beta gamma");
  assert.equal(result.method, "normalized");
  assert.equal(result.matchedText, "Alpha, beta: gamma");
  assert.equal(result.start, 0);
});

test("normalized match reports an accurate source span", () => {
  const source = "Alpha, beta: gamma.";
  const result = locateQuote(source, "alpha beta gamma");
  assert.equal(result.method, "normalized");
  assert.equal(typeof result.start, "number");
  assert.equal(typeof result.end, "number");
  assert.equal(source.slice(result.start, result.end), result.matchedText);
  assert.equal(result.matchedText, "Alpha, beta: gamma");
});

test("fuzzy match reports a span consistent with matchedText", () => {
  const source = "The board approved a narrow pilot after the review.";
  const result = locateQuote(source, "board approved the narrow pilot", {
    minScore: 0.7,
  });
  assert.equal(result.method, "fuzzy");
  assert.ok(result.score >= 0.7);
  assert.equal(source.slice(result.start, result.end), result.matchedText);
});

test("caseSensitive option prevents a case-insensitive exact match", () => {
  const source = "The Committee met.";
  const insensitive = locateQuote(source, "committee");
  assert.equal(insensitive.found, true);
  assert.equal(insensitive.method, "exact");

  const sensitive = locateQuote(source, "committee", { caseSensitive: true });
  assert.equal(sensitive.method === "exact", false);
});

test("offsets stay correct when lowercasing changes length (Unicode)", () => {
  const source = "İ said abc";
  const result = locateQuote(source, "abc");
  assert.equal(result.found, true);
  assert.equal(result.matchedText, "abc");
  assert.equal(source.slice(result.start, result.end), result.matchedText);
});

test("CLI exits 1 with JSON when no match is found", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const source = join(dir, "source.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(source, "Nothing relevant appears here.", "utf8");
  writeFileSync(quote, "committee approved budget", "utf8");
  const result = spawnSync("node", ["dist/cli.js", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).found, false);
});

test("CLI exits 2 when a file cannot be read", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const missing = join(dir, "does-not-exist.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(quote, "anything", "utf8");

  const result = spawnSync("node", ["dist/cli.js", missing, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.ok(result.stderr.length > 0);
});

test("maxFuzzySourceLength guard skips fuzzy on an over-limit source", () => {
  const filler = "x ".repeat(60000);
  const source = filler + "The board approved a narrow pilot after the review.";
  const quote = "board approved the narrow pilot";

  const result = locateQuote(source, quote, { minScore: 0.7, maxFuzzySourceLength: 10 });
  assert.equal(result.found, false);
  assert.equal(result.method, "none");
});

test("maxFuzzySourceLength guard still allows exact matches above the limit", () => {
  const source = "x ".repeat(60000) + "careful sentence";

  const result = locateQuote(source, "careful sentence", { maxFuzzySourceLength: 10 });
  assert.equal(result.found, true);
  assert.equal(result.method, "exact");
  assert.equal(result.matchedText, "careful sentence");
});

test("default maxFuzzySourceLength allows normal fuzzy matches", () => {
  const result = locateQuote(
    "The board approved a narrow pilot after the review.",
    "board approved the narrow pilot",
    { minScore: 0.7 },
  );
  assert.equal(result.found, true);
  assert.equal(result.method, "fuzzy");
  assert.ok(result.score >= 0.7);
});

test("CLI exits 2 on usage error (missing arguments)", () => {
  const result = spawnSync("node", ["dist/cli.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});

test("locateAllQuotes returns every exact occurrence, non-overlapping", () => {
  const source = "careful sentence and then a careful sentence again";
  const results = locateAllQuotes(source, "careful sentence");

  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.found === true));
  assert.deepEqual(
    results.map((r) => r.matchedText),
    ["careful sentence", "careful sentence"],
  );

  // non-overlapping spans
  for (let i = 1; i < results.length; i += 1) {
    assert.ok(results[i].start >= results[i - 1].end);
  }
  // first occurrence by source position
  assert.equal(results[0].start, 0);
  assert.equal(results[1].start, source.indexOf("careful sentence", 1));
});

test("locateAllQuotes orders score desc then start asc, mixing exact and fuzzy", () => {
  const source = "board approved the narrow pilot. Later the baord aproved a narow pilot.";
  const results = locateAllQuotes(source, "board approved the narrow pilot", { minScore: 0.7 });

  assert.ok(results.length >= 2);
  // first result is the exact (score 1)
  assert.equal(results[0].score, 1);
  assert.equal(results[0].method, "exact");
  // a lower-scoring fuzzy occurrence follows
  assert.equal(results[1].method, "fuzzy");
  assert.ok(results[1].score < 1);

  // ordering invariant: score desc, then start asc
  for (let i = 1; i < results.length; i += 1) {
    const prev = results[i - 1];
    const cur = results[i];
    assert.ok(
      prev.score > cur.score || (prev.score === cur.score && prev.start <= cur.start),
      `ordering violated at index ${i}`,
    );
  }

  // all kept spans are non-overlapping
  const sorted = [...results].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i].start >= sorted[i - 1].end, "spans overlap");
  }
});

test("locateAllQuotes collapses overlapping candidate windows to one result", () => {
  const source = "The board approved a narrow pilot after the review.";
  const results = locateAllQuotes(source, "board approved the narrow pilot", { minScore: 0.6 });

  assert.ok(results.length >= 1);
  // overlapping fuzzy windows must collapse: kept spans never overlap
  const sorted = [...results].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i].start >= sorted[i - 1].end, "overlapping windows were not collapsed");
  }
});

test("locateAllQuotes respects limit", () => {
  const source = "careful sentence and then a careful sentence and one more careful sentence";
  const all = locateAllQuotes(source, "careful sentence");
  assert.ok(all.length >= 2);

  const limited = locateAllQuotes(source, "careful sentence", { limit: 1 });
  assert.equal(limited.length, 1);
  // the single result is the best (highest score, earliest start)
  assert.equal(limited[0].score, all[0].score);
  assert.equal(limited[0].start, all[0].start);
});

test("position is 1-based for a single-line match", () => {
  const source = "One careful sentence lives here.";
  const result = locateQuote(source, "careful sentence");
  assert.equal(result.found, true);
  assert.equal(result.position.startLine, 1);
  // column is 1-based: start offset + 1
  assert.equal(result.position.startColumn, result.start + 1);
  assert.equal(result.position.endLine, 1);
  // end is exclusive (offset after the last matched char), so column is end + 1
  assert.equal(result.position.endColumn, result.end + 1);
});

test("position reports correct line and column for a multi-line match", () => {
  const source = "line one\nline two\nfind me here";
  const result = locateQuote(source, "find me here");
  assert.equal(result.found, true);
  assert.equal(result.position.startLine, 3);
  // "find me here" starts at the beginning of line 3
  assert.equal(result.position.startColumn, 1);
  assert.equal(result.position.endLine, 3);
});

test("position is null when there is no match", () => {
  const result = locateQuote("Nothing relevant appears here.", "committee approved budget");
  assert.equal(result.found, false);
  assert.equal(result.position, null);
});

test("locateAllQuotes returns [] for no match, empty source, and blank quote", () => {
  assert.deepEqual(locateAllQuotes("nothing relevant here", "committee approved budget"), []);
  assert.deepEqual(locateAllQuotes("", "anything"), []);
  assert.deepEqual(locateAllQuotes("some text", "   "), []);
});

// S2: astral-plane alphanumerics (e.g. U+1D400 MATHEMATICAL BOLD CAPITAL A)
// must survive normalization. Splitting the run with punctuation forces the
// normalized path; if the astral chars are dropped, no match is found.
test("S2: astral alphanumerics survive normalization and yield a valid span", () => {
  const source = "x: \u{1D400}, \u{1D401}\u{1D402} :y"; // "x: 𝐀, 𝐁𝐂 :y"
  const quote = "\u{1D400} \u{1D401}\u{1D402}"; // "𝐀 𝐁𝐂"

  const result = locateQuote(source, quote);

  assert.equal(result.found, true);
  assert.equal(result.method, "normalized");
  assert.equal(result.matchedText, "\u{1D400}, \u{1D401}\u{1D402}");
  assert.equal(source.slice(result.start, result.end), result.matchedText);
});

// S1 characterization: pruning allFuzzyWindows to one best window per start
// must NOT change the returned output. These lock the exact current results
// on repetitive sources so the internal candidate bound stays output-neutral.
test("S1: locateAllQuotes output unchanged on a single repetitive fuzzy source", () => {
  const source = "The board approved a narrow pilot after the review.";
  const results = locateAllQuotes(source, "board approved the narrow pilot", { minScore: 0.6 });

  assert.deepEqual(results, [
    {
      found: true,
      score: 0.839,
      start: 3,
      end: 32,
      matchedText: " board approved a narrow pilo",
      method: "fuzzy",
      position: { startLine: 1, startColumn: 4, endLine: 1, endColumn: 33 },
    },
  ]);
});

test("S1: locateAllQuotes output unchanged mixing exact and a fuzzy repeat", () => {
  const source = "board approved the narrow pilot. Later the baord aproved a narow pilot.";
  const results = locateAllQuotes(source, "board approved the narrow pilot", { minScore: 0.7 });

  assert.deepEqual(
    results.map((r) => ({
      score: r.score,
      start: r.start,
      end: r.end,
      method: r.method,
      matchedText: r.matchedText,
    })),
    [
      { score: 1, start: 0, end: 31, method: "exact", matchedText: "board approved the narrow pilot" },
      { score: 0.774, start: 43, end: 70, method: "fuzzy", matchedText: "baord aproved a narow pilot" },
    ],
  );
});

// Regression: a shorter fuzzy window that does NOT overlap a later, higher-scoring
// match must be kept. Pruning to one best-scoring window per start would drop it,
// because the longer best-at-start window overlaps the exact match and gets deduped.
test("locateAllQuotes keeps a non-overlapping shorter fuzzy window beside a later exact match", () => {
  const results = locateAllQuotes("aaaaaaaaXaaaaaaaaaa", "aaaaaaaaaa", { minScore: 0.6 });
  const shapes = results.map((r) => ({ method: r.method, start: r.start, end: r.end }));
  assert.ok(
    shapes.some((s) => s.method === "exact" && s.start === 9 && s.end === 19),
    "expected the exact match at 9..19",
  );
  assert.ok(
    shapes.some((s) => s.method === "fuzzy" && s.start === 0),
    "expected a non-overlapping fuzzy match starting at 0",
  );
});

// S3: CLI --all flag prints a JSON array via locateAllQuotes; exit 0 if non-empty.
test("S3 CLI --all prints a JSON array and exits 0 when non-empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const source = join(dir, "source.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(source, "careful sentence and then a careful sentence again", "utf8");
  writeFileSync(quote, "careful sentence", "utf8");

  const result = spawnSync("node", ["dist/cli.js", "--all", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 2);
  assert.ok(parsed.every((r) => r.found === true));
});

test("S3 CLI --all exits 1 with an empty array when nothing matches", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const source = join(dir, "source.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(source, "Nothing relevant appears here.", "utf8");
  writeFileSync(quote, "committee approved budget", "utf8");

  const result = spawnSync("node", ["dist/cli.js", "--all", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

test("S3 CLI --min-score is parsed as a float and passed through", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const source = join(dir, "source.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(source, "The board approved a narrow pilot after the review.", "utf8");
  writeFileSync(quote, "board approved the narrow pilot", "utf8");

  // A strict threshold rejects the only (fuzzy) candidate -> not found -> exit 1.
  const strict = spawnSync("node", ["dist/cli.js", "--min-score", "0.95", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.equal(strict.status, 1);
  assert.equal(JSON.parse(strict.stdout).found, false);

  // A lenient threshold accepts the fuzzy match -> found -> exit 0.
  const lenient = spawnSync("node", ["dist/cli.js", "--min-score", "0.6", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.equal(lenient.status, 0);
  assert.equal(JSON.parse(lenient.stdout).method, "fuzzy");
});

test("S3 CLI exits 2 with a usage/error message on an invalid --min-score", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const source = join(dir, "source.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(source, "A small useful tool.", "utf8");
  writeFileSync(quote, "useful tool", "utf8");

  const result = spawnSync("node", ["dist/cli.js", "--min-score", "abc", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.ok(result.stderr.length > 0);
});

test("S3 CLI rejects a --min-score with trailing junk (numeric prefix)", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const source = join(dir, "source.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(source, "A small useful tool.", "utf8");
  writeFileSync(quote, "useful tool", "utf8");

  // parseFloat("0.8xyz") === 0.8 would wrongly accept this; Number("0.8xyz") is NaN.
  const result = spawnSync("node", ["dist/cli.js", "--min-score", "0.8xyz", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid --min-score/);
});

test("S3 CLI --case-sensitive is passed through as caseSensitive: true", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const source = join(dir, "source.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(source, "The Budget passed.", "utf8");
  writeFileSync(quote, "budget", "utf8");

  // Without the flag the exact match is case-insensitive.
  const insensitive = spawnSync("node", ["dist/cli.js", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.equal(insensitive.status, 0);
  assert.equal(JSON.parse(insensitive.stdout).method, "exact");

  // With the flag the exact path is suppressed, falling through to normalized.
  const sensitive = spawnSync("node", ["dist/cli.js", "--case-sensitive", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.equal(sensitive.status, 0);
  assert.equal(JSON.parse(sensitive.stdout).method, "normalized");
});

test("S3 CLI reads the source from STDIN when the source arg is '-'", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const quote = join(dir, "quote.txt");
  writeFileSync(quote, "useful tool", "utf8");

  const result = spawnSync("node", ["dist/cli.js", "-", quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
    input: "A small useful tool.",
  });

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).found, true);
  assert.equal(JSON.parse(result.stdout).matchedText, "useful tool");
});
