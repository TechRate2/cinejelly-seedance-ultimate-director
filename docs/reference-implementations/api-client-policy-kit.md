# API Client Policy Kit

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js operator helper, JSON schema, package command, and runbook documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Purpose

Commercial traffic needs per-client API key policy, quota limits, and a persistent usage ledger before render requests can spend provider credits. Operators should not have to hand-hash client keys or paste raw keys into `CINEJELLY_API_CLIENTS_JSON`.

## Rules

1. The helper must not call Atlas, deployment endpoints, render routes, stock providers, or billing provider APIs.
2. `client-policy.json` must store only SHA-256 key digests, never raw client API keys.
3. The report must not include raw keys or key digests.
4. Raw generated keys may be written only to an ignored `.secret.txt` file for secure handoff, and operators must move that value into their onboarding system.
5. Generated policy fields must match `schemas/api-client-policies.schema.json` and the `ApiClientPolicyGate` parser.
6. Existing policy arrays may be appended only when client IDs and key digests remain unique.
7. Applying the generated env snippet must preserve existing Atlas keys and deployment tokens, import only the three allowed client-policy env variables, and create an ignored backup by default.

## Delivered Implementation

- Done: add `scripts/create-api-client-policy-kit.mjs`.
- Done: add `npm.cmd run ops:create-client-policy`.
- Done: add `schemas/api-client-policy-kit.schema.json`.
- Done: add `scripts/apply-client-policy-env.mjs`, `npm.cmd run ops:apply-client-policy-env`, and `schemas/client-policy-env-apply.schema.json`.
- Done: document the helper in `README.md` and `docs/OPERATOR_RUNBOOK.md`.

## Acceptance Checks

- Generated policy JSON includes `clientId`, `keySha256`, enabled flag, monthly request/cost limits, per-request/default reserved-cost limits, duration limit, allowed tiers, and allowed quality modes.
- The generated report names output files and policy limits but omits raw key material and key digests.
- `--no-secret-file` allows CI/smoke usage without writing raw keys.
- Duplicate client IDs or duplicate key digests fail before writing the output policy.
- Env apply imports only `CINEJELLY_API_CLIENTS_JSON`, `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER`, and `CINEJELLY_CLIENT_USAGE_LEDGER_PATH`.
