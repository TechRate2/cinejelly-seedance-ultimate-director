# Reference Implementation: Local Material Library Adapter

Implementation status as of 2026-06-13: implemented as CineJelly-owned TypeScript in local material catalog contracts, runtime configuration, preflight, DirectorAgent material fulfillment, and the public package export surface. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Local/material sourcing happens as a deterministic stage before video composition, with visible task progress and bounded candidate lists. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Validate configured inputs before build/render work, keep source-material reports deterministic and operator-reviewable. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | Real-footage approval ideas inform source-material gating only; no implementation code is reused. |

## Behavior To Preserve

1. Local material fulfillment must be explicit and configured by an operator-owned catalog, not hardcoded sample media.
2. Local filesystem paths must not be emitted into public artifacts or API responses.
3. Candidate URIs must be artifact-safe `asset://...` or credential-free HTTPS values.
4. Catalog items must be filtered by approved brief source, purpose, search terms, rights status, and duration/format metadata.
5. Candidate selection must be deterministic and bounded by each brief's `maxCandidates`.
6. Missing catalog configuration must keep source-material stage in `planned_only`, not pretend local fulfillment occurred.
7. Validation remains centralized in `MaterialSourceValidator`; adapter fulfillment should not bypass the validation gate.

## Edge Cases

- No catalog path is configured: DirectorAgent still emits a material sourcing plan and `planned_only` validation report.
- Catalog file is malformed: runtime config/preflight fails before customer traffic.
- Catalog item has a local path but no safe `assetUri`: adapter rejects it from output rather than leaking filesystem paths.
- Catalog item source is not allowed by the brief: adapter does not select it; validation can still reject if supplied elsewhere.
- Item rights are `unverified` or `rejected`: adapter may expose it as an unselected candidate for operator review, but it must not select it.
- Multiple items tie on score: stable tie-break by label then asset id.

## Reference Implementation

```ts
type LocalMaterialCatalog = {
  catalogId?: string;
  entries: LocalMaterialCatalogEntry[];
};

type LocalMaterialCatalogEntry = {
  assetId: string;
  label: string;
  assetUri: string; // asset:// or clean https:// only
  source: "local_library" | "user_provided";
  purposes?: MaterialPurpose[];
  tags?: string[];
  durationSeconds?: number;
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
  rightsStatus: MaterialRightsStatus;
  attribution?: string;
  contentHash?: string;
};

async function resolveLocalMaterialCandidates(plan: MaterialSourcingPlan, catalog: LocalMaterialCatalog) {
  const candidates = [];
  for (const brief of plan.briefs) {
    const ranked = catalog.entries
      .filter((entry) => brief.preferredSources.includes(entry.source))
      .filter((entry) => !entry.purposes?.length || entry.purposes.includes(brief.purpose))
      .map((entry) => score(entry, brief))
      .sort(byScoreThenStableIdentity);

    for (const rankedEntry of ranked.slice(0, brief.maxCandidates)) {
      candidates.push({
        candidateId: stableId(brief.briefId + rankedEntry.entry.assetId),
        briefId: brief.briefId,
        source: rankedEntry.entry.source,
        uri: rankedEntry.entry.assetUri,
        durationSeconds: rankedEntry.entry.durationSeconds,
        aspectRatio: rankedEntry.entry.aspectRatio,
        resolution: rankedEntry.entry.resolution,
        rightsStatus: rankedEntry.entry.rightsStatus,
        attribution: rankedEntry.entry.attribution,
        contentHash: rankedEntry.entry.contentHash,
        selected: rankedEntry.isProductionSafe
      });
    }
  }
  return candidates;
}
```

## CineJelly Rewrite

- Done: add local material catalog types to `src/types/material.ts`.
- Done: add `src/core/local-material-library-adapter.ts` that reads an operator-provided JSON catalog or accepts an in-memory catalog from production wiring.
- Done: add `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` runtime config and preflight validation.
- Done: wire configured local adapter into `DirectorAgent`, resolving candidates after material planning and before `MaterialSourceValidator`.
- Done: export the adapter through `src/index.ts` for controlled production integration.
- Keep selected candidates in `material-source-validation.json`; do not add sample/demo assets.

## Validation Checklist

- Missing catalog path keeps material validation `planned_only`.
- Malformed catalog fails config/preflight.
- Local adapter never emits local filesystem paths in candidate `uri`.
- Safe catalog entries produce deterministic selected candidates up to `maxCandidates`.
- Rejected/unverified rights are not selected by the adapter.
- `MaterialSourceValidator` remains the final source-material gate.
- No production runtime import from `external/upstream/`.
