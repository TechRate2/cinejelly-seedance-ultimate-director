# Reference Implementation: Generated Audio Asset Resolution

Implementation status as of 2026-06-14: implemented foundation for a CineJelly-owned resolver that can turn approved generated-audio `asset://` records into credential-free HTTPS URLs before audio mixing. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The resolver must not call providers, download media, inspect waveform data, or create generated audio files.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` | MIT | Task artifacts are staged and checked before final composition consumes them. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/voice.py` | MIT | Voice/TTS output is treated as a prepared artifact distinct from composition. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/video.py` | MIT | Final video composition should consume prepared media paths only after the media stage succeeds. |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Generated artifacts should be resolved, reported, and validated before release. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Approval and sample-review concepts are behavior notes only; implementation code is not reused. |

## Behavior To Preserve

1. `asset://` is a reviewable internal asset reference, not a media source that FFmpeg can consume directly.
2. A generated-audio asset may become an `AudioMixTrack` only after an explicit resolver maps it to a credential-free HTTPS URL.
3. Resolution is identity-bound: intent ID, kind, provider, model ID, and provider asset ID should match when the resolver entry carries those fields.
4. Resolution must not loosen output validation. Provider result status, duration, volume, and kind checks still belong to `GeneratedAudioOutputValidator`.
5. Resolver entries must be operator/provider evidence, not runtime side effects. The resolver does not call Atlas, fetch a signed URL, download media, inspect files, or mint a public URL.
6. Unsafe resolved URLs are blocking: local paths, `data:` URIs, non-HTTPS URLs, embedded credentials, signed URLs, and credential-like query parameters cannot be mixed.
7. Unapproved resolver entries stay `review_required` and must not produce an audio track.
8. Resolution reports should preserve provenance fields for review packets and future artifact validation: source asset URI, resolved URL, provider asset ID, approval status, content hash, and issues.

## Edge Cases

- `asset://...` output has no resolver configured: review-required, no audio track.
- Resolver has no matching entry: review-required, no audio track.
- Resolver entry exists but `approvedForMix=false`: review-required, no audio track.
- Resolver entry points to `http://...`: rejected.
- Resolver entry points to `https://cdn.example.com/audio.mp3?signature=abc`: rejected.
- Resolver entry has embedded credentials: rejected.
- Resolver entry says `intentId=A` but provider result says `intentId=B`: rejected.
- Resolver entry says `kind=bgm` but provider result says `kind=tts_narration`: rejected.
- Resolver entry duration differs from provider result by more than one second: rejected.
- Clean `asset://` plus approved clean HTTPS mapping: output validation may produce an `AudioMixTrack` using the resolved HTTPS URL.

## Reference Implementation

```ts
type AssetResolutionStatus = "resolved" | "review_required" | "rejected";

interface GeneratedAudioAssetResolutionEntry {
  assetUri: string;
  resolvedUrl: string;
  approvedForMix: boolean;
  intentId?: string;
  kind?: GeneratedAudioIntentKind;
  provider?: ProviderName;
  modelId?: string;
  providerAssetId?: string;
  durationSeconds?: number;
  contentHash?: string;
}

function resolveGeneratedAudioAsset(input: {
  assetUri: string;
  intent: GeneratedAudioIntent;
  plannedItem: GeneratedAudioExecutionReadyItem;
  result: AudioGenerationResult;
  entries: readonly GeneratedAudioAssetResolutionEntry[];
}): GeneratedAudioAssetResolutionReport {
  const issues = validateCleanAssetUri(input.assetUri);
  const entry = input.entries.find((candidate) => candidate.assetUri === input.assetUri);

  if (!entry) {
    issues.push(warn("asset_resolution_not_found"));
  } else {
    if (!entry.approvedForMix) issues.push(warn("asset_not_approved_for_mix"));
    if (entry.intentId && entry.intentId !== input.result.intentId) issues.push(block("asset_intent_mismatch"));
    if (entry.kind && entry.kind !== input.result.kind) issues.push(block("asset_kind_mismatch"));
    if (entry.provider && entry.provider !== input.result.provider) issues.push(block("asset_provider_mismatch"));
    if (entry.modelId && entry.modelId !== input.result.modelId) issues.push(block("asset_model_mismatch"));
    if (entry.providerAssetId && input.result.providerAssetId && entry.providerAssetId !== input.result.providerAssetId) {
      issues.push(block("asset_provider_asset_mismatch"));
    }
    if (
      entry.durationSeconds !== undefined &&
      input.result.durationSeconds !== undefined &&
      Math.abs(entry.durationSeconds - input.result.durationSeconds) > 1
    ) {
      issues.push(block("asset_duration_mismatch"));
    }
    issues.push(...validateCredentialFreeHttps(entry.resolvedUrl));
  }

  const status = issues.some((issue) => issue.severity === "block")
    ? "rejected"
    : issues.some((issue) => issue.severity === "warn")
      ? "review_required"
      : "resolved";

  return {
    status,
    assetUri: input.assetUri,
    resolvedUrl: status === "resolved" ? entry?.resolvedUrl : undefined,
    providerAssetId: entry?.providerAssetId,
    contentHash: entry?.contentHash,
    issues
  };
}
```

## CineJelly Translation Plan

- Add generated-audio asset resolution contracts under `src/types`.
- Add `GeneratedAudioAssetResolver` under `src/core`.
- Add optional operator-owned catalog validation through `docs/reference-implementations/generated-audio-asset-resolution-catalog.md`.
- Refactor `GeneratedAudioOutputValidator` so `asset://` remains review-required unless a resolver is configured.
- When a resolver is configured and returns `resolved`, validate the resolved HTTPS URL through the same safety gate before creating `AudioMixTrack`.
- Preserve the original provider `outputUrl` plus resolver evidence in the validation report.
- Export the resolver/contracts from `src/index.ts`.
- Do not call providers, download media, create generated-audio files, or import from `external/upstream/`.

## Validation Checklist

- Clean `asset://` with no resolver remains `review_required` and produces no audio track.
- Clean `asset://` with an approved clean HTTPS resolver entry produces an approved validation report and audio track.
- Signed or credential-like resolved URLs are rejected.
- Unapproved resolver entries remain `review_required`.
- Identity, kind, provider, model, provider asset, and duration mismatches are rejected when the resolver entry supplies those fields.
- HTTPS output validation behavior remains unchanged for direct provider URLs.
- No provider call, download, file creation, mock output, sample file, or external runtime import is introduced.

Local validation on 2026-06-14:

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- A no-network smoke confirmed unresolved `asset://` output remains review-required without a track, approved clean resolver mapping creates an `AudioMixTrack` from the resolved HTTPS URL, signed/credential-like resolver URLs are rejected, unapproved resolver entries remain review-required, resolver kind mismatches are rejected, and direct HTTPS output validation remains unchanged.
