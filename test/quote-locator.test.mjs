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

