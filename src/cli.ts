#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { locateQuote } from "./index.js";

const [, , sourcePath, quotePath] = process.argv;

if (!sourcePath || !quotePath) {
  console.error("Usage: quote-locator <source.txt> <quote.txt>");
  process.exit(2);
}

try {
  const sourceText = readFileSync(sourcePath, "utf8");
  const quote = readFileSync(quotePath, "utf8");
  const result = locateQuote(sourceText, quote);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.found ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(2);
}

