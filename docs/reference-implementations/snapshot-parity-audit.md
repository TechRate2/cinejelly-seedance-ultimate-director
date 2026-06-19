# Snapshot Parity Audit

Implementation status as of 2026-06-19: implemented as a CineJelly-owned no-spend Node.js audit, JSON schema, package command, report-contract input, launch-doctor command, and business-completion audit source report. It now parses the static Snapshot Function Parity Audit table into machine-readable per-upstream functional parity estimates while keeping those estimates non-release evidence. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

Operators need a repeatable machine check for the snapshot/subtree discipline behind CineJelly's source-fidelity claims. Markdown parity estimates are useful, but a launch-quality backend also needs a report that proves the local snapshot inventory, policy docs, source-lineage records, Reference Implementation anchors, and production import boundary are still intact.

The audit does not claim 100% upstream parity. It verifies that the guardrails needed to make honest parity claims are still present, and it converts the current per-upstream estimate table into JSON so higher-level launch reports can answer "which snapshot is covered by how much" without requiring a manual Markdown read.

## Source Logic

| Source | Local snapshot path | License state | Behavior used |
| --- | --- | --- | --- |
| All configured upstream snapshots | `external/upstream/*` | Mixed | Snapshot inventory, source lineage, policy coverage, and parity estimate discipline. |
| VibeFrame | `external/upstream/vibeframe` | MIT | Deterministic no-spend report discipline before release claims. |
| MoneyPrinterTurbo | `external/upstream/moneyprinterturbo` | MIT | Operator-visible validation command surfaced in the launch flow. |

## Preserved Behavior

1. Snapshot directories remain read-only source material under `external/upstream/`.
2. Production code must not import directly from upstream snapshots.
3. Behavior-critical translations need Reference Implementation anchors and runtime/source lineage.
4. Static snapshot parity estimates must remain explicit that customer readiness and 100% parity are not proven by local docs alone.
5. The audit must be no-spend and no-network so it can run inside launch doctor.

## CineJelly Changes

1. The audit reads only local files and never executes upstream code.
2. It checks the configured expected subtree snapshots, inventory docs, subtree policy coverage, parity audit coverage, source-logic lineage coverage, key Reference Implementation files, direct import boundaries, and parseable functional estimate rows for every configured snapshot.
3. It writes `assets/output_deliverables/business-readiness/snapshot-parity-audit-report.json`.
4. It exits non-zero only when guardrails fail; known product gaps remain in business completion audit and do not become false parity claims.

## Destination Paths

- `scripts/audit-snapshot-parity.mjs`
- `schemas/snapshot-parity-audit-report.schema.json`
- `scripts/validate-report-contracts.mjs`
- `scripts/run-commercial-launch-doctor.mjs`
- `scripts/summarize-business-completion-audit.mjs`
- `schemas/commercial-launch-doctor-report.schema.json`
- `schemas/business-completion-audit-report.schema.json`
- `package.json`

## Validation Command

```powershell
npm.cmd run validation:snapshot-parity
```

## Acceptance Criteria

- The report uses schema version `cinejelly.snapshot-parity-audit.v1`.
- It performs no network, provider, Atlas, deployment, source-video, FFmpeg, billing, or paid validation calls.
- All expected snapshot directories are present under `external/upstream/`.
- `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`, `docs/SUBTREE_POLICY.md`, and `docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md` cover the configured snapshots.
- `src/core/source-logic-translation-records.ts` includes lineage for every configured snapshot.
- The configured Reference Implementation files exist and expose enough structure to audit source behavior and validation expectations.
- `functionalParityEstimates` contains one non-release-evidence estimate per configured upstream snapshot, parsed from `docs/SNAPSHOT_FUNCTION_PARITY_AUDIT_2026-06-17.md`, with explicit main gaps and no 100% estimate.
- Production `src/` and `scripts/` files do not import directly from `external/upstream`.
- `releaseGateSummary.canClaimFullSnapshotParity` remains false until product-code gaps and external/live evidence gates are closed.
- `validation:report-contracts` rejects snapshot parity reports that have non-pass guardrails, missing snapshot/source-lineage coverage, missing or unsafe functional estimates, direct external import findings, or release-gate claims that imply full parity or customer-traffic approval.
