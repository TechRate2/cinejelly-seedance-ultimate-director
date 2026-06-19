# Generated Audio Validation Runner

Implementation status as of 2026-06-19: implemented as a CineJelly-owned Atlas generated-audio evidence CLI, JSON schema, package command, runtime capability config, business-readiness input, operator documentation, and a no-spend Atlas audio polling resilience smoke. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Source Pattern

| Source | Use |
| --- | --- |
| `harry0703/MoneyPrinterTurbo` | Explicit audio/TTS stage and operator-visible audio evidence. |
| `vericontext/vibeframe` | Validate-before-spend report discipline, redacted run evidence, and business gate separation. |
| `calesthio/OpenMontage` | Manual approval concepts as AGPL-aware behavior notes only. |
| Atlas Cloud docs | Current API-key, media base URL, async prediction, and `xai/tts-v1` request/pricing evidence. |

## Contract

The runner must:

1. Write `schemaVersion: "cinejelly.generated-audio-validation.v1"`.
2. Block before provider execution unless `--confirm-provider-spend` is present.
3. Block business evidence unless `--confirm-audio-schema-reviewed` is present.
4. Read generated-audio capability records from `ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON`.
5. Plan the validation intent through `GeneratedAudioExecutionPlanner` before any provider call.
6. Run only ready generated-audio execution-plan items through `GeneratedAudioProviderExecutionRunner`.
7. Validate provider results through `GeneratedAudioOutputBatchValidator`.
8. Redact secrets, signed URL query values, raw keys, and provider credentials from report output.
9. Require manual generated-audio review evidence before business-readiness can pass.
10. Never count generated-audio as business-ready unless provider execution, output batch validation, provider ledger, schema review, and manual review all pass.
11. Before provider execution, require a fresh Atlas billing-readiness report for the generated-audio slice whose `plannedCostUsd` matches the current audio estimate and whose approved budget covers `--max-cost-usd`.
12. Manual review can be applied to an existing paid generated-audio report with `--review-existing-report` without calling Atlas again; this review-only path must still fail unless the existing report has provider-spend, billing, schema, execution, output-batch, and ledger evidence.
13. Retryable Atlas polling failures must not immediately fail an active generated-audio prediction before the overall polling timeout; the no-spend polling-resilience smoke covers this backend condition separately from paid media-quality evidence.
14. A structured Atlas prediction body that reports terminal `failed` must become terminal provider evidence even when Atlas returns that body with an HTTP error status.
15. A paid generated-audio report that timed out or was aborted while the provider prediction was still active can be resumed by prediction id without submitting another Atlas generation job.
16. Manual review for business evidence must use either structured `cinejelly.generated-audio-manual-review.v1` JSON evidence or a confirmed legacy review note; a flag by itself must not pass manual review.
17. The generated-audio manual-review draft helper must create `needs_review` operator files only, and copied draft files must be rejected by the final manual-review schema until a real reviewer fills accepted evidence.
18. Structured manual review evidence must include generated-audio artifact evidence captured from the already-generated clean output URL, including report path, local artifact path, SHA-256, byte size, duration, output URL, and prediction id, and the review-existing validator must reject drift from that artifact evidence report.
19. The generated-audio manual-review readiness helper must be no-spend/no-network and distinguish `ready_for_manual_review` from accepted review evidence; it may prove provider and artifact evidence are ready, but it must not approve business-readiness generated audio or customer traffic by itself.

## Report Shape

```ts
interface GeneratedAudioValidationReport {
  schemaVersion: "cinejelly.generated-audio-validation.v1";
  status:
    | "pass"
    | "warn"
    | "fail"
    | "blocked_by_spend_confirmation"
    | "blocked_by_schema_review"
    | "blocked_by_configuration"
    | "blocked_by_atlas_billing"
    | "blocked_by_budget";
  checkedInputs: {
    modelId: string;
    textCharacterCount: number;
    language: string;
    voiceId: string;
    outputFormat: "mp3" | "wav";
    durationSeconds: number;
    estimatedCostUsd: number;
    reviewExistingReportPath?: string;
  };
  spendGate: {
    confirmProviderSpend: boolean;
    providerNetworkCallsAllowed: boolean;
    estimatedCostUsd: number;
    maxCostUsd: number;
  };
  atlasBillingGate: {
    path: string;
    present: boolean;
    status: string;
    currentEstimatedCostUsd: number;
    currentMaxCostUsd: number;
    canUseAsPrePaidAtlasBillingEvidence: boolean;
  };
  schemaGate: {
    confirmAudioSchemaReviewed: boolean;
    requestedModelId: string;
    requestedLanguage: string;
    requestedVoiceId: string;
    requestedCodec: "mp3" | "wav";
  };
  planning: object;
  executionRun: object;
  outputBatchValidation: object;
  providerLedger: object;
  manualAudioReview: object;
  releaseGateSummary: {
    canUseAsBusinessReadinessGeneratedAudioEvidence: boolean;
    canOpenPaidCustomerTraffic: false;
    releaseBlocker: string;
  };
}
```

