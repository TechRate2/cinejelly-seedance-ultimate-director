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
- refresh the no-spend Director-style quality benchmark
- refresh local JSON/Markdown readiness reports
- run report-contract validation
- summarize external/operator blockers

## Command Sequence

1. Build TypeScript directly through the local TypeScript compiler entrypoint.
2. Validate deployment package shape.
3. Optionally run local smoke unless `--skip-local-smoke` is set.
4. Run release audit.
5. Run the no-spend Director-style quality benchmark.
6. Run launch intake validation.
7. Run live input validation.
8. Run business validation plan.
9. Run commercial input packet generation.
10. Run business completion audit.
11. Run business readiness audit.
12. Write the launch doctor report.
13. Run report-contract validation.
14. Rerun business completion audit so it reads the fresh report-contract status.
15. Rewrite the launch doctor report with the refreshed completion-audit status.
16. Run report-contract validation one final time, then rewrite the doctor report with the final contract status.

Expected blocked or review-required commands can exit non-zero without becoming code blockers. The quality benchmark is refreshed as backend evidence, but a `blocked` or `review_required` benchmark remains product/evidence status rather than launch-doctor code failure. Unexpected build, local-smoke, release-audit, deployment-package, or report-contract failures become code-side blockers.

## Acceptance Criteria

- `npm.cmd run validation:launch-doctor` writes a JSON report and a Markdown report.
- The JSON report uses schema version `cinejelly.commercial-launch-doctor.v1`.
- The report includes command runs, source report statuses, readiness snapshot, code-side status, blocker summary, release gate, and next actions.
- The readiness snapshot includes the current Director-style quality benchmark status.
- The report contract is included in `validation:report-contracts`.
- Customer traffic remains blocked unless `validation:business-readiness` approves it.
- Paid Atlas work remains opt-in through the existing paid validation commands.
