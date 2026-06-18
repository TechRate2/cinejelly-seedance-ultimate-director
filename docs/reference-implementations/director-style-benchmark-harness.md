# Director-Style Benchmark Harness

Implementation status as of 2026-06-18: implemented as a CineJelly-owned TypeScript evaluator, local media-evidence collector, no-spend CLI, JSON schema, report-contract entry, source lineage record, and package command. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

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

## CineJelly Changes

1. No DirectorBench Python code, LangGraph graph, OpenCV routines, prompts, or agent implementations are copied or executed.
2. The current harness reads CineJelly paid-render evidence, request evidence, optional manual review text, and optional local rendered media.
3. Local media evidence is limited to FFprobe delivery metadata, bounded sampled-frame RGB signals, and FFmpeg scene-change transition-boundary pre/post RGB proxies; sampled frame paths are redacted from reports.
4. It performs no provider calls, no media downloads, no deployment calls, no Atlas calls, and no paid validation.
5. It always reports `canClaimDirectorBenchParity=false` because scene-change boundary proxies do not replace semantic visual/fidelity analysis, ASR, lip-sync, generated-audio waveform/listening review, or long-form paid evidence.
6. It is allowed to produce useful backend evidence, but it cannot approve customer traffic by itself.

## Destination Paths

- `src/types/director-style-benchmark.ts`
- `src/core/director-style-benchmark.ts`
- `src/core/director-style-media-evidence.ts`
- `scripts/run-director-style-benchmark.mjs`
- `schemas/director-style-benchmark-report.schema.json`
- `scripts/validate-report-contracts.mjs`
- `package.json`
- `src/index.ts`
- `src/core/source-logic-translation-records.ts`

## Validation Command

```powershell
npm.cmd run validation:quality-benchmark
```

Default output:

- `assets/output_deliverables/business-readiness/director-style-benchmark-report.json`
- `assets/output_deliverables/business-readiness/director-style-benchmark-results.jsonl`

The current short paid Phase 6 render produces useful example evidence and now includes local media probe plus sampled-frame proxy signals, but it should remain `review_required`: it is a roughly 13.5 second text-to-video run with `audioMode:none`, so audio and audio cross-modal metrics are skipped, long-form stability is not proven, and FFmpeg scene-change detection does not find transition boundaries in that smoke output at the configured threshold. Transition/lighting/text-video metrics still need long-form outputs with real boundaries plus semantic visual and/or manual media review evidence.

## Acceptance Criteria

- The CLI exits successfully for `pass` and `review_required`; it exits non-zero only for `blocked`.
- The report schema is covered by `validation:report-contracts`.
- The report contains no API keys, bearer tokens, raw local artifact paths, inline media, provider payloads, or upstream implementation code.
- A short/no-audio smoke report must not be treated as long-form or audio evidence.
- Full DirectorBench parity remains blocked until legal/permission review, long-form paid evidence, semantic visual/VLM/ASR/lip-sync evidence, and audio review evidence exist.

## Remaining Scope

- Run the transition-boundary analyzer against real long-form rendered media with detected scene changes.
- Add semantic visual/fidelity review from sampled frames or manual review packets.
- Add generated-audio output and manual listening evidence to audio/cross-modal metrics.
- Run the harness against a real 2-8 minute paid long-form artifact bundle.
- Decide whether to build a deeper CineJelly-owned evaluation graph after licensing and product review.
