# Generated Audio Artifact Evidence

Implementation status as of 2026-06-19: implemented as a CineJelly-owned artifact capture CLI, JSON schema, report-contract input, and generated-audio manual-review binding. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

Generated-audio provider execution and output-batch validation prove that Atlas returned an acceptable audio result shape. Manual listening review still needs a stable artifact binding so the reviewer is checking the exact media bytes, not only a prediction id or clean URL. `validation:generated-audio-artifact` captures SHA-256, byte size, ffprobe duration, codec metadata, and the report/output binding for the already-generated audio URL.

The command is not a provider run and is not manual review. It never calls Atlas model endpoints and it never approves generated audio for business readiness by itself.

## Contract

The artifact evidence command must:

1. Read `generated-audio-validation-report.json`.
2. Require provider spend, Atlas billing, schema review, succeeded execution, approved output-batch validation, provider ledger evidence, and a credential-free HTTPS output URL before capture.
3. Block before network fetch unless `--confirm-live-network` is present.
4. Download only the already-generated clean audio URL, enforce a max byte limit, write the local media artifact under ignored output paths, and record SHA-256/byte-size metadata.
5. Run ffprobe on the downloaded audio and require an audio stream plus positive duration for `status=pass`.
6. Keep `providerCallsMade=false`, `releaseEvidence=false`, `canUseAsBusinessReadinessGeneratedAudioEvidence=false`, and `canReleaseToCustomerTraffic=false`.
7. Feed structured generated-audio manual-review evidence through `artifactEvidence`, so review packets can be checked against the captured SHA-256/duration report.

## Command

```powershell
npm.cmd run validation:generated-audio-artifact
npm.cmd run validation:generated-audio-artifact -- --confirm-live-network
```

Default outputs:

- JSON: `assets/output_deliverables/business-readiness/generated-audio-artifact-evidence-report.json`
- Ignored audio artifact: `assets/output_deliverables/business-readiness/generated-audio-artifacts/generated-audio-validation.mp3`
- Schema: `schemas/generated-audio-artifact-evidence-report.schema.json`

## Manual Review Binding

`validation:generated-audio-review-draft` now includes an `artifactEvidence` block in the operator template. A final structured `ops/generated-audio-manual-review.json` must keep the artifact evidence report path, local artifact path, SHA-256, byte size, duration, output URL, and prediction id aligned with the artifact evidence report. `validation:generated-audio -- --review-existing-report ... --manual-audio-review ... --confirm-manual-audio-review` rejects structured review evidence when those fields drift.

`validation:report-contracts` also validates the raw ignored `ops/generated-audio-manual-review.json` packet directly when it exists. The contract requires accepted/pass review status, every required listening check, redaction review, matching artifact binding/evidence URL and prediction id, safe repo-relative report/artifact paths, positive byte/duration evidence, and redacted findings without placeholders, raw URLs, local paths, data URIs, bearer tokens, or credential-like strings.

This closes a backend evidence gap without pretending to replace the human or approved-analyzer listening decision.
