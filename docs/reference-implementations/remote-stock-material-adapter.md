# Reference Implementation: Remote Stock Material Adapter

Implementation status as of 2026-06-13: implemented as CineJelly-owned TypeScript in remote stock material adapter contracts, runtime configuration, preflight, DirectorAgent material fulfillment, and the public package export surface. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream And Provider Sources

| Source | Snapshot or docs path | License / terms | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/material.py` | MIT | Query stock providers by search term, filter by duration/aspect/quality, keep material stage before composition. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` | MIT | Material gathering is a visible stage and terminal material failures remain operator-visible. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Validate provider configuration before build/render work and expose deterministic review artifacts. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | Approval-gate behavior only; do not copy implementation code. |
| Pexels API docs | `https://www.pexels.com/api/documentation/` | Pexels API terms | Video search uses `Authorization` header, `/v1/videos/search`, video resources include duration, videographer, source page, and video files. |
| Pixabay API docs | `https://pixabay.com/api/docs/` | Pixabay Content License and API terms | Video search uses `/api/videos/`, `key`, `q`, `safesearch`, `per_page`, and hit renditions with width/height/duration. |
| Coverr API docs | `https://api.coverr.co/docs` | Coverr API terms | API requires attribution and has commercial-use restrictions; use only when explicit commercial approval is configured. |

## Behavior To Preserve

1. Remote stock fulfillment is opt-in and disabled unless deployment explicitly enables it.
2. Provider credentials must stay in environment/runtime config and must never appear in candidate URIs, artifacts, logs, or errors.
3. Search uses material brief query terms, duration, aspect ratio, resolution, `allowRemoteSources`, and `preferredSources`.
4. Candidates are bounded by `brief.maxCandidates` and adapter max-result settings.
5. Provider-specific media URLs are accepted only when they are credential-free HTTPS URLs without signed/secret query parameters.
6. Attribution is preserved for every remote stock candidate.
7. Coverr is not treated as commercially approved unless an explicit operator setting confirms commercial approval.
8. `MaterialSourceValidator` remains the final gate; adapters only propose candidates.

## Edge Cases

- Remote stock is disabled: material planning keeps `user_provided` and `local_library` sources only.
- Remote stock is enabled with no approved provider key: runtime config/preflight fails before customer traffic.
- Provider API returns malformed JSON or missing arrays: adapter returns no candidates for that provider/brief and does not throw provider secrets.
- Provider media URL includes credential-like query keys such as `token`, `signature`, or provider OAuth query names: skip that rendition rather than leaking it.
- Provider result duration is shorter than `brief.minimumDurationSeconds`: skip the result.
- Provider result has only an aspect/resolution mismatch: keep the candidate only if it passes safe URI and let `MaterialSourceValidator` mark warning-level fit issues when selected.
- Coverr key is configured but commercial approval is not: ignore Coverr and fail if no other approved provider remains.

## Reference Implementation

```ts
type RemoteStockSource = "pexels" | "pixabay" | "coverr";

type RemoteStockProviderSettings = {
  source: RemoteStockSource;
  apiKey: string;
  commercialUseApproved?: boolean;
  requestTimeoutMs: number;
  maxResultsPerBrief: number;
};

async function resolveRemoteStockCandidates(plan, providers, signal) {
  const candidates = [];
  for (const brief of plan.briefs) {
    if (!brief.allowRemoteSources) continue;

    for (const provider of providers) {
      if (!brief.preferredSources.includes(provider.source)) continue;
      if (provider.source === "coverr" && !provider.commercialUseApproved) continue;

      const query = buildWeightedQuery(brief.queryTerms);
      const response = await searchProvider(provider, query, brief, signal);
      const normalized = response
        .map((item) => normalizeProviderItem(provider.source, item, brief))
        .filter((candidate) => candidate.durationSeconds >= brief.minimumDurationSeconds)
        .filter((candidate) => isCredentialFreeHttps(candidate.uri))
        .sort(byDurationFitThenResolutionThenStableProviderId)
        .slice(0, Math.min(brief.maxCandidates, provider.maxResultsPerBrief));

      candidates.push(...normalized);
    }
  }
  return candidates;
}

function normalizeProviderItem(source, item, brief) {
  const rendition = chooseBestSafeRendition(item.renditions, brief);
  return {
    candidateId: stableId(`${source}:${brief.briefId}:${item.providerAssetId}:${rendition.url}`),
    briefId: brief.briefId,
    source,
    uri: rendition.url,
    providerAssetId: item.providerAssetId,
    sourcePageUrl: item.sourcePageUrl,
    previewUri: item.previewUri,
    durationSeconds: item.durationSeconds,
    aspectRatio: inferAspectRatio(rendition.width, rendition.height),
    resolution: inferResolution(rendition.height),
    rightsStatus: "requires_attribution",
    attribution: item.attribution,
    selected: true
  };
}
```

## CineJelly Rewrite

- Done: add remote stock material settings to `src/types/settings.ts`.
- Done: add remote stock candidate metadata to `src/types/material.ts`.
- Done: add `src/core/remote-stock-material-adapter.ts` as a CineJelly-owned adapter for Pexels, Pixabay, and commercially approved Coverr.
- Done: add runtime env parsing for:
  - `CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS`
  - `CINEJELLY_REMOTE_STOCK_REQUEST_TIMEOUT_MS`
  - `CINEJELLY_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF`
  - `PEXELS_API_KEY`
  - `PIXABAY_API_KEY`
  - `COVERR_API_KEY`
  - `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED`
- Done: wire enabled adapters into `DirectorAgent` through `createDirectorRuntime`.
- Done: update `MaterialSourcingPlanner` call options so remote sources enter briefs only when remote stock is explicitly enabled.
- Done: keep `MaterialSourceValidator` as the final approval gate.

## Validation Checklist

- Remote stock disabled produces no remote candidates and keeps material validation planned-only unless local/user candidates exist.
- Enabling remote stock with no approved provider fails runtime config/preflight.
- Pexels adapter uses an `Authorization` header and never places the API key in URLs.
- Pixabay adapter may place the key only in the outbound API request URL, never in candidate URI/artifacts/errors.
- Coverr adapter is available only when commercial approval is explicitly configured.
- Candidate URIs are credential-free HTTPS and never include signed or secret query keys.
- Attribution is present for selected remote stock candidates.
- Candidate count is bounded by both `brief.maxCandidates` and adapter max results.
- No production runtime import from `external/upstream/`.
