# Reference Implementation: Generated Audio Asset Resolution Catalog

Implementation status as of 2026-06-14: implemented foundation for an operator-owned JSON catalog that feeds `GeneratedAudioAssetResolver`. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code. The catalog loader must not call providers, download media, inspect waveform data, mint delivery URLs, or create generated audio files.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/task.py` | MIT | Long-running media stages should expose prepared artifact state before final composition. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo/app/services/voice.py` | MIT | TTS/voice output should be explicit stage evidence rather than an implicit final-video side effect. |
| `vericontext/vibeframe` | `external/upstream/vibeframe/README.md` and `external/upstream/vibeframe/ROADMAP.md` | MIT | Operator-facing artifact reports and dry-run validation should catch missing/invalid inputs before expensive work. |
| `calesthio/OpenMontage` | `external/upstream/openmontage/AGENT_GUIDE.md` | AGPL-3.0 | Approval-before-batch and media review concepts are behavior notes only. |

## Behavior To Preserve

1. Generated-audio asset resolution is explicit operator/provider evidence, not an implicit runtime side effect.
2. Catalog entries must use clean `asset://` source URIs and clean credential-free HTTPS resolved URLs.
3. Catalog entries must include `approvedForMix` so unresolved or unapproved generated audio remains visible as review-required evidence.
4. Optional identity fields (`intentId`, `kind`, `provider`, `modelId`, `providerAssetId`, `durationSeconds`) should tighten matching when available.
5. Duplicate `assetUri` entries are invalid because they make resolution non-deterministic.
6. Runtime preflight should validate catalog shape and URI safety without echoing local file paths or secrets in public output.
7. The loader should be usable by future generated-audio execution without changing the resolver contract.

## Edge Cases

- Catalog env var is absent: pass; generated-audio asset resolution catalog is disabled.
- Catalog path contains control characters: fail preflight.
- Catalog file cannot be read or is not JSON: fail preflight.
- Catalog payload is not an object or `entries` is not an array: fail preflight.
- Entry has duplicate `assetUri`: fail preflight.
- Entry `assetUri` has query or fragment: fail preflight.
- Entry `resolvedUrl` is HTTP, local path, `data:`, embedded-credential, or signed/credential query URL: fail preflight.
- Entry `approvedForMix` is missing or not boolean: fail preflight.
- Entry `durationSeconds` is zero/negative/non-finite: fail preflight.
- Valid empty catalog: pass and report zero entries configured.

## Reference Implementation

```ts
interface GeneratedAudioAssetResolutionCatalog {
  catalogId?: string;
  entries: GeneratedAudioAssetResolutionEntry[];
}

function loadGeneratedAudioAssetResolverFromCatalog(path?: string): GeneratedAudioAssetResolver | undefined {
  if (!path) return undefined;
  const parsed = readJson(path);
  const catalog = normalizeCatalog(parsed);
  return new GeneratedAudioAssetResolver({ entries: catalog.entries });
}

function normalizeCatalog(value: unknown): GeneratedAudioAssetResolutionCatalog {
  const payload = object(value, "Catalog must be an object.");
  const entries = array(payload.entries, "entries must be an array.")
    .map((entry, index) => normalizeEntry(entry, index));
  ensureUnique(entries.map((entry) => entry.assetUri), "assetUri");
  return {
    catalogId: optionalString(payload.catalogId),
    entries
  };
}
```

## CineJelly Translation Plan

- Add `GeneratedAudioAssetResolutionCatalog` type beside resolver entry/report types.
- Make `GeneratedAudioAssetResolver` validate/normalize catalog entries at construction time.
- Add runtime setting `generatedAudio.assetResolutionCatalogPath`.
- Add env var `CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH`.
- Add preflight validation that reads and normalizes the catalog without exposing absolute paths or raw entry URLs.
- Export catalog-aware resolver behavior through existing `src/index.ts` exports.
- Keep provider-backed audio generation disabled until provider schema, model IDs, pricing, execution, output validation, artifact validation, and paid validation are complete.

## Validation Checklist

- Missing catalog env passes and reports resolution catalog disabled.
- Valid catalog passes and reports entry count.
- Invalid catalog shape fails preflight.
- Duplicate `assetUri` fails preflight.
- Unsafe `assetUri` or `resolvedUrl` fails preflight.
- Resolver behavior remains deterministic after catalog normalization.
- No provider calls, media downloads, generated files, sample files, or runtime imports from `external/upstream/` are introduced.

Local validation on 2026-06-14:

- `npm.cmd run typecheck` passed.
- `npm.cmd run build` passed.
- A no-network smoke confirmed valid catalog normalization, duplicate `assetUri` rejection, signed/credential-like resolved URL rejection, runtime setting loading, and `RuntimePreflight` pass reporting for a temporary valid catalog file.
