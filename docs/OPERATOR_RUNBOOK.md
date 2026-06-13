# CineJelly Operator Runbook

This runbook is the Phase 6 operating checklist for taking CineJelly Seedance Ultimate Director from a validated code foundation to a real provider validation run. It does not contain secrets, sample keys, mock providers, or demo production files.

## Current Readiness

As of 2026-06-13, the TypeScript foundation builds and the local preflight command runs. The latest recorded local preflight failed because the workstation did not have Atlas Cloud credentials, verified model IDs, API auth token, FFmpeg, or FFprobe configured.

Do not open customer traffic until all checks in this runbook pass and at least one paid Atlas render has been inspected.

## Required Environment

Configure secrets and provider IDs through environment variables only:

- `ATLASCLOUD_API_KEY`
- `ATLASCLOUD_LLM_MODEL`
- `ATLASCLOUD_SEEDANCE_STANDARD_MODEL`
- `ATLASCLOUD_SEEDANCE_FAST_MODEL`
- `CINEJELLY_API_AUTH_TOKEN`

Recommended production controls:

- `CINEJELLY_OUTPUT_DIR`
- `CINEJELLY_RENDER_COST_USD_PER_SECOND`
- `CINEJELLY_ASSET_REGISTRATION_COST_USD`
- `CINEJELLY_LLM_PLAN_COST_USD`
- `CINEJELLY_COST_BUFFER_MULTIPLIER`
- `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON`

Install and verify media tools:

```powershell
ffmpeg -version
ffprobe -version
```

## Preflight Gate

Run:

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preflight
```

Pass criteria:

- `npm.cmd run typecheck` exits `0`.
- `npm.cmd run build` exits `0`.
- `npm.cmd run preflight` exits `0`.
- Preflight report has no `fail` checks.
- Any `warn` check is reviewed and intentionally accepted before paid rendering.

Hard blockers:

- Missing Atlas key or model IDs.
- Missing `CINEJELLY_API_AUTH_TOKEN` for a protected deployment.
- Missing FFmpeg or FFprobe.
- Invalid Atlas endpoint overrides.
- Output directory cannot be created or written.
- Invalid numeric settings or API port.

## Start API For Validation

Run:

```powershell
npm.cmd start
```

Check health and readiness from another terminal:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/health"
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/v1/preflight"
```

For protected endpoints, send either:

- `Authorization: Bearer <CINEJELLY_API_AUTH_TOKEN>`
- `X-CineJelly-Api-Key: <CINEJELLY_API_AUTH_TOKEN>`

## Paid Atlas Render Validation

Use a short, safe, non-sensitive request. Keep the first paid run small:

- no private customer footage
- no signed URLs
- no embedded credentials in references
- no local filesystem paths in API payloads
- one clear commercial premise
- conservative resolution and quality mode
- explicit `outputPath`, `workDirectory`, and `artifactDirectory` inside the configured output root

Recommended async path:

```powershell
$headers = @{
  "Authorization" = "Bearer $env:CINEJELLY_API_AUTH_TOKEN"
  "Content-Type" = "application/json"
  "Idempotency-Key" = "phase6-paid-validation-001"
}

$body = @{
  userInput = "Create a concise premium product launch video for a fictional smart desk lamp, focused on calm workspace lighting and clean motion."
  settings = @{
    tier = "standard"
    resolution = "480p"
    qualityMode = "economy"
    ratio = "16:9"
    targetDurationSeconds = 120
    maxCostUsd = 5
  }
  outputPath = "phase6-validation/final.mp4"
  workDirectory = "phase6-validation/work"
  artifactDirectory = "phase6-validation/artifacts"
} | ConvertTo-Json -Depth 12

$submit = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/v1/render-jobs" -Headers $headers -Body $body
$submit
```

Poll until terminal:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000$($submit.statusUrl)" -Headers @{
  "Authorization" = "Bearer $env:CINEJELLY_API_AUTH_TOKEN"
}
```

Use synchronous `/v1/render` only for short internal validation when deployment timeout limits are known and acceptable.

## Artifact Inspection Checklist

Inspect the generated artifact manifest and at least these files:

- `manifest.json`
- `run-summary.json`
- `review-packet.json`
- `production-graph.json`
- `material-sourcing-plan.json`
- `stage-lifecycle.json`
- `cost-plan.json`
- `cost-ledger.json`
- `compiled-prompts.json`
- `rendered-shots.json`
- `deliverable.json` when assembly succeeds
- `delivery-gate.json` when delivery validation runs

Required evidence:

- Manifest entries include byte size and SHA-256 hashes.
- `review-packet.json` includes `sourceLineage`, `repairProvenance`, `stageLifecycle`, cost summary, selected candidates, and delivery status.
- `stage-lifecycle.json` contains all stages in order: `plan`, `storyboard`, `prompt`, `source_material`, `render`, `inspect`, `repair`, `assemble`, `deliver`.
- `material-sourcing-plan.json` contains rights requirement and preferred sources for every material brief.
- `cost-ledger.json` contains provider operations with model, graph node, prediction ID when available, latency, retry count, status, and provider usage/cost when returned.
- `production-graph.json` includes `reference_asset`, `reference_selection`, `material_sourcing`, `clip_render`, `inspection_report`, repair, and deliverable evidence as applicable.
- `deliverable.json` includes output byte size and SHA-256 hash.

## Redaction And Safety Checklist

Before marking the validation run acceptable:

- No API response exposes local absolute paths.
- No API response exposes raw stack traces.
- No artifact exposes `ATLASCLOUD_API_KEY`, auth token, bearer headers, signed URLs, or credential-like query strings.
- No inline `data:` media payload appears in public API JSON.
- Failed provider calls have stack-free error name/message details.
- Failure artifacts preserve cost ledger entries created before failure.

## Failure Handling

If preflight fails:

1. Fix environment or media tool installation.
2. Rerun `npm.cmd run preflight`.
3. Do not run paid provider validation until hard failures are gone.

If paid validation fails:

1. Inspect `failure-report.json`, `cost-ledger.json`, and `review-packet.json` if available.
2. Identify the failed stage from `stage-lifecycle.json` or the job status payload.
3. Map the failure to the narrowest module: config, provider, prompt, render, inspect, repair, assemble, or deliver.
4. Apply Faithful Logic Translation if the fix changes source-derived behavior.
5. Rerun typecheck, build, preflight, and then a new paid validation run.

## Release Decision

CineJelly is ready for limited customer traffic only when:

- Typecheck, build, and preflight pass in the deployment environment.
- At least one paid Atlas validation render succeeds.
- Artifacts pass the inspection checklist.
- Redaction checklist passes.
- Remaining warnings are documented in `docs/PROJECT_CONTEXT.md`.
- The run date, environment notes, and remaining blockers are recorded in `docs/IMPLEMENTATION_ROADMAP.md`.
