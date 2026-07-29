# Director-Style Benchmark Harness

Implementation status as of 2026-06-19: implemented as a CineJelly-owned TypeScript evaluator, local media-evidence collector with FFprobe, sampled-frame, transition-boundary, bounded FFmpeg audio waveform/volume proxy signals, and FFprobe audio-video duration sync proxy signals, structured semantic-review normalizer, structured audio-review normalizer, structured runtime ASR/lip-sync review normalizer, structured governance-review normalizer, shared paid-artifact binding checks for structured review packets, artifact-bound review draft generator, accepted review-evidence readiness validator with self-contained schema/redaction enforcement, unsafe-review guard smoke, bounded review-text redaction helper, generated-audio validation report normalizer with manual-review artifact SHA binding checks, long-form validation report normalizer with artifact-bound manual-review checks, long-form manual quality/redaction review draft helper, parity evidence matrix, no-spend CLI, JSON schemas, report-contract entries, source lineage record, and package command. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Source Logic

| Source | Local snapshot path | License state | Behavior used |
| --- | --- | --- | --- |
| `jiaminchen-1031/DirectorBench` | `external/upstream/directorbench` | No top-level license found in snapshot | Evaluation dimensions, checkpoint-style metric records, confidence-weighted aggregation, optional/skipped audio handling, bottleneck reporting, and append-only report history. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Deterministic report discipline and validate-before-release evidence boundaries. |

## Preserved Behavior

1. Keep script, video, audio, stability, and cross-modal dimensions separate instead of hiding quality behind one opaque score.
2. Score each metric with normalized score, confidence, evidence, suggestions, and limitations.
3. Exclude absent audio metrics when the render intentionally has no audio evidence.
4. Aggregate metric scores by confidence, then aggregate dimensions by profile weights.
5. Surface bottlenecks when score or confidence is below the release threshold.
6. Support append-only JSONL history so repeated benchmark runs do not overwrite previous evidence.
7. Emit a parity evidence matrix that separates met, partial, and missing requirements before any DirectorBench-style parity claim.

## CineJelly Changes

1. No DirectorBench Python code, LangGraph graph, OpenCV routines, prompts, or agent implementations are copied or executed.
2. The current harness reads CineJelly paid-render evidence, request evidence, optional manual review text, optional structured semantic review JSON, optional structured audio review JSON, optional structured ASR/lip-sync runtime review JSON, optional structured governance review JSON, optional generated-audio validation report JSON, optional long-form validation report JSON, and optional local rendered media.
3. Local media evidence is limited to FFprobe delivery metadata, bounded sampled-frame RGB signals, FFmpeg scene-change transition-boundary pre/post RGB proxies, FFmpeg `volumedetect` audio waveform/volume proxy signals, and FFprobe audio-video duration-delta proxy signals; sampled frame paths and raw audio bytes are never stored in reports.
4. `validation:quality-review-drafts` can prepare semantic/audio/runtime/governance JSON drafts with the paid-render artifact binding prefilled, but every generated checkpoint is `needs_review`; drafts are operator handoff artifacts, not accepted evidence.
5. `validation:quality-review-evidence` reads the semantic/audio/runtime/governance review packet bundle and reports whether all four packets are present, schema/redaction safe, explicitly `accepted`, complete for required checkpoint names, and bound to the paid-render project, request, and deliverable fingerprint before benchmark rows can treat them as accepted review evidence.
6. Structured semantic review evidence can raise or lower the affected visual/cross-modal checkpoint scores, structured audio review evidence can raise or lower narration/BGM/audio cross-modal checkpoints, structured runtime review evidence can raise or lower ASR transcript-alignment and lip-sync timing checkpoints, structured governance review evidence can satisfy the license/runtime permission parity row only when every required governance check is accepted, generated-audio validation evidence can satisfy the provider-backed audio row only when spend, billing, schema, execution, output-batch, ledger, manual listening, and artifact SHA binding gates are all accepted, long-form validation evidence can satisfy long-form duration/manual-review rows only when budget, billing, paid-render, artifact, duration, cost-ledger, and manual quality-review gates are all accepted and the manual review is bound to the same paid artifact fingerprints, `validation:long-form-review-draft` can prepare but not accept that manual review handoff, and waveform/duration-sync proxy evidence can only provide low-confidence structural audio support when review JSON is absent; all remain bounded checkpoint evidence rather than full DirectorBench runtime parity.
7. Structured semantic, audio, runtime, and governance review packets may contribute checkpoint evidence without a binding, but they can satisfy parity rows only when `artifactBinding.projectId`, `artifactBinding.requestId`, and `artifactBinding.deliverableSha256` match the paid-render report under evaluation.
8. Structured semantic/audio/runtime/governance review summaries and findings are bounded to safe aggregate text. Local paths, signed or raw URLs, data URIs, bearer tokens, API keys, and credential-like strings are rejected by input schemas, rejected directly by report-contract raw packet guards and the accepted-review readiness validator, and dropped by normalizers before benchmark reports are written.
9. Raw Director-style review packets can be incomplete handoff material only while they remain `needs_review` or `rejected`; if they claim `accepted`, report-contract validation requires every required checkpoint/check to be accepted, artifact binding to contain projectId, requestId, and deliverableSha256, positive reviewed-evidence counts for semantic/audio/runtime packets, and no duplicate checkpoint names.
9. It performs no provider calls, no media downloads, no deployment calls, no Atlas calls, and no paid validation.
10. It always reports `canClaimDirectorBenchParity=false` because local proxies, draft packets, and structured review packets do not replace automated VLM, ASR, lip-sync, generated-audio provider evidence, live long-form paid evidence, or the remaining non-met parity rows.
11. It is allowed to produce useful backend evidence, but it cannot approve customer traffic by itself.
12. `parityEvidenceMatrix` records 12 required evidence items: artifact contracts, local media probe, sampled-frame signals, transition-boundary signals, long-form duration, semantic visual review, generated-audio provider evidence, structured audio review, ASR transcript alignment, lip-sync evidence, manual long-form media review, and license/runtime permission review.

