# Director-Style Benchmark Harness

Implementation status as of 2026-06-18: implemented as a CineJelly-owned TypeScript evaluator, local media-evidence collector with FFprobe, sampled-frame, transition-boundary, bounded FFmpeg audio waveform/volume proxy signals, and FFprobe audio-video duration sync proxy signals, structured semantic-review normalizer, structured audio-review normalizer, structured runtime ASR/lip-sync review normalizer, structured governance-review normalizer, generated-audio validation report normalizer, parity evidence matrix, no-spend CLI, JSON schemas, report-contract entries, source lineage record, and package command. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

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
2. The current harness reads CineJelly paid-render evidence, request evidence, optional manual review text, optional structured semantic review JSON, optional structured audio review JSON, optional structured ASR/lip-sync runtime review JSON, optional structured governance review JSON, optional generated-audio validation report JSON, and optional local rendered media.
3. Local media evidence is limited to FFprobe delivery metadata, bounded sampled-frame RGB signals, FFmpeg scene-change transition-boundary pre/post RGB proxies, FFmpeg `volumedetect` audio waveform/volume proxy signals, and FFprobe audio-video duration-delta proxy signals; sampled frame paths and raw audio bytes are never stored in reports.
4. Structured semantic review evidence can raise or lower the affected visual/cross-modal checkpoint scores, structured audio review evidence can raise or lower narration/BGM/audio cross-modal checkpoints, structured runtime review evidence can raise or lower ASR transcript-alignment and lip-sync timing checkpoints, structured governance review evidence can satisfy the license/runtime permission parity row only when every required governance check is accepted, generated-audio validation evidence can satisfy the provider-backed audio row only when spend, billing, schema, execution, output-batch, ledger, and manual listening gates are all accepted, and waveform/duration-sync proxy evidence can only provide low-confidence structural audio support when review JSON is absent; all remain bounded checkpoint evidence rather than full DirectorBench runtime parity.
5. It performs no provider calls, no media downloads, no deployment calls, no Atlas calls, and no paid validation.
6. It always reports `canClaimDirectorBenchParity=false` because local proxies and structured review packets do not replace automated VLM, ASR, lip-sync, generated-audio provider evidence, live long-form paid evidence, or the remaining non-met parity rows.
7. It is allowed to produce useful backend evidence, but it cannot approve customer traffic by itself.
8. `parityEvidenceMatrix` records 12 required evidence items: artifact contracts, local media probe, sampled-frame signals, transition-boundary signals, long-form duration, semantic visual review, generated-audio provider evidence, structured audio review, ASR transcript alignment, lip-sync evidence, manual long-form media review, and license/runtime permission review.

## Destination Paths

