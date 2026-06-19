# Reference Implementation: Commercial Launch Doctor

## Purpose

The commercial launch doctor is a no-spend orchestration layer for the existing launch-readiness commands. It gives an operator one command that refreshes the local build, hygiene, setup, business-readiness, and contract reports before any live network or paid Atlas validation.

This preserves the VibeFrame-style validate-before-spend discipline while making the MoneyPrinterTurbo-style operator workflow easier: one command tells the operator whether the codebase is blocked, the launch inputs are missing, or paid/live evidence can be safely attempted.

## Source Patterns

- VibeFrame: deterministic preflight, review reports, release gates, and cost-aware validation before spend.
- MoneyPrinterTurbo: one-command operator flow and staged generation readiness.
- OpenMontage: approval gates and explicit human review before release.

## No-Spend Boundary

The doctor must not:

- call Atlas model endpoints
- run paid render or generated-audio execution
- call stock providers
- fetch source videos
- call deployment URLs
- bake or print secrets

It may:

- run TypeScript build
- run local smoke with a temporary localhost API
- refresh no-spend material-source scoring, source-video auto-analysis, and remote-stock adapter smoke evidence
- refresh no-spend generated-audio mapping smoke evidence for narration/BGM/ambience/SFX kind and mix-role boundaries
- refresh local provider reconciliation, handoff, external-lease, protected lease-service, action-ledger, multi-worker handoff smoke evidence, live provider action evidence status, and graph-resume enqueue payload evidence status
- refresh the no-spend Director-style quality benchmark, review-evidence guard smoke, and accepted review-evidence readiness gate
- refresh local JSON/Markdown readiness reports
- surface the commercial offer scope summary from completion-audit so operators can see whether first-party Web UI is still undecided, scoped out for API/CLI-only launch, or required before customer traffic
- surface the safe operator handoff summary from commercial-inputs so operators see missing input counts, ignored file packets, draft/report archive counts, and guarded command status from the top-level doctor report
- surface snapshot parity coverage estimates so operators can compare the current backend against each upstream snapshot without treating those estimates as release evidence
- surface the evidence closure plan from completion-audit so operators see the ordered blocker phases, required input IDs, env placeholders, related operator packet files, report archive paths, expanded input validation commands, command guards, execution-readiness verdicts, and direct commands before attempting live or paid evidence
- surface generated-audio paid validation, artifact-evidence, manual-review draft, and manual-review readiness report statuses separately so operators can see whether provider output and SHA/duration media evidence already exist before asking for listening approval
- surface long-form manual-review readiness separately so operators can see whether paid 2-8 minute artifact fingerprints exist before asking for manual quality/redaction approval
- refresh roadmap closure audit so roadmap/snapshot remaining-work requirements stay bound to current blocker IDs, product-code gaps, evidence reports, and local prep commands
- run report-contract validation
- summarize external/operator blockers

## Command Sequence

1. Build TypeScript directly through the local TypeScript compiler entrypoint.
2. Validate deployment package shape.
3. Run snapshot parity guardrail audit.
4. Run no-spend material-source scoring smoke.
5. Run no-spend source-video auto-analysis smoke.
6. Run no-spend remote-stock adapter smoke.
7. Run no-spend generated-audio mapping smoke.
8. Optionally run local smoke unless `--skip-local-smoke` is set.
9. Optionally refresh provider resume/handoff smoke evidence unless `--skip-provider-handoff-smokes` is set.
10. Refresh live provider action evidence status from the ignored operator packet if present.
11. Refresh graph-resume enqueue payload evidence status from the ignored operator packet if present.
12. Run release audit.
13. Run the no-spend Director-style quality benchmark.
14. Run the no-spend review-evidence guard smoke.
15. Run the no-spend accepted review-evidence readiness validator.
16. Run the no-spend generated-audio manual-review readiness validator.
17. Run the no-spend long-form manual-review readiness validator.
18. Run launch intake validation.
19. Run live input validation.
20. Run business validation plan.
21. Run commercial input packet generation.
22. Run business completion audit.
23. Run roadmap closure audit with the in-progress doctor report skipped.
24. Run business readiness audit.
25. Write the launch doctor report.
26. Run report-contract validation.
27. Rerun business completion audit so it reads the fresh report-contract status.
28. Rewrite the launch doctor report with the refreshed completion-audit status.
29. Run report-contract validation one final time, then rewrite the doctor report with the final contract status.

