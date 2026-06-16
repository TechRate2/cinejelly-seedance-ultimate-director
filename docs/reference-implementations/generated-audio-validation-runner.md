# Generated Audio Validation Runner

Implementation status as of 2026-06-16: implemented as a CineJelly-owned Atlas generated-audio evidence CLI, JSON schema, package command, runtime capability config, business-readiness input, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

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
npm.cmd run validation:generated-audio -- --confirm-provider-spend --confirm-audio-schema-reviewed
npm.cmd run validation:generated-audio -- --review-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json --confirm-manual-audio-review
```

The default run writes a blocked no-spend report. A live run now uses Atlas `generateAudio` through the provider-neutral execution runner only after explicit spend confirmation, schema review confirmation, and a fresh slice-specific Atlas billing-readiness report; the returned output must still pass `GeneratedAudioOutputBatchValidator`, provider ledger checks, and manual review before business-readiness can count it. If the paid output already exists and only manual review was missing, rerun with `--review-existing-report` plus manual review evidence to update the report without another provider call.

## Done

- Done: add `ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON` runtime parsing and Atlas provider capability exposure.
- Done: add `scripts/run-atlas-generated-audio-validation.mjs`.
- Done: add `schemas/generated-audio-validation-report.schema.json`.
- Done: add `npm.cmd run validation:generated-audio`.
- Done: add schema-aware generated-audio evaluation to `validation:business-readiness`.
- Done: require generated-audio slice Atlas billing readiness before provider spend.
- Done: add no-provider review-only mode for existing paid generated-audio reports.
- Done: update README and operator runbook.

## Remaining

- Run the Atlas `generateAudio` path with explicit spend confirmation and archive the returned provider/output URL behavior.
- If Atlas returns signed audio URLs, add an approved credential-free delivery/proxy step before outputs can be mixed.
- Archive manual audio review evidence for each live generated-audio validation run.
