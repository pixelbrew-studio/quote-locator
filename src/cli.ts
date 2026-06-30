#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { locateQuote, locateAllQuotes } from "./index.js";

const USAGE =
  "Usage: quote-locator [--all] [--min-score <n>] [--case-sensitive] <source.txt|-> <quote.txt>";

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

let values: {
  all?: boolean;
  "min-score"?: string;
  "case-sensitive"?: boolean;
};
let positionals: string[];

try {
  ({ values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      all: { type: "boolean" },
      "min-score": { type: "string" },
      "case-sensitive": { type: "boolean" },
    },
  }));
} catch {
  fail(USAGE);
}

const [sourcePath, quotePath] = positionals;

if (!sourcePath || !quotePath) {
  fail(USAGE);
}

const options: { minScore?: number; caseSensitive?: boolean } = {};

if (values["min-score"] !== undefined) {
  const raw = values["min-score"].trim();
  const minScore = Number(raw);
  if (raw === "" || !Number.isFinite(minScore)) {
    fail(`Invalid --min-score value: ${values["min-score"]}`);
  }
  options.minScore = minScore;
}

if (values["case-sensitive"]) {
  options.caseSensitive = true;
}

try {
  const sourceText =
    sourcePath === "-" ? readFileSync(0, "utf8") : readFileSync(sourcePath, "utf8");
  const quote = readFileSync(quotePath, "utf8");

  if (values.all) {
    const results = locateAllQuotes(sourceText, quote, options);
    console.log(JSON.stringify(results, null, 2));
    process.exit(results.length > 0 ? 0 : 1);
  }

  const result = locateQuote(sourceText, quote, options);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.found ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(2);
}
