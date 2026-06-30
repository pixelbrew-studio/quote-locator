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

test("CLI exits 1 when no match is found", () => {
  const dir = mkdtempSync(join(tmpdir(), "quote-locator-"));
  const source = join(dir, "source.txt");
  const quote = join(dir, "quote.txt");
  writeFileSync(source, "nothing relevant here", "utf8");
  writeFileSync(quote, "committee approved budget", "utf8");

  const result = spawnSync("node", ["dist/cli.js", source, quote], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).found, false);
});

test("CLI exits 2 when the source file is missing", () => {
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

test("CLI exits 2 when file arguments are missing", () => {
  const result = spawnSync("node", ["dist/cli.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
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
