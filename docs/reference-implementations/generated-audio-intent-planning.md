# Reference Implementation: Generated Audio Intent Planning

Implementation status as of 2026-06-14: implemented as CineJelly-owned TypeScript in request contracts, API admission, postproduction asset planning, stage lifecycle evidence, review packets, artifact validation, and source lineage records. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Explicit subtitle, voice/TTS, music/BGM, material, task-progress, and final composition stages. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Deterministic planning/review artifacts and operator-visible incomplete-stage evidence. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | Media approval and self-review concepts, used only as AGPL-aware behavior notes. |

## Behavior To Preserve

1. Requests for generated narration, BGM, ambience, or SFX must become explicit postproduction planning evidence before assembly.
2. The planner must not silently ignore generated-audio requests just because a provider-backed audio module is not implemented yet.
3. Provider-backed TTS/BGM generation must not be claimed until a separate provider module exists and is configured.
4. Generated-audio intent prompts, timing, language, voice style, mood, volume, and provider preference must be bounded at API admission before any provider spend.
5. Stage lifecycle, review packet, run summary, and `postproduction-assets.json` must agree on generated-audio counts.
6. No local filesystem paths, signed URLs, raw provider payloads, or upstream runtime imports are involved in this planning layer.

## Edge Cases

- No generated-audio intents: generated audio status is `not_requested`; no generated-audio issue is emitted.
- Generated narration/BGM intent exists but no provider-backed audio generator is configured: mark postproduction plan `review_required` with a clear repair action to provide explicit audio tracks or implement the provider module.
- Generated-audio prompt is blank or too long: reject at API admission.
- Generated-audio timing has `endSecond <= startSecond`: reject at API admission.
- Generated-audio duration is too long for a single requested intent: reject at API admission before planning.
- Generated-audio volume exceeds the safe mix range: reject at API admission.
- A provider preference is present: preserve it only as bounded planning metadata; do not route provider calls from this module.

## Reference Implementation

```ts
type GeneratedAudioIntentKind = "tts_narration" | "bgm" | "ambience" | "sfx";

interface GeneratedAudioIntent {
  intentId: string;
  kind: GeneratedAudioIntentKind;
  prompt: string;
  startSecond?: number;
  endSecond?: number;
  durationSeconds?: number;
  language?: string;
  voiceStyle?: string;
  mood?: string;
  volume?: number;
  providerPreference?: string;
}

function planGeneratedAudio(intents: readonly GeneratedAudioIntent[]): GeneratedAudioPlan {
  const kindCounts = countKinds(intents);
  const requestedDurationSeconds = intents.reduce((sum, intent) =>
    sum + Math.max(0, intent.durationSeconds ?? ((intent.endSecond ?? 0) - (intent.startSecond ?? 0))),
    0
  );

  return {
    status: intents.length > 0 ? "planned_only" : "not_requested",
    intentCount: intents.length,
    kindCounts,
    requestedDurationSeconds,
    providerConfigured: false
  };
}

function postproductionIssues(input: PostproductionInput): Issue[] {
  const issues = existingCaptionAndAudioIssues(input);
  if (input.generatedAudioIntents.length > 0) {
    issues.push({
      code: "generated_audio_provider_not_configured",
      severity: "warn",
      message: "Generated-audio intents were supplied, but provider-backed audio generation is not configured.",
      repair: "Provide explicit licensed audio tracks for this run, or implement a provider-backed generated audio module."
    });
  }
  return issues;
}
```

## CineJelly Translation Plan

- Done: generated-audio intent contracts under `src/types/audio.ts`.
- Done: `PostproductionAssetPlan` includes a generated-audio planning block.
- Done: `PostproductionAssetPlanner` counts generated-audio intents and emits review-required evidence while provider-backed generation is absent.
- Done: API admission bounds generated-audio intents before runtime creation or provider spend.
- Done: generated-audio counts are included in run summary, review packet planning, assemble-stage evidence, and artifact validation consistency checks.
- Done: source lineage is recorded in `docs/EXTERNAL_SOURCE_SNAPSHOTS.md` and `src/core/source-logic-translation-records.ts`.

## Validation Checklist

- Generated-audio intents with valid bounded fields pass admission.
- Blank generated-audio prompts fail admission.
- Invalid timing fails admission.
- Generated-audio intent count limit is enforced.
- Postproduction plan records generated-audio `planned_only` status and kind counts.
- Artifact validation checks generated-audio status/count compatibility and verifies kind counts sum to the total intent count.
- Generated-audio requests produce review-required evidence until a provider-backed module exists.
- Run summary, review packet, assemble-stage evidence, and `postproduction-assets.json` agree on generated-audio intent count.
- `npm.cmd run typecheck` and `npm.cmd run build` pass.
- No production runtime import from `external/upstream/`.
- No provider spend, mock audio, or demo assets are introduced by this planning layer.