## Destination Paths

- `src/types/director-style-benchmark.ts`
- `src/core/director-style-benchmark.ts`
- `src/core/director-style-media-evidence.ts`
- `src/core/director-style-audio-review.ts`
- `src/core/director-style-runtime-review.ts`
- `src/core/director-style-semantic-review.ts`
- `src/core/director-style-review-text.ts`
- `src/core/director-style-generated-audio-provider-evidence.ts`
- `src/core/director-style-long-form-validation-evidence.ts`
- `src/core/director-style-governance-review.ts`
- `src/core/director-style-review-artifact-binding.ts`
- `scripts/create-director-style-review-drafts.mjs`
- `scripts/create-long-form-manual-quality-review-draft.mjs`
- `scripts/validate-director-style-review-evidence.mjs`
- `tests/run-director-style-review-evidence-guard-smoke.mjs`
- `scripts/run-director-style-benchmark.mjs`
- `schemas/director-style-benchmark-report.schema.json`
- `schemas/director-style-review-drafts-report.schema.json`
- `schemas/director-style-review-evidence-readiness-report.schema.json`
- `schemas/director-style-review-evidence-guard-smoke-report.schema.json`
- `schemas/long-form-manual-quality-review.schema.json`
- `schemas/long-form-manual-quality-review-draft-report.schema.json`
- `schemas/director-style-semantic-review.schema.json`
- `schemas/director-style-audio-review.schema.json`
- `schemas/director-style-runtime-review.schema.json`
- `schemas/director-style-governance-review.schema.json`
- `scripts/validate-report-contracts.mjs`
- `package.json`
- `src/index.ts`
- `src/core/source-logic-translation-records.ts`

## Validation Command

```powershell
npm.cmd run validation:quality-benchmark
npm.cmd run validation:quality-benchmark -- --semantic-review assets/output_deliverables/business-readiness/director-style-semantic-review.json
npm.cmd run validation:quality-benchmark -- --audio-review assets/output_deliverables/business-readiness/director-style-audio-review.json
npm.cmd run validation:quality-benchmark -- --runtime-review assets/output_deliverables/business-readiness/director-style-runtime-review.json
npm.cmd run validation:quality-benchmark -- --governance-review assets/output_deliverables/business-readiness/director-style-governance-review.json
npm.cmd run validation:quality-benchmark -- --generated-audio-validation assets/output_deliverables/business-readiness/generated-audio-validation-report.json
npm.cmd run validation:quality-benchmark -- --long-form-validation assets/output_deliverables/business-readiness/long-form-validation-report.json
npm.cmd run validation:quality-review-drafts -- --force
npm.cmd run validation:long-form-review-draft -- --force
npm.cmd run validation:quality-review-guard
npm.cmd run validation:quality-review-evidence
```

Default output:

