# Reference Implementation: Billing Admin Operations Evidence

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js evidence script, JSON schema, package command, business-readiness input, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Release gates should fail closed until operator evidence is archived. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | API/CLI operational discipline for customer-facing video jobs. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | MIT | Evidence-first production handoff and approval records. |

## Behavior To Preserve

1. The evidence capture must be no-spend and must never call Atlas, render endpoints, billing provider APIs, or customer payment APIs.
2. CineJelly-side quota controls are necessary but not sufficient for billing readiness.
3. Passing evidence requires client API policy enforcement, writable usage ledger, enabled customer policies, deployment admin diagnostics, and a non-secret operator attestation for external billing/account lifecycle controls.
4. Reports must never include raw client API keys, SHA-256 key digests, bearer tokens, payment credentials, or customer payment records.
5. Localhost admin checks are useful smoke evidence but cannot satisfy the commercial billing/admin gate.
6. Missing or weak evidence must fail closed with concrete next actions.

## Attestation Contract

The operator-owned attestation file is non-secret JSON. It records that billing, account lifecycle, refunds, taxes, support, and emergency disable procedures exist outside the render engine.

```json
{
  "schemaVersion": "cinejelly.billing-admin-attestation.v1",
  "approvedAt": "2026-06-16T00:00:00.000Z",
  "approvedBy": "Operations owner name or team",
  "customerTrafficMode": "pilot_contract",
  "billingProvider": "manual_contract",
  "termsUrl": "https://example.com/terms",
  "privacyUrl": "https://example.com/privacy",
  "refundPolicyUrl": "https://example.com/refunds",
  "taxHandlingOwner": "Finance/tax owner",
  "supportContact": "support@example.com",
  "accountLifecycle": {
    "provisioning": "How paid customers are approved and issued keys.",
    "suspension": "How customers are suspended for abuse/non-payment.",
    "apiKeyRotation": "How customer keys are rotated or revoked.",
    "refundHandling": "How refund requests are triaged and recorded.",
    "chargebackHandling": "How chargebacks are handled."
  },
  "spendControls": {
    "requiresClientPolicy": true,
    "emergencyDisableProcedure": "How all customer rendering is paused quickly.",
    "quotaReviewCadence": "How often quota and ledger usage are reviewed."
  }
}
```

## Reference Implementation

```ts
type BillingAdminOpsStatus = "pass" | "warn" | "fail";

interface BillingAdminOpsReport {
  schemaVersion: "cinejelly.billing-admin-ops.v1";
  generatedAt: string;
  status: BillingAdminOpsStatus;
  environmentKind: "deployment" | "local";
  checks: Array<{
    name: string;
    status: BillingAdminOpsStatus;
    message: string;
  }>;
  clientPolicy: {
    configured: boolean;
    requireClientPolicyForRender?: boolean;
    usageLedgerConfigured?: boolean;
    clientCount?: number;
    enabledClientCount?: number;
  };
  attestation: {
    configured: boolean;
    billingProvider?: string;
    customerTrafficMode?: "paid_customer" | "pilot_contract";
  };
  adminEndpoint: {
    captured: boolean;
    httpStatus?: number;
  };
  releaseGateSummary: {
    canUseAsBusinessReadinessBillingEvidence: boolean;
    canOpenPaidCustomerTraffic: false;
    releaseBlocker: string;
  };
  nextActions: string[];
}
```

## CineJelly Translation Plan

- Done: add `scripts/capture-billing-admin-ops.mjs`.
- Done: add `npm.cmd run validation:billing-admin-ops`.
- Done: add `schemas/billing-admin-ops-report.schema.json`.
- Done: add `scripts/create-api-client-policy-kit.mjs`, `scripts/apply-client-policy-env.mjs`, `scripts/promote-operator-attestations.mjs`, `npm.cmd run ops:create-client-policy`, `npm.cmd run ops:apply-client-policy-env`, `npm.cmd run ops:promote-attestations`, `schemas/api-client-policy-kit.schema.json`, `schemas/client-policy-env-apply.schema.json`, and `schemas/operator-attestation-promotion-report.schema.json` so operators can generate digest-only client policy kits, merge them into ignored local deployment env, and promote completed non-secret attestations without hand-hashing raw keys or creating fake release evidence.
- Done: add `schemas/billing-admin-attestation.schema.json`, `schemas/api-client-policies.schema.json`, and no-spend `npm.cmd run validation:ops-config` pre-capture validation/draft tooling. With `--write-drafts`, the tooling also writes a Markdown fill-out packet under `assets/output_deliverables/business-readiness/operator-drafts` so operators can complete the non-secret draft fields without treating the drafts as release evidence.
- Done: add report-contract coverage for the ignored raw `ops/billing-admin-attestation.json` packet when it exists, including clean Terms/Privacy/Refund URLs, non-placeholder owner/procedure text, required client-policy enforcement, and secret/signed-URL rejection.
- Done: make `validation:business-readiness` evaluate the versioned billing/admin report explicitly.
- Done: document the non-secret attestation contract.

## Validation Checklist

- Missing `CINEJELLY_API_CLIENTS_JSON` fails.
- `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=false` fails for commercial readiness.
- Missing writable `CINEJELLY_CLIENT_USAGE_LEDGER_PATH` fails.
- Enabled client policies without request, reserved-cost, duration, tier, or quality limits fail.
- Missing attestation fails.
- `validation:report-contracts` validates the raw ignored attestation when present before later billing/admin evidence can trust it.
- Missing real HTTPS deployment admin endpoint capture fails.
- The report redacts token-like fields and omits raw client keys/key digests.
