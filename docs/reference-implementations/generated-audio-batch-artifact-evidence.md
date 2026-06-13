# Reference Implementation: Generated Audio Batch Artifact Evidence

Implementation status as of 2026-06-14: implemented foundation for optional durable artifact evidence that records generated-audio output batch validation after provider-backed audio execution exists, including review-packet planning evidence so operators can see the same batch status without opening the raw artifact file. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The artifact and review-packet paths must not call providers, download media, inspect waveform metadata, or create generated audio files.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` | MIT | Task-stage outputs and terminal failures remain visible through operator-facing state. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/voice.py` | MIT | Voice/audio stage artifacts are distinct from final video composition. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/video.py` | MIT | Final composition consumes prepared media evidence rather than opaque provider state. |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Deterministic artifact/report discipline keeps release evidence reviewable. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Approval and sample-before-batch concepts are used only as behavior notes for generated-media release gates. |

## Behavior To Preserve

1. Generated-audio batch validation evidence is durable and reviewable when provider-backed generated-audio results exist.
2. The artifact is optional until a verified generated-audio provider execution stage produces real `AudioGenerationResult` objects.
3. The artifact must not be required for planned-only runs, blocked runs, or current no-spend generated-audio provider boundaries.
4. When present, the artifact status, ready intent count, result count, approved track count, issue count, and report counts must be internally consistent.
5. The artifact must cross-check against `postproduction-assets.json` generated-audio intent and ready/blocked counts.
6. The artifact must cross-check against `run-summary.json` so public release evidence cannot drift from persisted validation evidence.
7. The review packet must expose whether generated-audio batch validation evidence exists, plus status/result/approved-track/issue counts when present.
8. `review-packet.json` must route rejected batch evidence to blocked status, and review-required or partially-approved evidence to review-required status.
9. Approved tracks in the artifact must be credential-free HTTPS or already redacted by the artifact writer; unsafe/signed URL evidence must fail artifact validation.
10. `review_required`, `partially_approved`, and `rejected` statuses stay explicit. Partial success must not be treated as full release readiness.
11. Artifact validation does not rerun provider execution or media inspection; it validates persisted evidence shape, counts, redaction, and cross-artifact consistency.

## Edge Cases

- No generated-audio intents: no batch artifact is required.
- Generated-audio intents are planned-only or blocked before provider execution: no batch artifact is required.
- Ready intents exist but no provider-backed result stage has run: no batch artifact is required, but release remains blocked elsewhere by no provider execution claim.
- Artifact is present with `readyIntentCount` different from `postproduction-assets.json.generatedAudio.readyIntentCount`: fail.
- Artifact is present with `intentCount` different from `postproduction-assets.json.generatedAudio.intentCount`: fail.
- Review packet says batch evidence exists but the batch artifact is missing: fail.
- Batch artifact exists but review packet planning status/counts do not match the batch artifact: fail.
- Artifact status is `approved` but `approvedTrackCount !== readyIntentCount`: fail.
- Artifact status is `not_requested` but result count or approved track count is non-zero: fail.
- Artifact has `issueCount` not equal to `issues.length`: fail.
- Artifact has `reports.length !== reviewRequiredReportCount + rejectedReportCount + approved report count`: fail through report shape/count checks.
- Artifact contains `data:` URIs, local paths, embedded credentials, or signed/credential query parameters: fail through existing artifact redaction checks.

## Reference Implementation

```ts
function persistGeneratedAudioBatchEvidence(input: {
  result: DirectorRunResult;
  payloads: ProjectArtifactPayload[];
  runSummary: Record<string, unknown>;
}) {
  const batch = input.result.generatedAudioOutputBatchValidation;
  if (!batch) {
    input.runSummary.hasGeneratedAudioOutputBatchValidation = false;
    return;
  }

  input.runSummary.hasGeneratedAudioOutputBatchValidation = true;
  input.runSummary.generatedAudioOutputBatchStatus = batch.status;
  input.runSummary.generatedAudioResultCount = batch.resultCount;
  input.runSummary.generatedAudioApprovedTrackCount = batch.approvedTrackCount;
  input.runSummary.generatedAudioBatchIssueCount = batch.issueCount;

  input.payloads.push({
    kind: "generated_audio_output_batch_validation",
    fileName: "generated-audio-output-batch-validation.json",
    value: batch
  });
}

