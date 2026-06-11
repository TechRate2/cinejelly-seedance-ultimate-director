---
name: test
description: Run tests for a specific package or all packages and report results
argument-hint: "[package-name]"
disable-model-invocation: true
---

Run tests for the VibeFrame project.

If an argument is provided, test that specific package:
- `cli` → `pnpm -F @vibeframe/cli exec vitest run`
- `core` → `pnpm -F @vibeframe/core test`
- `all` or no argument → `pnpm test`

Steps:
1. Run the appropriate test command
2. Count passed/failed/skipped tests from output
3. Report results in a summary table:

| Metric | Value |
|--------|-------|
| Test files | X passed, Y failed |
| Tests | X passed, Y skipped |
| Duration | Xs |

If any tests fail, read the failing test file and the source file it tests to diagnose the root cause.
