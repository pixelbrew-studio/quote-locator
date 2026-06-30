import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { locateQuote } from "../dist/index.js";

test("finds exact quotes", () => {
  const result = locateQuote("One careful sentence lives here.", "careful sentence");
  assert.equal(result.found, true);
  assert.equal(result.method, "exact");
  assert.equal(result.matchedText, "careful sentence");
  assert.equal(result.start, 4);
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

test("CLI exits 2 on usage error (missing arguments)", () => {
  const result = spawnSync("node", ["dist/cli.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
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
});

