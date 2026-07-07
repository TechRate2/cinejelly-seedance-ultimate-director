# Business Completion Audit

Implementation status as of 2026-06-19: implemented as a CineJelly-owned no-spend Node.js summarizer, JSON schema, package command, launch-intake commercial scope reader, generated Markdown summary, and report-contract input. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

Operators need a single report that answers whether the remaining commercial gap is code work, a product-scope decision, or external launch evidence. `validation:completion-audit` reads the existing readiness reports, the launch-intake commercial scope report, the one-command commercial launch doctor report, and ops-config validation output, then produces a secret-free blocker ownership summary:

- code/schema/command-plan blockers that Codex can fix in repo
- snapshot/subtree parity guardrail drift from `validation:snapshot-parity`
- product-code parity gaps such as first-party Web UI, full deployed durable queue-backed active provider-work resume/reconciliation/handoff with live provider action execution, and full semantic/audio/ASR/lip-sync benchmark evidence coverage
- commercial offer scope evidence from `validation:launch-intake`, including whether first-party Web UI is still undecided, explicitly scoped out for API/CLI-only launch, or required before customer traffic
- operator handoff evidence from `validation:commercial-inputs`, including safe-to-share input counts, ignored operator file paths, draft/report archive counts, and guarded refresh commands
- snapshot parity coverage from `validation:snapshot-parity`, including per-upstream functional estimate ranges and explicit remaining gaps from the static parity audit
- evidence closure planning that groups remaining blockers into ordered code, scope, operator-prep, deployment, live-provider, source-video, remote-stock, budget, and post-paid review phases, with phase-level required input IDs, env placeholders, operator input files, draft files, report-archive paths, expanded input validation commands, command guard metadata, no-spend local preparation commands, and an execution-readiness verdict from the safe handoff manifest
- operator inputs such as deployment URL, attestations, source-video settings, and remote-stock provider choices
- budget approval gaps such as the current full paid Atlas sequence exceeding the approved cap
- paid-validation/manual-review gates that can only pass after a real provider run and human review

The command is not release approval. `validation:business-readiness` remains the customer-traffic gate.

## Command

```powershell
npm.cmd run validation:completion-audit
```

Default outputs:

- `assets/output_deliverables/business-readiness/business-completion-audit-report.json`
- `assets/output_deliverables/business-readiness/business-completion-audit.md`

The command reads local JSON reports only. It does not call Atlas, deployment hosts, remote stock providers, source URLs, FFmpeg, render routes, or billing providers.

When `validation:launch-doctor` invokes this command as part of its own run, it passes `--skip-launch-doctor-report` so the completion audit does not read a stale doctor report from the previous run. Standalone `validation:completion-audit` keeps reading the latest completed launch-doctor report.

## Acceptance

The report is valid when:

1. `schemaVersion` is `cinejelly.business-completion-audit.v1`.
2. `noSpend=true`, `networkCallsMade=false`, and `providerCallsMade=false`.
3. `readinessSnapshot` records current business-readiness completion, snapshot parity status, launch-doctor status, ops-config status, report statuses, Atlas key/model booleans, budget fit, and ready paid gates.
4. `commercialOfferScopeSummary` records the launch-intake status, configured commercial surface, UI-before-traffic flag, and whether first-party Web UI still blocks the scoped API/CLI commercial path.
5. `operatorHandoffSummary` mirrors the safe `operatorHandoffManifest` from commercial launch inputs without secrets, raw provider payloads, local absolute paths, customer media, or release-evidence claims.
6. `snapshotParityCoverageSummary` mirrors the snapshot parity audit's per-upstream estimate rows, keeps `releaseEvidence=false`, keeps `canClaimFullSnapshotParity=false`, and carries the explicit main gaps that block a full upstream parity claim.
7. `codeWorkSummary` separates code/schema/command-plan blockers from external/operator blockers and reports product-code gaps separately from API/CLI commercial gates.
8. `productCodeGaps` lists known parity blockers that prevent a 100% upstream/product-completeness claim even when schema/command-plan contracts are passing; gaps that require deployment, paid, live-provider, or manual-review evidence must set `completionRequiresExternalEvidence=true` and `canAutomateNow=false`, while product-scope decisions such as first-party Web UI versus API/CLI-only launch must set `scopeDecisionRequired=true` only while the launch-intake scope is undecided.
9. `blockers` assigns every remaining non-configured commercial input to an owner and category.
10. `evidenceClosurePlan` assigns every blocker to exactly one ordered closure phase, carries phase-level commands expanded from the commercial-input `inputValidationRunbook`, command guards, local preparation commands, product-gap references, required operator input IDs, env placeholders, related operator input files, draft/template files, report archive files, and an `executionReadiness` verdict with blocking reasons, keeps `releaseEvidence=false`, and keeps paid dependencies explicit.

