# Reference Implementation: Remote Stock Provider Validation Runner

Implementation status as of 2026-06-19: implemented as a CineJelly-owned live-network validation CLI, JSON schema, package command, business-readiness input, operator documentation, plus a separate no-spend adapter smoke for backend provider-boundary behavior. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream And Provider Sources

| Source | Snapshot or docs path | License / terms | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Treat stock retrieval as a visible source-material stage before composition. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Preserve deterministic validation reports before release approval. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | Approval-gate behavior notes only; no implementation reuse. |
| Pexels API docs | `https://www.pexels.com/api/documentation/` | Pexels API terms | Video search uses `Authorization` header and `/v1/videos/search`. |
| Pixabay API docs | `https://pixabay.com/api/docs/` | Pixabay Content License/API terms | Video search uses `/api/videos/` with `key`, `q`, `safesearch`, `per_page`, and rendition metadata. |
| Coverr API docs | `https://api.coverr.co/docs/videos/` | Coverr API terms | `urls=true` can return signed URLs; CineJelly must reject credential-bearing candidate URLs. |

## Behavior To Preserve

1. The runner must stop before any provider request unless `--confirm-live-network` is present.
2. Commercial-readiness evidence must require `--confirm-commercial-terms-reviewed`.
3. Runtime provider config remains the source of truth; keys come from env only and never appear in reports.
4. Live validation must reuse `RemoteStockMaterialAdapter` and `MaterialSourceValidator`.
5. Pexels, Pixabay, and commercially approved Coverr providers are validated only when configured.
6. Candidate media/source/preview URLs must be credential-free HTTPS URLs with no signed or secret query keys.
7. Attribution-required candidates must include attribution evidence.
8. Business-readiness can count the evidence only when every configured provider returns approved/attribution-ready candidates and combined material validation is `approved`.

## Reference Report Contract

```ts
type RemoteStockValidationStatus =
  | "pass"
  | "warn"
  | "fail"
  | "blocked_by_network_confirmation"
  | "blocked_by_configuration";

interface RemoteStockValidationReport {
  schemaVersion: "cinejelly.remote-stock-validation.v1";
  generatedAt: string;
  status: RemoteStockValidationStatus;
  liveNetworkGate: {
    confirmLiveNetwork: boolean;
    providerNetworkCallsAllowed: boolean;
    confirmCommercialTermsReviewed: boolean;
  };
  providers: Array<{
    source: "pexels" | "pixabay" | "coverr";
    status: "pass" | "warn" | "fail";
    candidateCount: number;
    approvedCandidateCount: number;
    validationStatus: "planned_only" | "approved" | "review_required" | "rejected";
  }>;
  materialValidation: {
    status: "planned_only" | "approved" | "review_required" | "rejected";
    candidateCount: number;
    approvedCandidateCount: number;
  };
  releaseGateSummary: {
    canUseAsBusinessReadinessRemoteStockEvidence: boolean;
    canOpenPaidCustomerTraffic: false;
    releaseBlocker: string;
  };
}
```

## CineJelly Translation Plan

- Done: add `scripts/run-remote-stock-validation.mjs`.
- Done: add `npm.cmd run validation:remote-stock`.
- Done: add `schemas/remote-stock-validation-report.schema.json`.
- Done: make `validation:business-readiness` evaluate the versioned remote-stock report explicitly.
- Done: document the live-network and commercial-terms confirmation gates.
- Done: add `validation:remote-stock-adapter-smoke` as no-spend backend evidence for adapter behavior; it is intentionally not live remote-stock provider evidence.
- Done: make `validation:report-contracts` enforce live remote-stock validation semantics, including network/configuration gate consistency, commercial-terms confirmation, provider/material count consistency, raw URL/secret redaction, false customer-traffic claims, and business-readiness evidence only on a passing live report.

## Validation Checklist

- Running without `--confirm-live-network` writes `blocked_by_network_confirmation` and makes no provider calls.
- Missing `CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS=true` fails before provider calls.
- Missing approved provider keys fail before provider calls.
- Live mode calls only configured providers.
- Reports omit raw provider keys and outbound Pixabay key URLs.
- Reports include only host-level candidate samples, not full signed URLs.
- Coverr signed/tokenized media URLs cannot satisfy evidence; they must be rejected by the adapter/validator path.
- Business-readiness accepts only a `pass` report with confirmed terms, live network, approved candidates, and combined material validation status `approved`.
- Report-contract validation rejects pass reports without confirmed live-network and commercial-terms gates, passing provider summaries, approved aggregate material validation, provider/material count agreement, no raw URL/secret leakage, and `canOpenPaidCustomerTraffic=false`.
