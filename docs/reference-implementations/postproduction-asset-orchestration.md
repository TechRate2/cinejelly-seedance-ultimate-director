# Reference Implementation: Postproduction Asset Orchestration

Implementation status as of 2026-06-13: implemented as CineJelly-owned TypeScript in postproduction asset contracts, a planner module, DirectorAgent orchestration, run artifacts, review packets, stage lifecycle evidence, artifact validation, and source lineage records. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Explicit subtitle, narration/TTS, BGM, material, and final composition stages with operator-visible task state. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Deterministic build/review artifacts and status discipline. |

## Behavior To Preserve

1. Subtitle, narration, music, ambience, and SFX decisions should be explicit before final assembly.
2. User-supplied caption cues and audio tracks should be classified into a deterministic postproduction plan.
3. The plan should be reviewable in artifacts and review packets, even when no deliverable is assembled.
4. The plan should not create new provider spend. TTS/BGM generation remains a future provider-backed feature unless configured through explicit tracks.
5. Audio tracks must remain credential-safe and are still materialized by the existing audio mix engine.
6. Caption burn-in vs sidecar behavior must be visible before FFmpeg execution.
7. Missing or inconsistent inputs should produce review-required issues rather than silent behavior.

## Edge Cases

- Caption options are enabled but no cues are present: mark review required; repair is to add cues or disable captions.
- Caption cues exist but caption options are absent or disabled: mark review required because cues will not be rendered.
- Audio tracks exist but mix options explicitly disable audio: mark review required because tracks will be ignored.
- Audio mix options are enabled but no tracks exist: mark review required because no mix can run.
- Audio tracks exist without options: mirror the assembly default and plan an enabled mix with mode `mix`, original audio detected at assembly, and bitrate `192k`.
- Narration role is treated as a user/operator-supplied narration track. Do not claim generated TTS until a future provider-backed TTS module exists.
- Music role is treated as supplied BGM. Do not search or generate BGM in this planner.

## Reference Implementation

```ts
type PostproductionAssetStatus = "disabled" | "planned" | "review_required";

function planPostproductionAssets(input: PostproductionAssetInput): PostproductionAssetPlan {
  const cues = input.captionCues ?? [];
  const captionOptions = input.captionOptions ?? { enabled: false, burnIn: false };
  const tracks = input.audioTracks ?? [];
  const audioOptions = input.audioMixOptions ?? {
    enabled: tracks.length > 0,
    mode: "mix",
    originalVolume: 1,
    outputBitrate: "192k"
  };

  const issues: PostproductionAssetIssue[] = [];
  if (captionOptions.enabled && cues.length === 0) {
    issues.push(issue("caption_enabled_without_cues", "warn"));
  }
  if (cues.length > 0 && !captionOptions.enabled) {
    issues.push(issue("caption_cues_not_rendered", "warn"));
  }
  if (tracks.length > 0 && !audioOptions.enabled) {
    issues.push(issue("audio_tracks_not_mixed", "warn"));
  }
  if (audioOptions.enabled && tracks.length === 0) {
    issues.push(issue("audio_mix_enabled_without_tracks", "warn"));
  }

  const captionEnabled = captionOptions.enabled && cues.length > 0;
  const audioEnabled = audioOptions.enabled && tracks.length > 0;
  const status =
    issues.some((item) => item.severity === "warn" || item.severity === "block")
      ? "review_required"
      : captionEnabled || audioEnabled
        ? "planned"
        : "disabled";

  return {
    planId: stableId(input.projectId, cues, tracks),
    projectId: input.projectId,
    sourcePatternOrigins: ["harry0703/MoneyPrinterTurbo", "vericontext/vibeframe"],
    status,
    caption: {
      enabled: captionEnabled,
      cueCount: cues.length,
      burnIn: captionOptions.burnIn,
      deliveryMode: captionEnabled ? (captionOptions.burnIn ? "burn_in" : "sidecar") : "disabled",
      totalCaptionSeconds: sumCueDuration(cues)
    },
    audio: {
      enabled: audioEnabled,
      mode: audioOptions.mode,
      trackCount: tracks.length,
      roleCounts: countRoles(tracks),
      originalAudioPolicy: audioEnabled ? "detect_at_assembly" : "not_used",
      outputBitrate: audioOptions.outputBitrate
    },
    issueCount: issues.length,
    issues
  };
}
```

## CineJelly Translation Plan

- Done: `PostproductionAssetPlan` contracts under `src/types`.
- Done: CineJelly-owned `PostproductionAssetPlanner` under `src/core`.
- Done: `DirectorAgent` creates the plan before final run evidence and passes it into stage lifecycle, artifacts, review packet, and API result state.
- Done: `postproduction-assets.json` is written as a durable artifact.
- Done: postproduction asset status and counts are added to run summary, review packet planning, and assemble-stage evidence.
- Done: artifact validator checks `postproduction-assets.json`.
- Done: source lineage is recorded in `docs/EXTERNAL_SOURCE_SNAPSHOTS.md` and `src/core/source-logic-translation-records.ts`.

## Validation Checklist

- Caption enabled without cues produces review-required evidence.
- Caption cues with disabled/missing options produce review-required evidence.
- Audio tracks without explicit options plan an enabled default mix.
- Audio tracks with disabled mix options produce review-required evidence.
- TTS/BGM generation is not claimed unless a future provider-backed module exists.
- `postproduction-assets.json` is included in success artifacts and artifact validation.
- Review packet and stage lifecycle expose postproduction asset status without local paths or secrets.
- No production runtime import from `external/upstream/`.
- Typecheck, build, focused planner smoke, and artifact validator smoke pass.
