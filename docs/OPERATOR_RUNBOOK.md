# CineJelly Operator Runbook

This runbook is the Phase 6 operating checklist for taking CineJelly Seedance Ultimate Director from a validated code foundation to a real provider validation run. It does not contain secrets, sample keys, mock providers, or demo production files.

## Current Readiness

As of 2026-06-13T19:55:11.106Z (2026-06-14 Asia/Saigon), the TypeScript foundation builds, the local preflight command runs, and `npm.cmd run validation:readiness` plus `GET /v1/validation-readiness` can produce a redacted Phase 6 readiness report. The latest recorded local CLI validation had 54 readiness checks: 46 pass, 1 warn, and 7 fail; an earlier HTTP readiness route returned `503` with the same blocked decision. It remained blocked because the workstation did not have Atlas Cloud credentials, verified model IDs, API auth token, FFmpeg, or FFprobe configured through `PATH` or explicit media tool paths.

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
- `CINEJELLY_FFMPEG_PATH`
- `CINEJELLY_FFPROBE_PATH`
- `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH`
- `CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS`
- `CINEJELLY_REMOTE_STOCK_REQUEST_TIMEOUT_MS`
- `CINEJELLY_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF`
- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`
- `COVERR_API_KEY`
- `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED`
- `CINEJELLY_RENDER_COST_USD_PER_SECOND`
- `CINEJELLY_ASSET_REGISTRATION_COST_USD`
- `CINEJELLY_LLM_PLAN_COST_USD`
- `CINEJELLY_COST_BUFFER_MULTIPLIER`
- `CINEJELLY_MAX_GENERATED_AUDIO_INTENTS`
- `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON`

Install and verify media tools:

```powershell
ffmpeg -version
ffprobe -version
```

If the deployment uses portable media-tool binaries instead of global `PATH`, set `CINEJELLY_FFMPEG_PATH` and `CINEJELLY_FFPROBE_PATH` to executable command paths and then run preflight. Preflight and runtime media engines use the same resolved commands, so a path override must be validated before paid provider work.

`CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` is optional. When set, it must point to an operator-owned JSON catalog whose entries use safe `asset://` or credential-free HTTPS `assetUri` values, approved rights metadata, bounded labels/tags, and no local filesystem paths or signed URL credentials. Missing this variable keeps material fulfillment in a planned-only state.

`CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS=true` is optional and enables remote stock material adapters. At least one approved provider key must be configured. Pexels uses `PEXELS_API_KEY`, Pixabay uses `PIXABAY_API_KEY`, and Coverr uses `COVERR_API_KEY` only when `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED=true` confirms the deployment has accepted the required commercial terms. Provider keys must never appear in request payloads, artifacts, or logs.

`CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS=true` is optional and enables automatic source-video deconstruction for clean HTTPS `source_video_structure` references when the request does not already include `sourceVideoAnalysis`. Configure `CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR`, `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS`, `CINEJELLY_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES`, and `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FAIL_ON_ERROR` as needed. Keep the default fail-open behavior for early validation; set fail-on-error only when the configured multimodal LLM and FFmpeg frame extraction are validated for production inputs.

`CINEJELLY_MAX_GENERATED_AUDIO_INTENTS` controls how many generated-audio planning requests the API accepts per render request. These intents are recorded as reviewable generated-audio evidence for narration, BGM, ambience, or SFX; CineJelly can plan provider-neutral requests, validate provider results, and resolve reviewed generated-audio `asset://` outputs to credential-free HTTPS mix inputs, but it does not call an audio generation provider until verified provider execution wiring passes its own Reference Implementation, live validation, and output review.

`CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH` is optional. When set, it must point to an operator-owned JSON catalog whose entries map clean generated-audio `asset://` outputs to credential-free HTTPS delivery URLs, include boolean `approvedForMix`, avoid duplicate `assetUri` values, and carry optional intent/provider/model/duration evidence when available. Preflight validates this catalog only; it does not call audio providers or create generated-audio assets.

