# Director-Style Benchmark Harness

Implementation status as of 2026-06-17: implemented as a CineJelly-owned TypeScript evaluator, no-spend CLI, JSON schema, report-contract entry, source lineage record, and package command. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

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
2. The current harness is artifact-contract-only: it reads CineJelly paid-render evidence, request evidence, and optional manual review text.
3. It performs no provider calls, no media downloads, no deployment calls, no Atlas calls, and no paid validation.
4. It always reports `canClaimDirectorBenchParity=false` because frame-level transition checks, lighting/fidelity visual analysis, ASR, lip-sync, and audio waveform review are not implemented in this harness.
5. It is allowed to produce useful backend evidence, but it cannot approve customer traffic by itself.

## Destination Paths

- `src/types/director-style-benchmark.ts`
- `src/core/director-style-benchmark.ts`
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

The current short paid Phase 6 render produces useful example evidence but should remain `review_required`: it is a 15 second text-to-video run with `audioMode:none`, so audio and audio cross-modal metrics are skipped, while transition, lighting, script-video fidelity, long-form stability, and text-video consistency require stronger media evidence.

## Acceptance Criteria

- The CLI exits successfully for `pass` and `review_required`; it exits non-zero only for `blocked`.
- The report schema is covered by `validation:report-contracts`.
- The report contains no API keys, bearer tokens, raw local artifact paths, inline media, provider payloads, or upstream implementation code.
- A short/no-audio smoke report must not be treated as long-form or audio evidence.
- Full DirectorBench parity remains blocked until legal/permission review and media-level evaluation evidence exist.

## Remaining Scope

- Add optional frame-boundary transition checks against real rendered media.
- Add optional semantic visual/fidelity review from sampled frames or manual review packets.
- Add generated-audio output and manual listening evidence to audio/cross-modal metrics.
- Run the harness against a real 2-8 minute paid long-form artifact bundle.
- Decide whether to build a deeper CineJelly-owned evaluation graph after licensing and product review.