`localPreparationCommands` is deliberately narrower than `commands`: it lists only draft/template helper commands that can be attempted locally without live network confirmation, provider spend, manual-review confirmation, unresolved placeholders, or customer-release claims. Each entry is bound back to the required input IDs and draft/template files for that phase so operators can prepare packets before running the real evidence commands.
11. `releaseGateSummary.canReleaseToCustomerTraffic` mirrors the real business-readiness gate rather than the completion audit's own status, while `canClaimFullSnapshotParity=false` remains true until product-code gaps are closed or intentionally scoped out of the commercial offer.
12. `validation:report-contracts` validates `schemas/business-completion-audit-report.schema.json` against the generated report.
13. `validation:report-contracts` also validates report-local semantics: blocker counts, owner/category totals, product-code gap counts, commercial-offer scope alignment, operator-handoff safety/count alignment, snapshot parity coverage estimate/count alignment, evidence-closure phase coverage, expanded generated-audio and long-form manual-review command steps, parity flags, ready paid-gate counts, snapshot/report/release status booleans, and customer-traffic/full-paid release flags must match the underlying arrays and readiness snapshot.
14. A failing snapshot parity audit becomes a codebase-owned blocker before any full-parity claim is trusted.
15. Any code-side blocker reported by `validation:launch-doctor` becomes a codebase-owned completion-audit blocker until the doctor is clean.
16. When `commercialLaunchDoctorSkipped=true`, the launch-doctor source status is `skipped_launch_doctor_in_progress` and must not create a missing-report blocker.

## Current Interpretation

For the current local snapshot, Atlas media/LLM/model configuration is present, and the generated-audio paid slice is the only narrow Atlas paid validation within the `$5` cap. The full known paid sequence remains over budget because the 120 second long-form render estimate is about `$24`, excluding source-video LLM usage, remote stock usage, hosting, and manual review time.

That means the remaining launch blockers are not another Atlas key by themselves. They are real HTTPS deployment evidence, operator attestations, approved budget for the intended paid validation scope, source-video input/enablement, approved remote-stock provider evidence, and post-paid manual reviews.

For full snapshot/product completeness, the audit also keeps separate product-code gaps visible: partial first-party Short Studio/operator shells without full commercial WebUI parity, no distributed active provider-work resume beyond compact stale-active recovery plus provider checkpoint/reconciliation/handoff heartbeat audit evidence, protected lease-service validation, HTTPS external lease adapter validation, idempotent action-ledger execution replay validation, digest-only resume-state capsule plus local enqueue/replay/lease/ack queue lifecycle, protected graph-resume queue-service validation, local two-worker handoff validation, production handoff capture-runner tooling, non-evidence live provider action template/checklist handoff, live provider action evidence validation, and separate graph-resume enqueue payload evidence validation, plus no full accepted semantic/audio/runtime/ASR/lip-sync/governance/generated-audio/long-form DirectorBench-style benchmark evidence. The digest-only local queue lifecycle, protected HTTP queue-service smoke, and graph-resume payload validator are useful, but they must not be inflated into production HA resume until real deployment ownership, live provider action execution, live queue enqueue execution, and payload evidence pass together. The media, transition-boundary proxy, audio waveform/sync proxy, structured semantic-review, structured audio-review, structured ASR/lip-sync runtime-review, structured governance-review, artifact-bound `needs_review` review draft generation, long-form manual quality/redaction review draft generation, accepted review-evidence readiness validation, generated-audio validation report ingestion, long-form validation report ingestion, and contract-validated parity evidence matrix foundation is useful but should not be hidden or inflated into full parity by a clean API/CLI schema result.

`canAutomateNow` is intentionally conservative: it means the product-code gap can be completed by repository work alone in the current backend phase. `localPreparationAvailable=true` only means CineJelly can refresh draft/smoke/prep evidence locally; it does not mean the remaining gap is closable without the listed external evidence gates. `scopeDecisionRequired=true` marks a deliberate product decision still needed before a full parity/completeness claim, for example building the first-party Web UI or scoping the offer as API/CLI-only. Once `validation:launch-intake` records an approved API/CLI-only scope, the first-party Web UI gap remains visible for full snapshot parity but changes to `scoped_out_for_api_cli_launch`; if the intake records `first_party_web_ui_required`, the same gap changes to `required_before_customer_traffic` and blocks the scoped commercial launch until a UI is built.
