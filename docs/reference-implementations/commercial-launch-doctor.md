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
- refresh local provider reconciliation, handoff, external-lease, protected lease-service, action-ledger, and multi-worker handoff smoke evidence
- refresh the no-spend Director-style quality benchmark
- refresh local JSON/Markdown readiness reports
- run report-contract validation
- summarize external/operator blockers

## Command Sequence

1. Build TypeScript directly through the local TypeScript compiler entrypoint.
2. Validate deployment package shape.
3. Run snapshot parity guardrail audit.
4. Optionally run local smoke unless `--skip-local-smoke` is set.
5. Optionally refresh provider resume/handoff smoke evidence unless `--skip-provider-handoff-smokes` is set.
6. Run release audit.
7. Run the no-spend Director-style quality benchmark.
8. Run launch intake validation.
9. Run live input validation.
10. Run business validation plan.
11. Run commercial input packet generation.
12. Run business completion audit.
13. Run business readiness audit.
14. Write the launch doctor report.
15. Run report-contract validation.
16. Rerun business completion audit so it reads the fresh report-contract status.
17. Rewrite the launch doctor report with the refreshed completion-audit status.
18. Run report-contract validation one final time, then rewrite the doctor report with the final contract status.

Expected blocked or review-required commands can exit non-zero without becoming code blockers. The quality benchmark is refreshed as backend evidence, but a `blocked` or `review_required` benchmark remains product/evidence status rather than launch-doctor code failure. Provider handoff smokes are local/fake-provider checks; they strengthen backend evidence but do not replace production HTTPS deployment handoff capture or live provider action execution. Unexpected build, local-smoke, provider-handoff smoke, release-audit, deployment-package, or report-contract failures become code-side blockers.

Snapshot parity audit failures also become code-side blockers because they mean the subtree/source-lineage/import-boundary evidence is no longer trustworthy.

When `--skip-provider-handoff-smokes` is used, provider smoke statuses in the launch-doctor snapshot must be `skipped` rather than reusing stale report files.

The report-contract validator enforces these launch-doctor semantics in addition to JSON schema shape. A launch-doctor report must show the core command sequence, refreshed quality benchmark command evidence, final report-contract pass, provider handoff smoke pass/warn snapshot statuses when enabled, explicit skipped provider statuses when provider smokes are disabled, and no stale unexpected command failures when code blockers are zero.

Because the doctor rewrites its own report before and after contract refreshes, its internal report-contract commands use `--allow-launch-doctor-in-progress`. That mode still validates the base command sequence and refreshed provider/quality evidence, while standalone/default report-contract validation remains strict and requires the completed final contract command.

## Acceptance Criteria

- `npm.cmd run validation:launch-doctor` writes a JSON report and a Markdown report.
- The JSON report uses schema version `cinejelly.commercial-launch-doctor.v1`.
- The report includes command runs, source report statuses, readiness snapshot, code-side status, blocker summary, release gate, and next actions.
- The readiness snapshot includes the current Director-style quality benchmark status.
- The readiness snapshot includes current snapshot parity guardrail status.
- The readiness snapshot includes the current provider reconciliation/handoff smoke statuses when those smokes are enabled.
- The report contract is included in `validation:report-contracts`.
- The report contract rejects stale launch-doctor evidence when command coverage, provider-smoke refresh/skip state, quality benchmark refresh, final contract status, or code-failure summary is internally inconsistent.
- Customer traffic remains blocked unless `validation:business-readiness` approves it.
- Paid Atlas work remains opt-in through the existing paid validation commands.