- `assets/output_deliverables/business-readiness/director-style-benchmark-report.json`
- `assets/output_deliverables/business-readiness/director-style-benchmark-results.jsonl`
- `assets/output_deliverables/business-readiness/director-style-review-drafts-report.json`
- `assets/output_deliverables/business-readiness/director-style-review-evidence-readiness-report.json`
- `assets/output_deliverables/business-readiness/director-style-review-evidence-guard-smoke-report.json`
- `assets/output_deliverables/business-readiness/long-form-manual-quality-review-draft-report.json`
- `assets/output_deliverables/business-readiness/director-review-drafts/`

The current short paid Phase 6 render produces useful example evidence and now includes local media probe plus sampled-frame proxy signals, but it should remain `review_required`: it is a roughly 13.5 second text-to-video run with `audioMode:none`, so final-video audio and audio cross-modal metrics are limited, long-form stability is not proven, and FFmpeg scene-change detection does not find transition boundaries in that smoke output at the configured threshold. Its current parity evidence matrix reports 12 requirements; with the default generated-audio and long-form validation reports present, it stays stricter than the score summary. The review draft generator can prefill artifact-bound semantic/audio/runtime/governance JSON plus a checklist, but the drafts remain `needs_review` and `canUseDraftsAsAcceptedReviewEvidence=false` until a real reviewer updates them. The long-form review draft helper can prefill paid long-form artifact fingerprints when they exist, but it keeps `decision=needs_review`, `redactionReviewPassed=false`, template-only fields, and false release flags until a real reviewer fills `ops/long-form-manual-quality-review.json`. The guard smoke proves the accepted-review readiness validator can pass a synthetic clean accepted bundle and reject an otherwise accepted semantic packet that contains unsafe URL/token-like review text, without echoing the unsafe text in public reports. A synthetic structured semantic-review JSON run proves the ingestion path can produce `semantic_review_checkpoint` evidence and `artifact_contract_plus_media_semantic_review` scope; the semantic parity row becomes `met` only when the review packet is bound to the paid-render project, request, and deliverable SHA. A synthetic structured audio-review JSON run proves audio checkpoint ingestion can score narration, BGM, video-audio, and text-audio metrics and raise scope to `artifact_contract_plus_media_audio_review` or `artifact_contract_plus_media_semantic_audio_review` when matching evidence is supplied, while the structured audio parity row still requires a matching artifact binding. A synthetic structured runtime-review JSON run proves ASR transcript alignment and lip-sync timing checkpoints can raise runtime-parity evidence and scope to `artifact_contract_plus_runtime_review` or media/semantic/audio runtime variants without storing transcripts or raw media, while ASR/lip-sync parity rows require accepted artifact-bound runtime evidence. A synthetic structured governance-review JSON run proves the license/runtime permission row can become met only when DirectorBench license boundary, upstream code reuse boundary, runtime evaluator independence, evaluation-asset permission checks, and artifact binding are all accepted. A generated-audio validation report ingestion run proves the provider-backed audio row stays partial until provider spend, Atlas billing, schema review, output-batch approval, provider ledger, manual listening review, and artifact SHA binding all pass. A long-form validation report ingestion run proves the long-form duration and manual long-form media review rows stay partial while the report is blocked by budget/billing/spend/manual-review gates, and can become met only after accepted 2-8 minute paid-render, artifact, cost-ledger, duration, and artifact-bound manual quality-review evidence all pass. A synthetic local audio media run proves `audio_waveform_signal` evidence can be extracted from FFmpeg `volumedetect`, `audio_video_sync_signal` evidence can be computed from FFprobe stream-duration deltas, scope can rise to `artifact_contract_plus_media_audio_waveform`, and audio metrics can strengthen at low confidence without storing raw audio. The default smoke has no archived accepted semantic, audio, runtime, governance, or long-form manual review packets and still cannot claim semantic/long-form/audio/runtime/governance readiness.

## Acceptance Criteria

