---
name: sync-check
description: Quick SSOT consistency check across versions, docs, and landing page.
disable-model-invocation: true
---

# SSOT Sync Check

Run these checks and report results:

## 1. Version Sync

```bash
grep '"version"' package.json packages/*/package.json apps/*/package.json
```

All versions must match. Report any mismatches.

## 2. Landing Page Sync (apps/web/app/page.tsx)

- Version badge matches package.json
- Count metadata matches actual source-derived values:
  `bash scripts/sync-counts.sh --check`

## 3. README.md Sync

- Provider and CLI command counts are up to date:
  `bash scripts/sync-counts.sh --check`
- CLI reference is generated from the current CLI:
  `pnpm gen:reference:check`

## 4. MODELS.md Sync

- Model IDs in MODELS.md match those used in `packages/cli/src/commands/` and `packages/ai-providers/src/`

## Output Format

Report as table:

| Check        | Status    | Details |
| ------------ | --------- | ------- |
| Version sync | Pass/Fail | ...     |
| Landing page | Pass/Fail | ...     |
| README.md    | Pass/Fail | ...     |
| MODELS.md    | Pass/Fail | ...     |