Expected blocked or review-required commands can exit non-zero without becoming code blockers. The quality benchmark, review-evidence guard, and review-evidence readiness reports are refreshed as backend evidence, but a `blocked` or `review_required` benchmark, a missing/incomplete review-evidence bundle, or a clean guard smoke still remains product/evidence status rather than launch approval. Provider handoff and resume-state smokes are local/fake-provider checks; they strengthen backend evidence but do not replace production HTTPS deployment handoff capture, live provider action execution, live queue execution, or real graph-resume enqueue payload proof. The live provider action and graph-resume enqueue validators may report `blocked_by_missing_inputs` until ignored operator evidence packets are present and confirmed. Unexpected build, local-smoke, provider-handoff/resume-state smoke, release-audit, deployment-package, review-evidence guard, or report-contract failures become code-side blockers.

Snapshot parity audit failures also become code-side blockers because they mean the subtree/source-lineage/import-boundary evidence is no longer trustworthy.

When `--skip-provider-handoff-smokes` is used, provider smoke statuses in the launch-doctor snapshot must be `skipped` rather than reusing stale report files.

The report-contract validator enforces these launch-doctor semantics in addition to JSON schema shape. A launch-doctor report must show the core command sequence, refreshed snapshot parity guardrail evidence, refreshed material-source scoring smoke, source-video auto-analysis smoke, remote-stock adapter smoke, generated-audio mapping smoke, refreshed live provider action evidence status, refreshed graph-resume enqueue payload evidence status, refreshed quality benchmark command evidence, refreshed quality review guard smoke, refreshed quality review-evidence status, final report-contract pass, provider handoff, resume-state, and protected graph-resume queue-service smoke pass/warn snapshot statuses when enabled, explicit skipped provider statuses when provider smokes are disabled, and no stale unexpected command failures when code blockers are zero.

Because the doctor rewrites its own report before and after contract refreshes, its internal report-contract commands use `--allow-launch-doctor-in-progress`. That mode still validates the base command sequence and refreshed provider/quality evidence, while standalone/default report-contract validation remains strict and requires the completed final contract command.

## Acceptance Criteria

- `npm.cmd run validation:launch-doctor` writes a JSON report and a Markdown report.
- The JSON report uses schema version `cinejelly.commercial-launch-doctor.v1`.
- The report includes command runs, source report statuses, readiness snapshot, code-side status, blocker summary, release gate, and next actions.
- The report includes `commercialOfferScopeSummary` plus matching readiness/release-gate scope flags sourced from the refreshed completion audit.
- The report includes `operatorHandoffSummary` plus matching commercial-input status, safety flags, input counts, operator file counts, and command counts from the refreshed commercial-input packet.
- The report includes `snapshotParityCoverageSummary` plus matching snapshot-parity status, per-upstream estimate counts, explicit main gaps, and `canClaimFullSnapshotParity=false`.
- The report includes `evidenceClosurePlan` plus matching blocker counts, phase counts, paid-dependency counts, phase-level required input IDs, env placeholders, operator input/draft/report archive file paths, expanded generated-audio/long-form input validation commands, command guards, local no-spend preparation commands, execution-readiness verdicts, and commands sourced from completion audit.
- The Markdown output surfaces each phase's local prep commands separately from the real evidence commands so draft/template helpers stay visibly non-release evidence.
- The readiness snapshot includes the current Director-style quality benchmark status, review-evidence guard status, and accepted review-evidence readiness status.
- The readiness snapshot includes current snapshot parity guardrail status.
- The readiness snapshot includes current source-video auto-analysis smoke and remote-stock adapter smoke statuses.
- The readiness snapshot includes current generated-audio mapping smoke status, generated-audio paid validation status, generated-audio artifact-evidence status, generated-audio manual-review draft status, generated-audio manual-review readiness status, long-form review-draft status, and long-form manual-review readiness status.
- The readiness snapshot includes the current provider reconciliation/handoff smoke statuses when those smokes are enabled.
- The readiness snapshot includes the current graph-resume enqueue payload evidence status.
- The report contract is included in `validation:report-contracts`.
- The report contract rejects stale launch-doctor evidence when command coverage, provider-smoke refresh/skip state, quality benchmark refresh, review-evidence guard refresh, review-evidence refresh, operator-handoff safety/count alignment, snapshot parity estimate/count alignment, evidence-closure count/phase alignment, final contract status, or code-failure summary is internally inconsistent.
- Customer traffic remains blocked unless `validation:business-readiness` approves it.
- Paid Atlas work remains opt-in through the existing paid validation commands.