## CLI

```powershell
npm.cmd run validation:generated-audio
npm.cmd run validation:generated-audio-polling-resilience
npm.cmd run validation:generated-audio-artifact
npm.cmd run validation:generated-audio-artifact -- --confirm-live-network
npm.cmd run validation:generated-audio-review-draft
npm.cmd run validation:generated-audio-review-readiness
npm.cmd run validation:generated-audio -- --confirm-provider-spend --confirm-audio-schema-reviewed
npm.cmd run validation:generated-audio -- --confirm-provider-spend --confirm-audio-schema-reviewed --resume-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json
npm.cmd run validation:generated-audio -- --review-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json --manual-audio-review ops/generated-audio-manual-review.json --confirm-manual-audio-review
```

The default run writes a blocked no-spend report. A live run now uses Atlas `generateAudio` through the provider-neutral execution runner only after explicit spend confirmation, schema review confirmation, and a fresh slice-specific Atlas billing-readiness report; the returned output must still pass `GeneratedAudioOutputBatchValidator`, provider ledger checks, artifact capture, and manual review before business-readiness can count it. The current default validation voice is Atlas' documented multilingual `eve`; language-specific voices must be verified before they are used as defaults. If a paid provider prediction is still active when validation times out, rerun with `--resume-existing-report` or `--resume-prediction-id` to poll the existing prediction instead of submitting a second job. If the paid output already exists and only manual review was missing, run `validation:generated-audio-artifact -- --confirm-live-network`, run `validation:generated-audio-review-draft`, listen to the output, fill `ops/generated-audio-manual-review.json` with the artifact evidence block, and rerun with `--review-existing-report --manual-audio-review ... --confirm-manual-audio-review` to update the report without another provider call.

## Done

- Done: add `ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON` runtime parsing and Atlas provider capability exposure.
- Done: add `scripts/run-atlas-generated-audio-validation.mjs`.
- Done: add `schemas/generated-audio-validation-report.schema.json`.
- Done: add `npm.cmd run validation:generated-audio`.
- Done: add schema-aware generated-audio evaluation to `validation:business-readiness`.
- Done: require generated-audio slice Atlas billing readiness before provider spend.
- Done: add no-provider review-only mode for existing paid generated-audio reports.
- Done: add `validation:generated-audio-polling-resilience` plus schema/report-contract coverage for retryable Atlas polling failures without spend.
- Done: add resume polling for existing Atlas generated-audio prediction IDs without resubmitting generation.
- Done: classify structured terminal failed prediction bodies as terminal provider evidence even when Atlas returns them with HTTP error status.
- Done: add structured generated-audio manual review schema plus no-spend draft template/checklist generation.
- Done: add generated-audio artifact evidence capture so structured manual review can bind to SHA-256/duration evidence from the exact reviewed audio bytes.
- Done: add no-spend generated-audio manual-review readiness validation so launch doctor can show when provider output and artifact evidence are ready but listening approval is still missing.
- Done: add report-contract coverage for the ignored raw `ops/generated-audio-manual-review.json` packet when it exists, including accepted/pass status, required listening checks, artifact binding/evidence consistency, clean output URL previews, safe repo-relative paths, positive media metadata, and redacted non-placeholder findings.
- Done: update README and operator runbook.

## Remaining

- Archive generated-audio artifact evidence and manual audio review evidence for the live Atlas `eve` generated-audio output that already passed provider execution, output-batch validation, and provider ledger checks on 2026-06-19.
- If Atlas returns signed audio URLs, add an approved credential-free delivery/proxy step before outputs can be mixed.
- Verify any language-specific Atlas voice id, such as Vietnamese `Mai`, before making it a default or exposing it in commercial presets.