function addGeneratedAudioBatchReviewEvidence(input: {
  result: DirectorRunResult;
  planning: ReviewPacketPlanning;
  recommendations: Set<string>;
}) {
  const batch = input.result.generatedAudioOutputBatchValidation;
  input.planning.hasGeneratedAudioOutputBatchValidation = Boolean(batch);
  if (!batch) return;

  input.planning.generatedAudioOutputBatchStatus = batch.status;
  input.planning.generatedAudioResultCount = batch.resultCount;
  input.planning.generatedAudioApprovedTrackCount = batch.approvedTrackCount;
  input.planning.generatedAudioOutputBatchIssueCount = batch.issueCount;

  for (const issue of batch.issues) input.recommendations.add(issue.repair);
  for (const report of batch.reports) {
    for (const issue of report.issues) input.recommendations.add(issue.repair);
  }
}

function validateGeneratedAudioBatchArtifact(input: {
  postproductionAssetPlan: PostproductionAssetPlan;
  runSummary: Record<string, unknown>;
  batchArtifact?: GeneratedAudioOutputValidationBatchReport;
}) {
  const batch = input.batchArtifact;
  if (!batch) {
    return pass("generated_audio_output_batch_validation_optional");
  }

  require(batch.intentCount === input.postproductionAssetPlan.generatedAudio.intentCount);
  require(batch.readyIntentCount === input.postproductionAssetPlan.generatedAudio.readyIntentCount);
  require(batch.issueCount === batch.issues.length);
  require(batch.reports.length >= batch.approvedTrackCount);
  require(batch.audioTracks.length === batch.approvedTrackCount);
  require(input.runSummary.generatedAudioOutputBatchStatus === batch.status);
  require(input.runSummary.generatedAudioApprovedTrackCount === batch.approvedTrackCount);
}
```

## CineJelly Translation Plan

- Add `generated_audio_output_batch_validation` as an optional `ProjectArtifactKind`.
- Add optional `generatedAudioOutputBatchValidation` to `DirectorRunResult`.
- When the optional report exists, write `generated-audio-output-batch-validation.json` during success artifact persistence.
- Add run-summary fields that expose whether batch evidence exists and summarize its status/counts.
- Add review-packet planning fields that expose whether batch evidence exists and summarize its status/counts.
- Route batch `rejected` to blocked review-packet status, and batch `review_required` or `partially_approved` to review-required.
- Add batch issue repair text to review-packet recommendations.
- Extend `ProjectArtifactValidator` to validate generated-audio batch artifact shape and cross-check it against `postproduction-assets.json` and `run-summary.json`.
- Extend artifact validation cross-checks to compare `review-packet.json` planning fields against the batch artifact when it exists.
- Keep the artifact optional until verified provider-backed generated-audio execution exists.
- Update roadmap, snapshot inventory, source-lineage records, and operator docs.

## Validation Checklist

- Reference Implementation exists before production changes.
- Optional artifact absence does not fail current planned-only/no-spend generated-audio runs.
- Present artifact validates allowed statuses, non-negative integer counts, issue/report shape, and approved track count.
- Present artifact cross-checks intent and ready counts with `postproduction-assets.json`.
- Present artifact cross-checks summary fields with `run-summary.json`.
- Present artifact cross-checks planning fields with `review-packet.json`.
- Review packet status and recommendations reflect rejected, review-required, or partially-approved batch evidence.
- Artifact validation relies on persisted evidence only; it does not call providers, download media, inspect waveform data, or create generated audio.
- No production runtime import from `external/upstream/`.

Local validation on 2026-06-14:

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- A no-network smoke through `ProjectArtifactStore`, `ReviewPacketBuilder`, and `ProjectArtifactValidator` confirmed a present generated-audio batch report writes `generated-audio-output-batch-validation.json`, exposes matching `review-packet.json` planning status/count evidence, validates without batch-related failures, routes rejected batch evidence to `blocked`, routes partially approved batch evidence to `review_required`, carries batch and result-level repair recommendations, and produces `generated_audio_output_batch_consistency` failures when run-summary/review-packet evidence claims a missing batch artifact.
