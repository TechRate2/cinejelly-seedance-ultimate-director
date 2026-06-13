# Reference Implementation: Generated Audio Output Validation

Implementation status as of 2026-06-14: implemented foundation for a CineJelly-owned validator that checks provider generated-audio results before they can become supplied audio tracks. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The validator must not call an audio provider, download media, or create generated audio files.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/voice.py` | MIT | Generated voice/audio output is a distinct artifact before final video composition. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/video.py` | MIT | Final composition should consume prepared audio assets rather than opaque provider state. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` | MIT | Audio-stage failures must remain operator-visible and should not be silently treated as final composition inputs. |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Generated artifacts are validated and reported before release decisions. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Sample-before-batch, approval, and media-review ideas are behavior notes only. |

## Behavior To Preserve

1. Provider success is not enough. Generated-audio output must pass URI, duration, kind, provider, and intent checks before it can enter the final mix.
2. Generated narration, BGM, ambience, and SFX map to distinct `AudioMixTrack` roles.
3. Output URLs must be credential-free public HTTPS URLs before they become mix tracks in the current engine.
4. `asset://` provider outputs are safe to record as provider references, but they must not become `AudioMixTrack` inputs unless a reviewed audio asset resolver maps them to credential-free HTTPS.
5. Missing output URLs, signed URLs, local paths, `data:` URIs, embedded credentials, and credential-like query parameters are blocking issues.
6. Output duration must be positive and should not exceed the planned/requested duration when the plan had an explicit duration.
7. Mismatched intent ID, kind, provider, or model ID must block the output.
8. Approved output becomes a deterministic `AudioMixTrack` with a stable track ID and bounded volume.
9. Validation does not inspect waveform/media metadata yet; that remains a later media-inspection stage after generated files exist.

## Edge Cases

- Provider result status is `failed`, `timeout`, or `canceled`: reject.
- Result status is `succeeded` but `outputUrl` is missing: reject.
- `outputUrl` is `https://user:pass@example.com/audio.mp3`: reject.
- `outputUrl` has query keys such as `token`, `signature`, `x-amz-*`, or `auth`: reject.
- `outputUrl` is `asset://...`: review-required unless an audio asset resolver is explicitly enabled and approves a clean HTTPS mapping.
- Result duration is zero, negative, missing, `NaN`, or infinite: reject.
- Planned duration was 6 seconds but result says 60 seconds: reject as duration mismatch.
- Intent kind is `tts_narration`: output role is `narration`.
- Intent kind is `bgm`: output role is `music`.
- Intent kind is `ambience`: output role is `ambience`.
- Intent kind is `sfx`: output role is `sfx`.

## Reference Implementation

```ts
type GeneratedAudioOutputValidationStatus = "approved" | "review_required" | "rejected";

function validateGeneratedAudioOutput(input: {
  intent: GeneratedAudioIntent;
  plannedItem: GeneratedAudioExecutionReadyItem;
  result: AudioGenerationResult;
}): GeneratedAudioOutputValidationReport {
  const issues = [];

  if (input.result.status !== "succeeded") {
    issues.push(block("provider_result_not_succeeded"));
  }
  if (input.result.intentId !== input.intent.intentId || input.result.intentId !== input.plannedItem.intentId) {
    issues.push(block("intent_mismatch"));
  }
  if (input.result.kind !== input.intent.kind || input.result.kind !== input.plannedItem.kind) {
    issues.push(block("kind_mismatch"));
  }
  if (input.result.provider !== input.plannedItem.provider) {
    issues.push(block("provider_mismatch"));
  }
  if (input.result.modelId !== input.plannedItem.modelId) {
    issues.push(block("model_mismatch"));
  }

  const uriDecision = validateOutputUri(input.result.outputUrl);
  issues.push(...uriDecision.issues);

  const duration = input.result.durationSeconds;
  if (!Number.isFinite(duration) || duration <= 0) {
    issues.push(block("invalid_duration"));
  }
  if (
    input.plannedItem.request.settings.durationSeconds !== undefined &&
    duration > input.plannedItem.request.settings.durationSeconds + 1
  ) {
    issues.push(block("duration_exceeds_plan"));
  }

  const status = issues.some((issue) => issue.severity === "block")
    ? "rejected"
    : issues.some((issue) => issue.severity === "warn")
      ? "review_required"
      : "approved";

  return {
    status,
    intentId: input.intent.intentId,
    kind: input.intent.kind,
    outputUrl: input.result.outputUrl,
    durationSeconds: duration,
    issues,
    audioTrack: status === "approved"
      ? {
          trackId: stableTrackId(input.intent.intentId),
          sourceUrlOrPath: input.result.outputUrl,
          role: roleForKind(input.intent.kind),
          volume: boundedVolume(input.intent.volume)
        }
      : undefined
  };
}
```

## CineJelly Translation Plan

- Add generated-audio output validation types under `src/types`.
- Add `GeneratedAudioOutputValidator` under `src/core`.
- Accept only provider-neutral `AudioGenerationResult` plus the original intent and ready execution-plan item.
- Produce an `AudioMixTrack` only for approved credential-free HTTPS output.
- Keep `asset://` outputs review-required unless an audio asset resolver is configured and approves a credential-free HTTPS mapping.
- Export the validator from `src/index.ts`.
- Do not call providers, download media, inspect waveform metadata, or create generated audio files in this module.

## Validation Checklist

- Provider result status must be `succeeded`.
- Intent ID, kind, provider, and model ID must match the planned request.
- Output URL must be credential-free HTTPS before becoming an audio mix track.
- `asset://` output must not become an audio mix track without an explicit resolver and approved credential-free HTTPS mapping.
- Duration must be positive and bounded by the planned duration when provided.
- Track role mapping is deterministic for narration, BGM, ambience, and SFX.
- No provider call, download, mock output, sample file, or generated audio file is created.
- No production runtime import from `external/upstream/`.

Local validation on 2026-06-14:

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- A no-network smoke confirmed approved credential-free HTTPS output creates a narration `AudioMixTrack`, signed/credential-like URL output is rejected, unresolved `asset://` output is review-required without a track, resolver-approved `asset://` output creates a track from the resolved HTTPS URL, and duration beyond the planned tolerance is rejected.
