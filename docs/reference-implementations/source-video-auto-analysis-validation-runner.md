# Reference Implementation: Source Video Auto Analysis Validation Runner

Implementation status as of 2026-06-19: implemented as a CineJelly-owned live-validation CLI, JSON schema, package command, business-readiness input, operator documentation, plus a separate no-spend adapter smoke for backend guard behavior. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream And Provider Sources

| Source | Snapshot or docs path | License / terms | Behavior used |
| --- | --- | --- | --- |
| `HKUDS/VideoAgent` | `external/upstream/videoagent` | MIT top level; nested review required | Treat source-video understanding as bounded structured evidence before graph planning. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | Media-review and approval-gate behavior notes only; no implementation reuse. |
| `HKUDS/ViMax` | `external/upstream/vimax` | MIT | Use source-video scene/keyframe/camera structure as guidance for downstream reference scoring. |
| Atlas Cloud LLM | `https://atlascloud.ai/docs/en/models/llm` | Provider docs/terms | Validate the configured multimodal LLM path through the provider abstraction. |

## Behavior To Preserve

1. The runner must fail closed unless a clean HTTPS source video is supplied.
2. The runner must stop before FFmpeg source fetch or Atlas LLM calls unless `--confirm-provider-spend` is present.
3. Paid mode must also require `--max-cost-usd` plus a fresh matching Atlas billing-readiness report at `atlas-billing-source-video-report.json`.
4. The runner must reuse `SourceVideoAutoAnalyzer`; it must not duplicate provider payload logic.
5. The source reference must use role `source_video_structure` and must not include embedded credentials or credential-like query parameters.
6. Live validation must sample bounded frames with FFmpeg, send them through the configured Atlas LLM provider, normalize through `SourceVideoAnalyst`, and require usable analysis content.
7. The report must never expose local frame paths, inline frame data, API keys, bearer tokens, or signed source URLs.
8. Business-readiness can count this evidence only when the report schema is recognized, status is `pass`, live provider calls were allowed, the Atlas billing gate passed, and the analysis summary confirms no frame/base64 leakage.

## Reference Report Contract

```ts
type SourceVideoAutoAnalysisValidationStatus =
  | "pass"
  | "warn"
  | "fail"
  | "blocked_by_spend_confirmation"
  | "blocked_by_readiness"
  | "blocked_by_atlas_billing";

interface SourceVideoAutoAnalysisValidationReport {
  schemaVersion: "cinejelly.source-video-auto-analysis-validation.v1";
  generatedAt: string;
  status: SourceVideoAutoAnalysisValidationStatus;
  checkedInputs: {
    requestPath?: string;
    sourceReferenceLabel: string;
    sourceVideoUrl: string;
    atlasBillingReportPath: string;
    maxCostUsd?: number;
    outputPath: string;
  };
  spendGate: {
    confirmProviderSpend: boolean;
    providerNetworkCallsAllowed: boolean;
    sourceVideoFetchAllowed: boolean;
  };
  atlasBillingGate: {
    path: string;
    present: boolean;
    status: string;
    currentApprovedBudgetUsd?: number;
    maxAgeHours: number;
    canUseAsPrePaidAtlasBillingEvidence: boolean;
  };
  checks: Array<{ name: string; status: "pass" | "warn" | "fail"; message: string }>;
  analysisSummary: {
    present: boolean;
    usableContent: boolean;
    sceneCount: number;
    keyframeCount: number;
    noInlineFrameData: boolean;
    noLocalFramePaths: boolean;
  };
  providerLedger: {
    entryCount: number;
    operations: Record<string, number>;
    statuses: Record<string, number>;
  };
  releaseGateSummary: {
    canUseAsBusinessReadinessSourceVideoEvidence: boolean;
    canOpenPaidCustomerTraffic: false;
    releaseBlocker: string;
  };
  nextActions: string[];
}
```

## CineJelly Translation Plan

- Done: add `scripts/run-source-video-auto-analysis-validation.mjs`.
- Done: add `npm.cmd run validation:source-video-auto-analysis`.
- Done: add `schemas/source-video-auto-analysis-validation-report.schema.json`.
- Done: make `validation:business-readiness` evaluate the versioned source-video report explicitly.
- Done: document the spend gate, source-video billing gate, and clean-source-video requirements.
- Done: add `validation:source-video-auto-analysis-smoke` as no-spend backend evidence for adapter behavior; it is intentionally not business-readiness source-video evidence.
- Done: make `validation:report-contracts` enforce live source-video validation semantics, including spend/billing/readiness gate consistency, provider-ledger count consistency, leakage flags, clean source-video URL previews, false customer-traffic claims, and business-readiness evidence only on a passing live report.

## Validation Checklist

- Running without `--confirm-provider-spend` writes `blocked_by_spend_confirmation` and makes no provider/source-video calls.
- The runner rejects missing source-video input, non-HTTPS URLs, embedded credentials, and credential-like query parameters.
- Running with `--confirm-provider-spend` but without a fresh matching `atlas-billing-source-video-report.json` writes `blocked_by_atlas_billing` and makes no provider/source-video calls.
- Readiness blockers stop the run before provider spend.
- Readiness warnings require `--allow-warnings`.
- Live mode uses `SourceVideoAutoAnalyzer`, not custom LLM payload code.
- The report preserves provider-ledger operation counts without raw provider payloads.
- The business-readiness gate accepts only a `pass` report with usable analysis, a passing Atlas billing gate, and no frame/base64 leakage.
- Report-contract validation rejects pass reports without confirmed spend, fresh billing evidence, usable redacted analysis, consistent provider-ledger counts, and `canOpenPaidCustomerTraffic=false`.
- The smoke report must keep `canUseAsBusinessReadinessSourceVideoEvidence=false` and `canOpenPaidCustomerTraffic=false`.
