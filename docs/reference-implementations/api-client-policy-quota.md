# Reference Implementation: API Client Policy And Quota Gate

Implementation status as of 2026-06-16: implemented as CineJelly-owned API auth extensions, client policy parsing, pre-provider quota reservation, client-scoped async job visibility, admin diagnostics, runtime preflight checks, and no-spend smoke validation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Cost-gate and report-first discipline before expensive video work. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Operator-configured production controls before long-running video jobs. |

## Behavior To Preserve

1. Customer render access must use per-client API keys represented by SHA-256 digests in configuration.
2. Client policy must be checked after request admission/path normalization and before runtime creation or provider spend.
3. Quota reservations must be idempotency-aware for async render submissions; replayed requests must not double-reserve.
4. Client keys must only see their own async job records.
5. Deployment/admin token can inspect policy diagnostics, but client keys cannot.
6. Usage ledger records must not contain raw client keys, provider secrets, local artifact paths, or customer media.
7. The feature is a pre-provider safety gate. It does not replace a full billing provider, invoicing, refunds, tax, or account lifecycle system.

## Reference Implementation

```ts
interface ApiClientPolicy {
  clientId: string;
  keySha256: string;
  enabled: boolean;
  monthlyRequestLimit?: number;
  monthlyReservedCostUsdLimit?: number;
  maxReservedCostUsdPerRequest?: number;
  defaultReservedCostUsdPerRequest?: number;
  maxDurationTargetSeconds?: number;
  allowedTiers?: SpeedTier[];
  allowedQualityModes?: QualityMode[];
}

function reserveBeforeProviderSpend(input: RenderRequest): Reservation {
  const principal = authGuard.authorize(input.headers);
  const policy = policyStore.requireClientPolicy(principal);
  const normalizedSettings = normalizeSeedanceSettings(input.body.settings);
  policy.assertAllowed(normalizedSettings);
  return policy.reserveMonthlyQuota({
    requestId: input.requestId,
    reservedCostUsd: input.body.settings.maxCostUsd ?? policy.defaultReservedCostUsdPerRequest
  });
}
```

## CineJelly Translation Plan

- Done: add client API key digest support to `ApiAuthGuard`.
- Done: add `ApiClientPolicyGate` with monthly request and reserved-cost limits.
- Done: reserve quota before synchronous render runtime creation.
- Done: reserve quota before async job enqueue, without double-counting idempotent replays.
- Done: scope async job list/get/cancel to the authenticated client.
- Done: expose deployment-token-only `/v1/admin/client-policy` diagnostics without key digests.
- Done: add runtime preflight validation for client policy configuration.
- Done: add no-spend `validation:client-policy-smoke`.

## Validation Checklist

- Client key authorization uses SHA-256 digests and timing-safe comparison.
- Disabled or unknown client keys cannot render.
- Missing client policy blocks render when `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true`.
- Client policy blocks disallowed tier, quality, duration, per-request reserved cost, monthly request quota, and monthly reserved-cost quota.
- Usage ledger contains client ID, request ID, month, and reserved cost only; it does not contain raw keys.
- Async idempotency replay returns the existing job without a new quota reservation.
- Client job polling cannot access another client's job record.
- Admin policy diagnostics require the deployment API token.
- No production runtime import from `external/upstream/`.
