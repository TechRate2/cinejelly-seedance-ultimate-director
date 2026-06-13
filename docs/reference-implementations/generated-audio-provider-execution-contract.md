# Reference Implementation: Generated Audio Provider Execution Contract

Implementation status as of 2026-06-14: CineJelly-owned provider contracts, capability checks, and no-spend Atlas failure behavior are implemented. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. Actual Atlas or third-party audio generation must wait until provider schema, model IDs, pricing, rights policy, and artifact validation are verified.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` | MIT | Audio is an explicit stage after script/terms and before subtitles/materials/final composition; `/audio` can stop at generated audio; failures become task-visible. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/voice.py` | MIT | TTS provider selection, voice identity parsing, duration extraction, and subtitle timing are distinct concerns. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/models/schema.py` | MIT | Voice name, voice volume, voice rate, BGM type/file, BGM volume, and custom audio input are request-level knobs. |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Validate/cost/report before paid provider work; keep deterministic review evidence for generated assets. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Capability menus, provider availability disclosure, music-source decision before asset generation, sample-before-batch, and human approval concepts are behavior notes only. |

## Behavior To Preserve

1. Generated audio is a real production stage, not a side effect of final assembly.
2. Narration/TTS, BGM, ambience, and SFX must each map to explicit provider capabilities before any provider spend.
3. Missing provider capability must produce a stable operator-visible blocker instead of silently falling back or pretending audio was generated.
4. Provider choice, model ID, generated-audio kind, input prompt, expected duration, output format, and source intent ID must be captured before execution.
5. Audio generation output must be a credential-free HTTPS or `asset://` URI before it can become an `AudioMixTrack`.
6. Cost ledger entries must use operation names that separate generated audio from supplied-audio mixing.
7. A future generated-audio execution path must support cancellation and stable `ProviderError` normalization.
8. OpenMontage-style provider menus and approval gates are useful, but AGPL implementation code must not be copied, linked, or executed.

## Edge Cases

- No generated-audio intents: no provider request is prepared.
- Intent kind has no configured capability: mark it `blocked_provider_not_configured`.
- Provider preference is supplied but unsupported: preserve it as a conflict and choose no provider.
- Output URL is local, signed, credential-bearing, or non-HTTPS: reject before adding it to audio tracks.
- Generated duration is zero or missing after provider execution: reject output and keep the intent unresolved.
- One intent fails while others are ready: keep per-intent status so future orchestration can execute partial safe work without claiming complete audio coverage.
- Caller aborts during generation: normalize to a canceled provider operation and avoid adding partial output to postproduction tracks.
- Provider supports only TTS but request asks for BGM/SFX: do not reuse TTS capability for music or effects.
- Future provider schema changes: block execution until the capability config and provider mapper are refreshed.

## Reference Implementation

```ts
type GeneratedAudioExecutionStatus =
  | "not_requested"
  | "blocked_provider_not_configured"
  | "ready_for_provider"
  | "generated"
  | "failed";

interface AudioGenerationCapability {
  provider: ProviderName;
  modelId: string;
  kinds: readonly GeneratedAudioIntentKind[];
  outputFormats: readonly ("mp3" | "wav")[];
  maxDurationSeconds: number;
  async: boolean;
}

interface AudioGenerationRequest {
  provider: ProviderName;
  modelId: string;
  intentId: string;
  kind: GeneratedAudioIntentKind;
  prompt: string;
  settings: {
    outputFormat: "mp3" | "wav";
    durationSeconds?: number;
    language?: string;
    voiceStyle?: string;
    mood?: string;
    volume?: number;
  };
  metadata?: ProviderMetadata;
}

interface AudioGenerationResult {
  provider: ProviderName;
  modelId: string;
  intentId: string;
  kind: GeneratedAudioIntentKind;
  status: "succeeded" | "failed" | "timeout" | "canceled";
  outputUrl?: string;
  durationSeconds?: number;
  usage?: ProviderUsage;
  raw: unknown;
}

function planAudioProviderExecution(
  intents: readonly GeneratedAudioIntent[],
  capabilities: readonly AudioGenerationCapability[]
): GeneratedAudioExecutionPlan {
  if (intents.length === 0) {
    return { status: "not_requested", items: [], conflicts: [] };
  }

  const items = intents.map((intent) => {
    const capability = capabilities.find((candidate) =>
      candidate.kinds.includes(intent.kind) &&
      durationFor(intent) <= candidate.maxDurationSeconds &&
      (!intent.providerPreference || intent.providerPreference === candidate.provider)
    );

    if (!capability) {
      return {
        intentId: intent.intentId,
        kind: intent.kind,
        status: "blocked_provider_not_configured",
        reason: "No configured generated-audio capability supports this kind/duration/provider preference."
      };
    }

    return {
      intentId: intent.intentId,
      kind: intent.kind,
      status: "ready_for_provider",
      request: toAudioGenerationRequest(intent, capability)
    };
  });

  return {
    status: items.every((item) => item.status === "ready_for_provider")
      ? "ready_for_provider"
      : "blocked_provider_not_configured",
    items,
    conflicts: items.filter((item) => item.status === "blocked_provider_not_configured")
  };
}
```

## CineJelly Translation Plan

- Add provider-neutral audio-generation request/result/capability types.
- Add an optional `AudioProvider` contract without changing postproduction to claim generated output.
- Add a safe Atlas provider boundary that reports no generated-audio capabilities until explicit verified audio capability config exists.
- Keep current `PostproductionAssetPlanner` behavior as planned-only when no provider capability exists.
- Future work should create a separate Atlas audio mapper after current Atlas audio model schemas are verified.
- Future generated outputs must pass URI safety checks and media inspection before they become supplied `AudioMixTrack` inputs.

## Validation Checklist

- Reference Implementation exists before production code.
- Audio provider capability lookup can represent no configured provider without spend.
- Provider-neutral contracts can distinguish TTS, BGM, ambience, and SFX.
- Provider-generated output is not claimed until a result URI and duration are verified.
- Atlas provider does not call an unverified audio endpoint.
- Cost ledger operation names can separate `audio.generate` from video generation and local audio mixing.
- No production runtime import from `external/upstream/`.
- No generated audio files, mocks, demos, samples, or fake provider outputs are introduced.

Local validation on 2026-06-14:

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- A no-network smoke confirmed Atlas reports no audio capabilities, rejects unverified generated-audio execution with `MODEL_UNAVAILABLE`, rejects zero-duration requests with `INVALID_SCHEMA`, and records failed `audio.generate` ledger entries when a ledger is attached.
