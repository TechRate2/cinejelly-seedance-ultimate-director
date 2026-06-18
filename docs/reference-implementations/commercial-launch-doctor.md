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
- refresh local provider reconciliation, handoff, external-lease, protected lease-service, action-ledger, multi-worker handoff smoke evidence, live provider action evidence status, and graph-resume enqueue payload evidence status
- refresh the no-spend Director-style quality benchmark, review-evidence guard smoke, and accepted review-evidence readiness gate
- refresh local JSON/Markdown readiness reports
- surface the commercial offer scope summary from completion-audit so operators can see whether first-party Web UI is still undecided, scoped out for API/CLI-only launch, or required before customer traffic
- run report-contract validation
- summarize external/operator blockers

## Command Sequence

1. Build TypeScript directly through the local TypeScript compiler entrypoint.
2. Validate deployment package shape.
3. Run snapshot parity guardrail audit.
4. Optionally run local smoke unless `--skip-local-smoke` is set.
5. Optionally refresh provider resume/handoff smoke evidence unless `--skip-provider-handoff-smokes` is set.
6. Refresh live provider action evidence status from the ignored operator packet if present.
7. Refresh graph-resume enqueue payload evidence status from the ignored operator packet if present.
8. Run release audit.
9. Run the no-spend Director-style quality benchmark.
10. Run the no-spend review-evidence guard smoke.
11. Run the no-spend accepted review-evidence readiness validator.
12. Run launch intake validation.
13. Run live input validation.
14. Run business validation plan.
15. Run commercial input packet generation.
16. Run business completion audit.
17. Run business readiness audit.
18. Write the launch doctor report.
19. Run report-contract validation.
20. Rerun business completion audit so it reads the fresh report-contract status.
21. Rewrite the launch doctor report with the refreshed completion-audit status.
22. Run report-contract validation one final time, then rewrite the doctor report with the final contract status.

Expected blocked or review-required commands can exit non-zero without becoming code blockers. The quality benchmark, review-evidence guard, and review-evidence readiness reports are refreshed as backend evidence, but a `blocked` or `review_required` benchmark, a missing/incomplete review-evidence bundle, or a clean guard smoke still remains product/evidence status rather than launch approval. Provider handoff and resume-state smokes are local/fake-provider checks; they strengthen backend evidence but do not replace production HTTPS deployment handoff capture, live provider action execution, live queue execution, or real graph-resume enqueue payload proof. The live provider action and graph-resume enqueue validators may report `blocked_by_missing_inputs` until ignored operator evidence packets are present and confirmed. Unexpected build, local-smoke, provider-handoff/resume-state smoke, release-audit, deployment-package, review-evidence guard, or report-contract failures become code-side blockers.

Snapshot parity audit failures also become code-side blockers because they mean the subtree/source-lineage/import-boundary evidence is no longer trustworthy.

When `--skip-provider-handoff-smokes` is used, provider smoke statuses in the launch-doctor snapshot must be `skipped` rather than reusing stale report files.

The report-contract validator enforces these launch-doctor semantics in addition to JSON schema shape. A launch-doctor report must show the core command sequence, refreshed snapshot parity guardrail evidence, refreshed live provider action evidence status, refreshed graph-resume enqueue payload evidence status, refreshed quality benchmark command evidence, refreshed quality review guard smoke, refreshed quality review-evidence status, final report-contract pass, provider handoff, resume-state, and protected graph-resume queue-service smoke pass/warn snapshot statuses when enabled, explicit skipped provider statuses when provider smokes are disabled, and no stale unexpected command failures when code blockers are zero.

Because the doctor rewrites its own report before and after contract refreshes, its internal report-contract commands use `--allow-launch-doctor-in-progress`. That mode still validates the base command sequence and refreshed provider/quality evidence, while standalone/default report-contract validation remains strict and requires the completed final contract command.

## Acceptance Criteria

- `npm.cmd run validation:launch-doctor` writes a JSON report and a Markdown report.
- The JSON report uses schema version `cinejelly.commercial-launch-doctor.v1`.
- The report includes command runs, source report statuses, readiness snapshot, code-side status, blocker summary, release gate, and next actions.
- The report includes `commercialOfferScopeSummary` plus matching readiness/release-gate scope flags sourced from the refreshed completion audit.
- The readiness snapshot includes the current Director-style quality benchmark status, review-evidence guard status, and accepted review-evidence readiness status.
- The readiness snapshot includes current snapshot parity guardrail status.
- The readiness snapshot includes the current provider reconciliation/handoff smoke statuses when those smokes are enabled.
- The readiness snapshot includes the current graph-resume enqueue payload evidence status.
- The report contract is included in `validation:report-contracts`.
- The report contract rejects stale launch-doctor evidence when command coverage, provider-smoke refresh/skip state, quality benchmark refresh, review-evidence guard refresh, review-evidence refresh, final contract status, or code-failure summary is internally inconsistent.
- Customer traffic remains blocked unless `validation:business-readiness` approves it.
- Paid Atlas work remains opt-in through the existing paid validation commands.
