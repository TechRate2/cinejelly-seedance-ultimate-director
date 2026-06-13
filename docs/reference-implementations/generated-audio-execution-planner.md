# Reference Implementation: Generated Audio Execution Planner

Implementation status as of 2026-06-14: planned for a CineJelly-owned execution-planning module that converts bounded `GeneratedAudioIntent` records into provider-neutral `AudioGenerationRequest` records when verified capabilities exist. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The planner must not call an audio provider or create generated audio files.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` | MIT | Audio is a visible stage that can complete or fail before later subtitle/material/final-video stages. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/voice.py` | MIT | Voice/TTS behavior keeps provider, voice identity, rate/volume, subtitle timing, and duration concerns distinct. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/models/schema.py` | MIT | Voice and BGM knobs are explicit request fields rather than hidden assembly side effects. |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Validate and report planned work before paid provider calls; expose blockers deterministically. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Provider capability menus, music-plan review, and sample-before-batch are used as behavior notes only. |

## Behavior To Preserve

1. Planning comes before execution. Generated-audio intents are mapped to provider capabilities before any provider call.
2. TTS/narration, BGM, ambience, and SFX are distinct capability kinds; one kind must not satisfy another.
3. Provider preference is binding. If an intent requests a provider that has no matching verified capability, the item is blocked rather than silently routed elsewhere.
4. Output format defaults should be deterministic and visible. CineJelly defaults to `mp3` until a verified provider path asks otherwise.
5. Duration is derived in a stable order: explicit `durationSeconds`, then `endSecond - startSecond`, otherwise capability-safe undefined duration.
6. Invalid or impossible durations block planning before provider spend.
7. Each intent keeps an item-level status so future orchestration can support partial execution without claiming full audio coverage.
8. The plan records ready and blocked counts so `postproduction-assets.json`, stage lifecycle evidence, review packets, and artifact validation can agree.
9. Planning may produce provider requests, but it does not generate output URLs and does not create `AudioMixTrack` records.
10. AGPL OpenMontage concepts remain behavior notes; no implementation code is copied, linked, imported, or executed.

## Edge Cases

- No generated-audio intents: plan status is `not_requested`, no provider requests, no issues.
- Empty capability list: plan status is `planned_only`; every intent is blocked as `provider_not_configured`.
- Provider preference does not match capability provider: block with `provider_preference_unavailable`.
- Capability supports provider but not kind: block with `kind_not_supported`.
- Capability supports kind but not duration: block with `duration_exceeds_capability`.
- Capability supports kind but not default output format: block with `output_format_not_supported`.
- `durationSeconds <= 0` or `endSecond <= startSecond`: block with `invalid_duration`.
- Mixed ready and blocked intents: plan status is `partially_ready`; future execution may run only ready items after operator approval.
- Multiple matching capabilities: deterministic selection prefers provider preference, then shorter max-duration fit, then lexical provider/model order.
- Missing duration: allow request without duration only when the capability exists; provider mapper can apply its own schema default later.

## Reference Implementation

```ts
type GeneratedAudioExecutionPlanStatus =
  | "not_requested"
  | "planned_only"
  | "ready_for_provider"
  | "partially_ready";

type GeneratedAudioExecutionItemStatus =
  | "ready_for_provider"
  | "blocked";

type GeneratedAudioExecutionBlockReason =
  | "provider_not_configured"
  | "provider_preference_unavailable"
  | "kind_not_supported"
  | "duration_exceeds_capability"
  | "output_format_not_supported"
  | "invalid_duration";

function planGeneratedAudioExecution(
  intents: readonly GeneratedAudioIntent[],
  capabilities: readonly AudioGenerationCapability[]
): GeneratedAudioExecutionPlan {
  if (intents.length === 0) {
    return emptyPlan("not_requested");
  }

  const items = intents.map((intent) => {
    const duration = durationFor(intent);
    if (duration !== undefined && duration <= 0) {
      return blocked(intent, "invalid_duration");
    }

    const sameProvider = intent.providerPreference
      ? capabilities.filter((candidate) => candidate.provider === intent.providerPreference)
      : capabilities;

    if (intent.providerPreference && sameProvider.length === 0) {
      return blocked(intent, "provider_preference_unavailable");
    }
    if (sameProvider.length === 0) {
      return blocked(intent, "provider_not_configured");
    }

    const sameKind = sameProvider.filter((candidate) => candidate.kinds.includes(intent.kind));
    if (sameKind.length === 0) {
      return blocked(intent, "kind_not_supported");
    }

    const sameDuration = sameKind.filter((candidate) =>
      duration === undefined || duration <= candidate.maxDurationSeconds
    );
    if (sameDuration.length === 0) {
      return blocked(intent, "duration_exceeds_capability");
    }

    const outputFormat = "mp3";
    const sameFormat = sameDuration.filter((candidate) => candidate.outputFormats.includes(outputFormat));
    if (sameFormat.length === 0) {
      return blocked(intent, "output_format_not_supported");
    }

    const capability = sortByBestFit(sameFormat, duration)[0];
    return {
      intentId: intent.intentId,
      kind: intent.kind,
      status: "ready_for_provider",
      capability,
      request: {
        provider: capability.provider,
        modelId: capability.modelId,
        intentId: intent.intentId,
        kind: intent.kind,
        prompt: intent.prompt,
        settings: {
          outputFormat,
          ...(duration !== undefined ? { durationSeconds: duration } : {}),
          ...(intent.language ? { language: intent.language } : {}),
          ...(intent.voiceStyle ? { voiceStyle: intent.voiceStyle } : {}),
          ...(intent.mood ? { mood: intent.mood } : {}),
          ...(intent.volume !== undefined ? { volume: intent.volume } : {})
        }
      }
    };
  });

  const readyCount = items.filter((item) => item.status === "ready_for_provider").length;
  const blockedCount = items.length - readyCount;
  return {
    status: readyCount === 0 ? "planned_only" : blockedCount === 0 ? "ready_for_provider" : "partially_ready",
    intentCount: intents.length,
    readyCount,
    blockedCount,
    items
  };
}
```

## CineJelly Translation Plan

- Add generated-audio execution plan types in CineJelly-owned TypeScript.
- Add `GeneratedAudioExecutionPlanner` under `src/core` so orchestration can plan provider work without calling providers.
- Feed the execution plan into `PostproductionAssetPlanner` while preserving current no-capability behavior.
- Extend artifact validation to accept `ready_for_provider` and `partially_ready` statuses without claiming generated outputs.
- Export the planner from `src/index.ts` for production integrations.
- Keep Atlas generated-audio capabilities empty until verified schemas/model IDs/pricing/output validation exist.

## Validation Checklist

- No provider is called by the planner.
- No generated audio file, fake URL, mock output, demo, or sample is created.
- Empty capabilities preserve current review-required planned-only behavior.
- Provider preference is binding and produces a visible conflict when unavailable.
- Output format, duration, provider, model ID, kind, and intent ID are captured in ready requests.
- Mixed ready/blocked intents keep item-level evidence.
- `postproduction-assets.json`, run summary, review packet, and stage lifecycle can agree on generated-audio status and counts.
- No production runtime import from `external/upstream/`.

Local validation on 2026-06-14:

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- A no-network smoke confirmed empty capabilities produce `planned_only` blocked evidence, verified capabilities produce `ready_for_provider` requests, timing-derived durations are preserved, and `PostproductionAssetPlanner` keeps a review warning until provider execution actually runs.
