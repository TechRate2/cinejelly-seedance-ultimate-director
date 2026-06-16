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
    | "blocked_by_budget";
  checkedInputs: {
    modelId: string;
    textCharacterCount: number;
    language: string;
    voiceId: string;
    outputFormat: "mp3" | "wav";
    durationSeconds: number;
    estimatedCostUsd: number;
  };
  spendGate: {
    confirmProviderSpend: boolean;
    providerNetworkCallsAllowed: boolean;
    estimatedCostUsd: number;
    maxCostUsd: number;
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
```

The default run writes a blocked no-spend report. A live run now uses Atlas `generateAudio` through the provider-neutral execution runner only after explicit spend and schema review confirmation; the returned output must still pass `GeneratedAudioOutputBatchValidator`, provider ledger checks, and manual review before business-readiness can count it.

## Done

- Done: add `ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON` runtime parsing and Atlas provider capability exposure.
- Done: add `scripts/run-atlas-generated-audio-validation.mjs`.
- Done: add `schemas/generated-audio-validation-report.schema.json`.
- Done: add `npm.cmd run validation:generated-audio`.
- Done: add schema-aware generated-audio evaluation to `validation:business-readiness`.
- Done: update README and operator runbook.

## Remaining

- Run the Atlas `generateAudio` path with explicit spend confirmation and archive the returned provider/output URL behavior.
- If Atlas returns signed audio URLs, add an approved credential-free delivery/proxy step before outputs can be mixed.
- Archive manual audio review evidence for each live generated-audio validation run.
