# Reference Implementation: Source Video Auto Analysis Adapter

Implementation status as of 2026-06-13: CineJelly-owned TypeScript foundation implemented in source-video analysis contracts, runtime configuration, preflight, DirectorAgent request preparation, and source lineage records. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. Live validation with real source videos, FFmpeg, and the configured Atlas multimodal LLM remains required before release.

## Upstream And Provider Sources

| Source | Snapshot or docs path | License / terms | Behavior used |
| --- | --- | --- | --- |
| `HKUDS/VideoAgent` | `external/upstream/videoagent` | MIT top level; nested review required | Treat video understanding as bounded structured evidence before graph planning. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | Reference-video analysis and approval-gate behavior notes only; no implementation reuse. |
| `HKUDS/ViMax` | `external/upstream/vimax` | MIT | Use scene/keyframe/camera/source-structure metadata to improve reference scoring and long-form continuity. |
| Atlas Cloud LLM path | `src/providers/atlascloud` provider boundary | Provider docs/config | Use configured multimodal LLM through provider abstraction; do not hardcode provider payloads in business logic. |
| CineJelly `MediaInspector` | `src/core/media-inspector.ts` | CineJelly-owned | Sample frames with FFmpeg using bounded output directories and max-frame limits. |

## Behavior To Preserve

1. Auto-analysis is opt-in and disabled by default.
2. Caller-supplied `sourceVideoAnalysis` always wins; the adapter should not overwrite explicit user/operator analysis.
3. Auto-analysis requires a `source_video_structure` reference with a credential-free HTTPS video URI. `asset://` source videos can be analyzed only after a future resolver can materialize them safely.
4. Frame sampling is bounded by configured interval, max frames, and work directory.
5. Local frame paths and base64 frame payloads are input-only; they must never appear in returned `sourceVideoAnalysis`, artifacts, API responses, or review packets.
6. The structured LLM output must be normalized through existing `SourceVideoAnalyst` before it affects planning.
7. Scenes, keyframes, pacing notes, style notes, structural beats, and safety notes must stay bounded by `SOURCE_VIDEO_ANALYSIS_LIMITS`.
8. If analysis fails and fallback is allowed, the pipeline continues without auto-analysis; if strict mode is configured, fail before provider/render spend.

## Edge Cases

- Request has no `source_video_structure` reference: no auto-analysis.
- Request already has `sourceVideoAnalysis`: skip auto-analysis.
- Source reference URI is `asset://`: skip until asset materialization is implemented.
- Source reference URI has credential-like query keys: reject/skip because public API admission already forbids unsafe reference URIs.
- FFmpeg/FFprobe unavailable: preflight should fail when auto-analysis is enabled.
- LLM returns malformed JSON or empty scene list: strict mode fails; non-strict mode continues without auto-analysis.
- LLM suggests copying exact transcript/story: preserve as safety notes, not as directive to clone protected expression.

## Reference Implementation

```ts
async function prepareRequestWithAutoSourceVideoAnalysis(request, analyzer, settings, signal) {
  if (!settings.enabled) return request;
  if (request.sourceVideoAnalysis) return request;

  const sourceRef = request.references?.find((ref) => ref.role === "source_video_structure");
  if (!sourceRef) return request;
  if (!isCredentialFreeHttps(sourceRef.providerReference.uri)) return request;

  try {
    const analysis = await analyzer.analyze({
      sourceReference: sourceRef,
      userInput: request.userInput,
      transformationIntent: `Transform source structure into an original CineJelly commercial video.`,
      workDirectory: settings.workDirectory ?? request.workDirectory,
      frameIntervalSeconds: settings.frameIntervalSeconds,
      maxFrames: settings.maxFrames
    }, signal);

    return {
      ...request,
      sourceVideoAnalysis: analysis
    };
  } catch (error) {
    if (settings.failOnError) throw error;
    return request;
  }
}
```

## CineJelly Rewrite

- Done: add `SourceVideoAutoAnalysisSettings` to `src/types/settings.ts`.
- Done: add `SourceVideoAutoAnalysisResult` to `src/types/source-video.ts`.
- Done: add `src/core/source-video-auto-analyzer.ts` that:
  - samples frames with `MediaInspector`
  - sends data URLs to the configured `LlmProvider.structured`
  - returns bounded `SourceVideoDeconstruction`
  - omits local frame paths from output
- Done: add runtime env parsing for:
  - `CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS`
  - `CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR`
  - `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS`
  - `CINEJELLY_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES`
  - `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FAIL_ON_ERROR`
- Done: wire the analyzer into `DirectorAgent` before `IntakeDirector.intake`.
- Done: keep `SourceVideoAnalyst.normalize` as the final normalization gate.

## Validation Checklist

- Auto-analysis disabled leaves requests unchanged.
- Caller-provided `sourceVideoAnalysis` is not overwritten.
- HTTPS source-video reference plus stub multimodal LLM creates bounded `sourceVideoAnalysis`.
- `asset://` source-video references are skipped without leaking paths.
- Malformed LLM output fails only when strict mode is enabled.
- Output contains no local frame paths or inline `data:` media.
- Generated scene/keyframe counts stay within `SOURCE_VIDEO_ANALYSIS_LIMITS`.
- No production runtime import from `external/upstream/`.