- The CLI exits successfully for `pass` and `review_required`; it exits non-zero only for `blocked`.
- The report schema is covered by `validation:report-contracts`.
- Structured semantic review JSON must match `schemas/director-style-semantic-review.schema.json` and must not include raw frame paths, local media bytes, secrets, or provider payloads.
- Structured audio review JSON must match `schemas/director-style-audio-review.schema.json` and must not include raw audio bytes, transcripts with secrets, local media paths, signed URLs, or provider payloads.
- Structured runtime review JSON must match `schemas/director-style-runtime-review.schema.json` and must not include raw transcripts, raw lip-sync frame tracks, local media paths, signed URLs, secrets, or provider payloads.
- Structured governance review JSON must match `schemas/director-style-governance-review.schema.json` and must not include secrets, local paths, signed URLs, raw legal correspondence, or provider payloads.
- Structured semantic/audio/runtime/governance review JSON can satisfy parity rows only when its `artifactBinding` matches the paid-render report's `projectId`, `requestId`, and deliverable artifact SHA-256.
- `validation:quality-review-drafts` must keep every generated semantic/audio/runtime/governance packet at `needs_review`, must use ignored operator-owned output paths by default, and must report `canUseDraftsAsAcceptedReviewEvidence=false`.
- `validation:long-form-review-draft` must keep generated manual quality/redaction review packets at `needs_review`, must use ignored operator-owned output paths by default, must require paid long-form artifact fingerprints before a pass draft report, and must report false long-form, DirectorBench parity, and customer-release flags.
- `validation:report-contracts` must reject accepted-looking raw semantic/audio/runtime/governance review packets that are missing required checkpoint names, duplicate checkpoint names, artifact binding, positive reviewed-evidence counts where applicable, or safe aggregate review text before `validation:quality-review-evidence` can treat them as candidates for accepted evidence.
- `validation:quality-review-evidence` must remain no-spend/no-network, must require all four structured review packets to be present, schema/redaction safe, explicitly accepted, complete for required checkpoint names, and artifact-bound before `canUseAsAcceptedDirectorReviewEvidence=true`, and must keep `canClaimDirectorBenchParity=false`.
- `validation:quality-review-guard` must prove the review-evidence validator accepts a clean artifact-bound accepted bundle, rejects unsafe review summaries/findings before accepted-review flags can unlock, and does not echo raw unsafe URL/token/path text in the public smoke report.
- Semantic/audio/runtime/governance review schema contracts must reject unsafe review summaries or findings that contain local paths, raw or signed URLs, data URIs, bearer tokens, API keys, or credential-like strings; normalizers must also drop unsafe optional findings and fall back to generic checkpoint summaries when unsafe evidence text is supplied.
- Generated-audio validation report JSON must match `schemas/generated-audio-validation-report.schema.json`; the benchmark may retain only status/count/gate summaries, artifact evidence checked/matched booleans, artifact evidence report path, and media SHA-256, and must not include output URLs, provider payloads, validation text, voice IDs, local paths, signed URLs, or secrets. The provider-backed audio parity row can be `met` only when manual review is accepted and artifact evidence is checked, matched, and SHA-bound.
- Long-form validation report JSON must match `schemas/long-form-validation-report.schema.json`; the benchmark may retain only status/duration/count/gate summaries and must not include local artifact paths, provider payloads, output URLs, tokens, signed URLs, or secrets.
- The report contains no API keys, bearer tokens, raw local artifact paths, inline media, provider payloads, or upstream implementation code.
- Local audio proxy evidence must contain only redacted aggregate fields such as analyzed duration, mean/max volume, headroom, signal-presence score, stream durations, and duration deltas; it must not contain raw audio bytes, transcripts, local temp paths, or signed URLs.
- `parityEvidenceMatrix` counts must match the underlying requirement rows, each requirement id must be unique, `status=met` must have no missing evidence, and any non-met requirement must list missing evidence.
- A short/no-audio smoke report must not be treated as long-form or audio evidence.
- Full DirectorBench parity remains blocked until accepted governance/legal review, artifact-bound long-form paid evidence, archived semantic visual review, generated-audio provider/listening/artifact-SHA evidence, and VLM/ASR/lip-sync evidence exist.

## Remaining Scope

- Run the transition-boundary analyzer against real long-form rendered media with detected scene changes.
- Close every non-met `parityEvidenceMatrix` item before using the report as a full DirectorBench-style parity claim.
- Archive real structured semantic visual/fidelity review JSON for a paid long-form artifact.
- Archive real structured audio review JSON from generated-audio/manual listening evidence and connect it to paid long-form artifacts.
- Archive accepted generated-audio validation report JSON from live Atlas provider execution and manual listening review.
- Archive accepted long-form validation report JSON from a real paid 2-8 minute Atlas run, artifact validation, cost ledger, and manual quality/redaction review bound to the paid artifact fingerprints.
- Archive real structured runtime review JSON for ASR transcript alignment and lip-sync timing, then add optional analyzers after the current review-packet, waveform-proxy, duration-sync proxy, and runtime-review contracts are proven on real media.
- Archive accepted structured governance review JSON for DirectorBench license boundary, upstream code reuse boundary, runtime evaluator independence, and evaluation-asset permissions.
- Run the harness against a real 2-8 minute paid long-form artifact bundle.
- Decide whether to build a deeper CineJelly-owned evaluation graph after licensing and product review.
