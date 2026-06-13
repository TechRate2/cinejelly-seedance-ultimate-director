# Reference Implementation: Material Source Adapter Validation

Implementation status as of 2026-06-13: CineJelly-owned production foundation implemented in material source contracts, `MaterialSourceValidator`, DirectorAgent stage evidence, durable artifacts, and operator validation. `npm.cmd run typecheck`, `npm.cmd run build`, a local material-validator smoke check, and a temporary artifact-validation smoke check passed. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Material sourcing happens before final composition; task stages expose source/asset progress; terminal failures are operator-visible. |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Validate -> plan/cost -> build/render -> inspect/report ordering, deterministic artifact discipline, and reviewable reports. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | Approval-gate and real-footage validation concepts are used as behavior notes only; no implementation code is reused. |

## Behavior To Preserve

1. Material sourcing must remain a separate stage before render/assembly evidence.
2. A material candidate must be tied to a known sourcing brief before it can be selected.
3. Remote stock candidates must be rejected when the brief disallows remote sources.
4. Candidate rights must be explicit: unverified or rejected rights cannot silently become production-approved.
5. Attribution-required material must carry attribution before it is selected.
6. Candidate URI safety must be checked before artifacts or review packets expose it.
7. Validation output must be deterministic and artifact-friendly so operators can inspect selected, rejected, and review-required candidates.

## Edge Cases

- No adapter has fulfilled candidates yet: report `planned_only`, preserve briefs, and keep the run honest without pretending stock validation happened.
- Candidate references an unknown `briefId`: reject that candidate and block material-source validation.
- Candidate source is not in `preferredSources`: block the candidate because the adapter violated the approved plan.
- Remote source appears while `allowRemoteSources` is false: block the candidate.
- Candidate URI contains embedded credentials, non-HTTPS remote URL, signed query material, or inline `data:` media: block the candidate.
- Candidate duration is shorter than `minimumDurationSeconds` and the candidate is selected: block it.
- Candidate aspect ratio or resolution differs from the brief: warn, because cropping/scaling may still be possible but needs operator review.

## Reference Implementation

```ts
type MaterialSourceValidationStatus = "planned_only" | "approved" | "review_required" | "rejected";

function validateMaterialCandidates(plan: MaterialSourcingPlan, candidates: MaterialCandidate[]): MaterialSourceValidationReport {
  const issues: MaterialSourceValidationIssue[] = [];
  const briefsById = indexBy(plan.briefs, (brief) => brief.briefId);

  for (const candidate of candidates) {
    const brief = briefsById.get(candidate.briefId);
    if (!brief) {
      issues.push(block("unknown_brief", candidate, "Candidate is not tied to a known material brief."));
      continue;
    }

    if (!brief.preferredSources.includes(candidate.source)) {
      issues.push(block("source_not_preferred", candidate, "Adapter returned a source outside the approved source list."));
    }

    if (!brief.allowRemoteSources && isRemoteStock(candidate.source)) {
      issues.push(block("remote_source_not_allowed", candidate, "Remote stock is disabled for this brief."));
    }

    if (!safeMaterialUri(candidate.uri, candidate.source)) {
      issues.push(block("unsafe_uri", candidate, "Material URI is not safe for production artifacts."));
    }

    if (candidate.rightsStatus === "rejected" || (candidate.selected && candidate.rightsStatus === "unverified")) {
      issues.push(block("rights_not_approved", candidate, "Selected material must have approved or attributable rights."));
    }

    if (candidate.rightsStatus === "requires_attribution" && !candidate.attribution?.trim()) {
      issues.push(block("attribution_missing", candidate, "Attribution-required material must carry attribution."));
    }

    if (candidate.selected && candidate.durationSeconds !== undefined && candidate.durationSeconds < brief.minimumDurationSeconds) {
      issues.push(block("duration_too_short", candidate, "Selected material is shorter than the brief minimum."));
    }

    if (candidate.selected && candidate.aspectRatio && candidate.aspectRatio !== brief.aspectRatio) {
      issues.push(warn("aspect_ratio_mismatch", candidate, "Operator review required before crop/scale."));
    }
  }

  if (candidates.length === 0) {
    return report("planned_only", plan, candidates, issues);
  }
  if (issues.some((issue) => issue.severity === "block")) {
    return report("rejected", plan, candidates, issues);
  }
  if (issues.some((issue) => issue.severity === "warn")) {
    return report("review_required", plan, candidates, issues);
  }
  return report("approved", plan, candidates, issues);
}
```

## CineJelly Rewrite

- Extend `src/types/material.ts` with adapter, candidate validation, issue, and report contracts.
- Implement `src/core/material-source-validator.ts` as a deterministic candidate validation gate.
- Wire `DirectorAgent` to emit a `MaterialSourceValidationReport` after material planning and before graph/stage artifacts.
- Include the report in stage lifecycle evidence, durable artifacts, review packets, and artifact validation.
- Keep stock API fulfillment out of this implementation; real adapters can implement the new contract later without changing the validation gate.

## Validation Checklist

- `MaterialSourceValidator` reports `planned_only` when no adapter candidates are supplied.
- Unknown brief IDs, unapproved remote sources, unsafe URIs, selected unverified rights, and missing attribution produce blocking issues.
- Aspect ratio/resolution mismatch produces review-required evidence without silently approving the candidate.
- Stage lifecycle source-material evidence includes material validation status and selected candidate counts.
- Durable artifacts include `material-source-validation.json`.
- Artifact validator checks the material validation report shape and blocks malformed reports.
- No production runtime import from `external/upstream/`.