## Preflight Gate

Run:

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd run preflight
npm.cmd run validation:readiness
```

Pass criteria:

- `npm.cmd run typecheck` exits `0`.
- `npm.cmd run build` exits `0`.
- `npm.cmd run preflight` exits `0`.
- `npm.cmd run validation:readiness` exits `0` and the report decision is `ready_for_paid_validation` or `review_warnings`.
- Preflight report has no `fail` checks.
- Any `warn` check is reviewed and intentionally accepted before paid rendering.

To persist the readiness report with validation evidence:

```powershell
npm.cmd run validation:readiness -- --output "phase6-validation/readiness-report.json"
```

The readiness report is a pre-paid gate only. It must not be used as release approval without the paid Atlas render, artifact validation, artifact inspection, and redaction review below.

Hard blockers:

- Missing Atlas key or model IDs.
- Missing `CINEJELLY_API_AUTH_TOKEN` for a protected deployment.
- Missing FFmpeg or FFprobe on `PATH` or through `CINEJELLY_FFMPEG_PATH` / `CINEJELLY_FFPROBE_PATH`.
- Invalid Atlas endpoint overrides.
- Invalid local material catalog path or unsafe catalog asset URI when `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` is set.
- Remote stock enabled without an approved provider key.
- Coverr remote stock enabled without explicit commercial approval.
- Source-video auto-analysis enabled with an invalid or unwritable frame work directory.
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
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/v1/validation-readiness"
```

For protected endpoints, send either:

- `Authorization: Bearer <CINEJELLY_API_AUTH_TOKEN>`
- `X-CineJelly-Api-Key: <CINEJELLY_API_AUTH_TOKEN>`

`/v1/preflight` and `/v1/validation-readiness` are diagnostic endpoints. They remain available when `CINEJELLY_API_AUTH_TOKEN` is not configured so a fresh deployment can report missing configuration, but once a token is configured they use the same authentication guard as other `/v1` endpoints.

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

While the job is running, the job payload should expose `currentStage`, `currentStageStatus`, `progressEventCount`, and retained `stageProgressEvents` in the per-job response. The list endpoint `/v1/render-jobs` should stay compact and expose current-stage fields without the full event array.

After the job reaches a terminal state and artifacts were written, the job payload should expose `hasArtifactValidation`, `artifactValidationStatus`, and detailed `artifactValidation.checks` in the per-job response. The list endpoint should keep only compact validation status, not the full check array. Treat `artifactValidationStatus=fail` as a release blocker even when the render job status is `succeeded`.

Use synchronous `/v1/render` only for short internal validation when deployment timeout limits are known and acceptable. Its success or failure response should include `artifactValidation` when artifacts were written; treat `artifactValidation.status=fail` as a release blocker.

## Automated Artifact Validation

After the run writes artifacts, validate the project artifact directory:

```powershell
npm.cmd run validate:artifacts -- "phase6-validation/artifacts"
```

The validator accepts either the parent artifact directory or the project-specific child directory that contains `manifest.json`.

Pass criteria:

- command exits `0`
- report status is `pass` or an intentionally reviewed `warn`
- manifest byte sizes and SHA-256 hashes match every listed artifact
- required success or failure artifacts are present
- `review-packet.json`, `stage-lifecycle.json`, `material-sourcing-plan.json`, `material-source-validation.json`, `postproduction-assets.json`, `production-graph.json`, `cost-ledger.json`, and `deliverable.json` domain checks pass when present
- no artifact contains secret-like text, inline `data:` media, or credential-like URL query strings

## Artifact Inspection Checklist

Inspect the generated artifact manifest and at least these files:

