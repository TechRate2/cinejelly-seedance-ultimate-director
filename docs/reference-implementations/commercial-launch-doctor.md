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
- refresh local JSON/Markdown readiness reports
- run report-contract validation
- summarize external/operator blockers

## Command Sequence

1. Build TypeScript directly through the local TypeScript compiler entrypoint.
2. Validate deployment package shape.
3. Optionally run local smoke unless `--skip-local-smoke` is set.
4. Run release audit.
5. Run launch intake validation.
6. Run live input validation.
7. Run business validation plan.
8. Run commercial input packet generation.
9. Run business completion audit.
10. Run business readiness audit.
11. Write the launch doctor report.
12. Run report-contract validation, then rewrite the doctor report with the final contract status.

Expected blocked commands can exit non-zero without becoming code blockers. Unexpected build, local-smoke, release-audit, deployment-package, or report-contract failures become code-side blockers.

## Acceptance Criteria

- `npm.cmd run validation:launch-doctor` writes a JSON report and a Markdown report.
- The JSON report uses schema version `cinejelly.commercial-launch-doctor.v1`.
- The report includes command runs, source report statuses, readiness snapshot, code-side status, blocker summary, release gate, and next actions.
- The report contract is included in `validation:report-contracts`.
- Customer traffic remains blocked unless `validation:business-readiness` approves it.
- Paid Atlas work remains opt-in through the existing paid validation commands.
