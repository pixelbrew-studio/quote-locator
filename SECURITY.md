# Security

`quote-locator` is a small clean-room utility. It does not collect telemetry, call external services, or process data outside the local runtime that imports it.

## Reporting

Report security issues by email: [hello@pixelbrew.studio](mailto:hello@pixelbrew.studio).

Please include:

- the affected version or commit
- a minimal reproduction
- expected and actual behavior
- any practical impact you can demonstrate

There is no formal bug bounty program.

## Scope

In scope:

- incorrect package contents
- unsafe CLI behavior
- dependency or build-chain issues
- behavior that could expose local file contents beyond the requested inputs

Out of scope:

- speculative issues without a reproduction
- product-specific uses in downstream applications
- requests involving Evalgist private systems or company-owned assets
