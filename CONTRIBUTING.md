# Contributing

Thanks for helping improve `quote-locator`.

## Development

```bash
npm ci
npm test   # builds with tsc, then runs the node:test suite
```

Tests live in `test/` and run against the built output in `dist/`, so `npm test`
builds first. Source is TypeScript in `src/`; there are no runtime dependencies,
and please keep it that way unless there's a strong reason.

## Pull requests

- Add or update a test for any behavior change. New matching logic needs a test
  that asserts the returned span (`source.slice(start, end) === matchedText`),
  not just `found`.
- Keep the public API (`QuoteLocation`, `LocateQuoteOptions`) stable, or call
  the change out explicitly.
- `npm test` must pass. CI runs the same on Node 24.

## Reporting

- Bugs: open a GitHub issue with a minimal reproduction (source text, quote,
  options, expected vs actual).
- Security issues: see [SECURITY.md](SECURITY.md) — report by email, not a
  public issue.