- `manifest.json`
- `run-summary.json`
- `review-packet.json`
- `production-graph.json`
- `material-sourcing-plan.json`
- `material-source-validation.json`
- `postproduction-assets.json`
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
- Async job `stageProgressEvents` use the same stage vocabulary and include bounded evidence without local paths, inline media, secrets, stack traces, or raw provider payloads.
- `material-sourcing-plan.json` contains rights requirement and preferred sources for every material brief.
- `material-source-validation.json` records `planned_only`, `approved`, `review_required`, or `rejected` status, candidate counts, selected candidate counts, and issue repair text.
- `postproduction-assets.json` records caption delivery mode, caption cue counts, audio role counts, generated-audio planned-only status/counts, postproduction status, issue count, and repair text without claiming provider-backed TTS/BGM/ambience/SFX generation unless a separate module produced that evidence.
- If provider-backed generated-audio execution produced a batch validation report, `generated-audio-output-batch-validation.json` records status/counts, approved tracks, issues, and result reports; `review-packet.json` planning exposes matching generated-audio batch status/counts and repair recommendations; validator output has no generated-audio batch consistency failures.
- Validator output has no `postproduction_asset_consistency` failures; postproduction status, caption/audio counts, generated-audio status/counts, and issue counts agree across `postproduction-assets.json`, `run-summary.json`, `review-packet.json`, and assemble-stage lifecycle evidence.
- If a local material catalog is configured, selected candidates in `material-source-validation.json` use safe `asset://` or credential-free HTTPS URIs and preserve rights/attribution metadata.
- If a generated-audio asset resolution catalog is configured, preflight reports it as valid and does not expose server-local catalog paths, signed URLs, or credential-bearing URLs.
- If remote stock is enabled, selected candidates in `material-source-validation.json` use credential-free HTTPS media URIs, preserve provider asset IDs/source page/preview metadata when safe, and include attribution/license labels.
- If source-video auto-analysis is enabled and the request has a clean HTTPS `source_video_structure` reference without caller-supplied analysis, `source-video-analysis.json` should contain normalized scene/keyframe/pacing/style/safety structure without local frame paths, inline `data:` URLs, or signed source URLs.
- `cost-ledger.json` contains provider operations with model, graph node, prediction ID when available, latency, retry count, status, and provider usage/cost when returned.
- `production-graph.json` includes `reference_asset`, `reference_selection`, `material_sourcing`, `clip_render`, `inspection_report`, repair, and deliverable evidence as applicable.
- `deliverable.json` includes output byte size and SHA-256 hash.
- Per-job API `artifactValidation` omits server-local `artifactDirectory` and `manifestPath`; it should expose status, manifest file name, counts, and checks only.
- `npm.cmd run validate:artifacts -- <artifact-directory>` passes or any warning is explicitly reviewed.

## Redaction And Safety Checklist

Before marking the validation run acceptable:

- No API response exposes local absolute paths.
- No API response exposes raw stack traces.
- No artifact exposes `ATLASCLOUD_API_KEY`, auth token, bearer headers, signed URLs, or credential-like query strings.
- No artifact exposes `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `COVERR_API_KEY`, or provider download URLs with credential-like query strings.
- No inline `data:` media payload appears in public API JSON.
- Failed provider calls have stack-free error name/message details.
- Failure artifacts preserve cost ledger entries created before failure.

## Failure Handling

If preflight fails:

1. Fix environment, media tool installation, or configured media tool paths.
2. Rerun `npm.cmd run preflight` and `npm.cmd run validation:readiness`.
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
- Validation readiness report is archived and has no hard blockers.
- At least one paid Atlas validation render succeeds.
- Artifacts pass the inspection checklist.
- The retained job detail has `artifactValidationStatus=pass`, or any `warn` is explicitly reviewed and no `fail` remains.
- Material source validation is either `planned_only` for generated-only runs or `approved`/explicitly reviewed for runs using adapter candidates.
- Redaction checklist passes.
- Remaining warnings are documented in `docs/PROJECT_CONTEXT.md`.
- The run date, environment notes, and remaining blockers are recorded in `docs/IMPLEMENTATION_ROADMAP.md`.