- `src/types/director-style-benchmark.ts`
- `src/core/director-style-benchmark.ts`
- `src/core/director-style-media-evidence.ts`
- `src/core/director-style-audio-review.ts`
- `src/core/director-style-runtime-review.ts`
- `src/core/director-style-semantic-review.ts`
- `src/core/director-style-generated-audio-provider-evidence.ts`
- `src/core/director-style-governance-review.ts`
- `scripts/run-director-style-benchmark.mjs`
- `schemas/director-style-benchmark-report.schema.json`
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
```

Default output:

- `assets/output_deliverables/business-readiness/director-style-benchmark-report.json`
- `assets/output_deliverables/business-readiness/director-style-benchmark-results.jsonl`

The current short paid Phase 6 render produces useful example evidence and now includes local media probe plus sampled-frame proxy signals, but it should remain `review_required`: it is a roughly 13.5 second text-to-video run with `audioMode:none`, so final-video audio and audio cross-modal metrics are limited, long-form stability is not proven, and FFmpeg scene-change detection does not find transition boundaries in that smoke output at the configured threshold. Its current parity evidence matrix reports 12 requirements; with the default blocked generated-audio validation report present, it has 3 met, 3 partial, and 6 missing requirements, which is intentionally stricter than the score summary. A synthetic structured semantic-review JSON run proves the ingestion path can produce `semantic_review_checkpoint` evidence and `artifact_contract_plus_media_semantic_review` scope. A synthetic structured audio-review JSON run proves audio checkpoint ingestion can score narration, BGM, video-audio, and text-audio metrics and raise scope to `artifact_contract_plus_media_audio_review` or `artifact_contract_plus_media_semantic_audio_review` when matching evidence is supplied. A synthetic structured runtime-review JSON run proves ASR transcript alignment and lip-sync timing checkpoints can raise runtime-parity evidence and scope to `artifact_contract_plus_runtime_review` or media/semantic/audio runtime variants without storing transcripts or raw media. A synthetic structured governance-review JSON run proves the license/runtime permission row can become met only when DirectorBench license boundary, upstream code reuse boundary, runtime evaluator independence, and evaluation-asset permission checks are all accepted. A generated-audio validation report ingestion run proves the provider-backed audio row stays partial while the report is `blocked_by_spend_confirmation`, and can become met only after provider spend, Atlas billing, schema review, output-batch approval, provider ledger, and manual listening review all pass. A synthetic local audio media run proves `audio_waveform_signal` evidence can be extracted from FFmpeg `volumedetect`, `audio_video_sync_signal` evidence can be computed from FFprobe stream-duration deltas, scope can rise to `artifact_contract_plus_media_audio_waveform`, and audio metrics can strengthen at low confidence without storing raw audio. The default smoke has no archived semantic, audio, runtime, or governance review packets and still cannot claim semantic/long-form/audio/runtime/governance readiness.

## Acceptance Criteria

- The CLI exits successfully for `pass` and `review_required`; it exits non-zero only for `blocked`.
- The report schema is covered by `validation:report-contracts`.
- Structured semantic review JSON must match `schemas/director-style-semantic-review.schema.json` and must not include raw frame paths, local media bytes, secrets, or provider payloads.
- Structured audio review JSON must match `schemas/director-style-audio-review.schema.json` and must not include raw audio bytes, transcripts with secrets, local media paths, signed URLs, or provider payloads.
- Structured runtime review JSON must match `schemas/director-style-runtime-review.schema.json` and must not include raw transcripts, raw lip-sync frame tracks, local media paths, signed URLs, secrets, or provider payloads.
- Structured governance review JSON must match `schemas/director-style-governance-review.schema.json` and must not include secrets, local paths, signed URLs, raw legal correspondence, or provider payloads.
- Generated-audio validation report JSON must match `schemas/generated-audio-validation-report.schema.json`; the benchmark may retain only status/count/gate summaries and must not include output URLs, provider payloads, validation text, voice IDs, local paths, signed URLs, or secrets.
- The report contains no API keys, bearer tokens, raw local artifact paths, inline media, provider payloads, or upstream implementation code.
- Local audio proxy evidence must contain only redacted aggregate fields such as analyzed duration, mean/max volume, headroom, signal-presence score, stream durations, and duration deltas; it must not contain raw audio bytes, transcripts, local temp paths, or signed URLs.
- `parityEvidenceMatrix` counts must match the underlying requirement rows, each requirement id must be unique, `status=met` must have no missing evidence, and any non-met requirement must list missing evidence.
- A short/no-audio smoke report must not be treated as long-form or audio evidence.
- Full DirectorBench parity remains blocked until accepted governance/legal review, long-form paid evidence, archived semantic visual review, generated-audio provider/listening evidence, and VLM/ASR/lip-sync evidence exist.

## Remaining Scope

- Run the transition-boundary analyzer against real long-form rendered media with detected scene changes.
- Close every non-met `parityEvidenceMatrix` item before using the report as a full DirectorBench-style parity claim.
- Archive real structured semantic visual/fidelity review JSON for a paid long-form artifact.
- Archive real structured audio review JSON from generated-audio/manual listening evidence and connect it to paid long-form artifacts.
- Archive accepted generated-audio validation report JSON from live Atlas provider execution and manual listening review.
- Archive real structured runtime review JSON for ASR transcript alignment and lip-sync timing, then add optional analyzers after the current review-packet, waveform-proxy, duration-sync proxy, and runtime-review contracts are proven on real media.
- Archive accepted structured governance review JSON for DirectorBench license boundary, upstream code reuse boundary, runtime evaluator independence, and evaluation-asset permissions.
- Run the harness against a real 2-8 minute paid long-form artifact bundle.
- Decide whether to build a deeper CineJelly-owned evaluation graph after licensing and product review.
