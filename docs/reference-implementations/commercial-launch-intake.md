# Commercial Launch Intake

Implementation status as of 2026-06-19: implemented as a CineJelly-owned no-spend launch-intake validator, raw intake JSON schema, draft writer, validation-report JSON schema, package command, Markdown fill-out packet, report-contract input, and optional input source for `validation:live-inputs`, `validation:business-plan`, and `validation:commercial-inputs`. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

The commercial launch blockers include operator-controlled values that cannot be invented by code: real HTTPS deployment URL, approval owner, commercial offer scope, validation budget, source-video choice, remote-stock provider choice, and manual review policy. `validation:launch-intake` gives those values one ignored JSON contract before live evidence or paid Atlas runs.

The intake must not contain raw API keys, bearer tokens, deployment tokens, provider keys, signed URLs, customer payment records, or private customer media. It may contain only clean URLs, env var names, budget numbers, booleans, non-secret operator names, and ignored evidence paths.

## Command

```powershell
npm.cmd run validation:launch-intake -- --write-draft
npm.cmd run validation:launch-intake
```

Default paths:

- Final ignored intake: `ops/commercial-launch-intake.json`
- Raw intake schema: `schemas/commercial-launch-intake.schema.json`
- Draft JSON: `assets/output_deliverables/business-readiness/operator-drafts/commercial-launch-intake.draft.json`
- Fill-out packet: `assets/output_deliverables/business-readiness/operator-drafts/commercial-launch-intake-fillout.md`
- Validation report: `assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json`

The command reads local files and environment shape only. It does not call Atlas, deployment hosts, stock providers, source-video URLs, FFmpeg, render routes, or billing providers.

## Acceptance

The raw intake and report are valid when:

1. Raw `ops/commercial-launch-intake.json`, when present, matches `schemas/commercial-launch-intake.schema.json` with `schemaVersion: "cinejelly.commercial-launch-intake.v1"`.
2. The validation report `schemaVersion` is `cinejelly.commercial-launch-intake-validation.v1`.
3. `noSpend=true`, `networkCallsMade=false`, and `providerCallsMade=false`.
4. Missing intake writes `status: "missing_intake"` without treating the draft as release evidence.
5. Present intake validates clean non-localhost HTTPS deployment/source URLs, env var names instead of secret values, ignored `ops/*.json` evidence paths, ISO approval timestamps, positive budget approvals, product-surface decision, provider choices, paid-run policy booleans, and manual-review requirements.
6. Commercial offer scope must be either `api_cli_only` or `first_party_web_ui_required`. API/CLI-only scope must explicitly acknowledge that customer traffic does not rely on a full first-party commercial Web UI; UI-required scope must keep customer traffic blocked until the full UI exists.
7. Source-video and remote-stock sections can be explicitly disabled, but when enabled they require the relevant clean URL, terms approval, provider names, and env var names.
8. Long-form or full-sequence paid policy cannot pass unless approved budget covers the corresponding current business-plan estimate.
9. A passing ignored intake can populate missing clean deployment/source-video URLs, approved budget values, and commercial scope status for no-spend live-input, business-plan, and commercial-input reports, without overriding explicit CLI flags or environment variables.
10. `validation:report-contracts` validates the raw ignored intake against its schema and semantic guard when `ops/commercial-launch-intake.json` exists, and validates the generated launch-intake report every time.

## Current Interpretation

For the current local snapshot, the command is expected to produce `missing_intake` until an operator copies the draft into `ops/commercial-launch-intake.json` and fills it with real non-secret values. This is useful progress because the next operator handoff now has a machine-checkable contract for launch inputs and for the API/CLI-only versus full first-party commercial Web UI scope decision before any paid Atlas command can be copied.
