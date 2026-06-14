# Beginner Quickstart

## Purpose

This is the shortest path for a non-specialist operator to get CineJelly running without missing required setup.

For deeper details, read `docs/RUNNING_AND_MODEL_SETTINGS_GUIDE.md`.

## What Is Automatic

The setup scripts can:

- create or update local `.env`
- generate `CINEJELLY_API_AUTH_TOKEN`
- keep existing secret values without overwriting them
- write documented Seedance capability assumptions for the configured Standard/Fast model IDs
- create `assets/output_deliverables`
- detect FFmpeg and FFprobe from `PATH`
- detect FFmpeg and FFprobe installed through Windows winget package folders
- install npm dependencies when using the Windows setup script
- install FFmpeg on Windows when `winget` is available
- run preflight
- run a no-spend doctor check that prepares local config, validates the request path, starts a temporary API when needed, and summarizes readiness

The setup scripts cannot:

- create an Atlas Cloud account
- know your Atlas Cloud API key
- guarantee the current Atlas model catalog has not changed
- run a paid render safely without your approval
- release to customers before paid render validation and artifact inspection

## Windows One-Command Setup

From the repository root:

```powershell
npm.cmd run setup:windows
```

If this finishes with `status: "fail"`, read the failing check names. The most common missing value is `ATLASCLOUD_API_KEY`.

Open `.env` and fill:

```env
ATLASCLOUD_API_KEY=
ATLASCLOUD_LLM_API_KEY=
```

`ATLASCLOUD_LLM_API_KEY` is optional. If it is blank, CineJelly uses `ATLASCLOUD_API_KEY` for LLM calls.

Run again:

```powershell
npm.cmd run doctor
```

`doctor` does not call Atlas rendering. It runs local setup plus the no-spend validation smoke and tells you whether the environment is ready for paid validation review.

## Universal Setup

For macOS, Linux, or Windows users who already installed FFmpeg/FFprobe:

```bash
npm install
npm run doctor
```

On Windows, use `npm.cmd` if plain `npm` is not available in the shell:

```powershell
npm.cmd install
npm.cmd run doctor
```

## Clean Source Rules

Keep the source clean before every push:

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run doctor
git status --short
```

Expected:

- Typecheck passes.
- Build passes.
- Preflight is `pass` or an understood `warn`.
- `.env` does not appear as a tracked file.
- Generated media under `assets/output_deliverables` does not appear as tracked files.

Secret check:

```powershell
rg -n "apikey-[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|ATLASCLOUD_API_KEY\s*=\s*\S+|ATLASCLOUD_LLM_API_KEY\s*=\s*\S+|CINEJELLY_API_AUTH_TOKEN\s*=\s*\S+" README.md docs src package.json schemas .env.production.template
```

Expected: no matches.

## Current Model Defaults

The local setup script writes these model IDs when `.env` does not already contain values:

```env
ATLASCLOUD_LLM_MODEL=qwen/qwen3-vl-30b-a3b-thinking
ATLASCLOUD_SEEDANCE_STANDARD_MODEL=bytedance/seedance-2.0/reference-to-video
ATLASCLOUD_SEEDANCE_FAST_MODEL=bytedance/seedance-2.0-fast/reference-to-video
```

Verify the current model IDs in Atlas Cloud before customer release.
`setup:local` also writes `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON` using documented assumptions for these model IDs, which avoids local preflight warnings but still needs catalog verification before customer release.

## Settings Users Can Control

These settings are accepted in render request JSON and can be exposed by a future UI:

| Setting | Options |
| --- | --- |
| `tier` | `fast`, `standard` |
| `resolution` | `480p`, `720p`, `1080p` |
| `qualityMode` | `economy`, `standard`, `high`, `ultimate` |
| `ratio` | `adaptive`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16` |
| `durationTargetSeconds` | `1` to `480` |
| `audioMode` | `none`, `native`, `guided`, `post`, `hybrid` |
| `watermark` | `true`, `false` |
| `returnLastFrame` | `true`, `false` |
| `maxCostUsd` | non-negative number |

There is no first-party web UI in this repo yet. Current usage is through CLI validation commands and the HTTP API.

## Safe First API Run

Start the API:

```powershell
npm.cmd run start
```

Health check:

```powershell
Invoke-RestMethod http://localhost:8787/health
```

Readiness check:

```powershell
Invoke-RestMethod http://localhost:8787/v1/validation-readiness
```

For paid render validation, follow `docs/OPERATOR_RUNBOOK.md`. Do not open customer traffic until paid render validation, artifact validation, artifact inspection, and redaction review are complete.

To check the final release gate without spending credits:

```powershell
npm.cmd run validation:release-audit
```

This will stay `blocked` until paid render evidence exists. That is normal before the first approved Atlas validation render.

## Create A Safe Validation Request

Before spending Atlas credits, create a local request file and validate it without provider calls:

```powershell
npm.cmd run validation:create-request -- --safe-default
npm.cmd run validation:render-request -- --request "assets/output_deliverables/phase6-validation/request.json"
```

Or run the full local no-spend smoke:

```powershell
npm.cmd run doctor
```

This creates or updates local `.env`, creates the safe request, runs typecheck/build/readiness/request validation, starts a temporary API if needed, checks `/health` plus `/v1/validation-readiness`, and prints a short readiness summary.
It also writes `assets/output_deliverables/phase6-validation/local-smoke-report.json` as a local evidence report. That folder is ignored by Git.

For your own brief:

```powershell
npm.cmd run validation:create-request -- --user-input "Create a short premium commercial for a fictional product with no customer data."
```

The generated request file is stored under `assets/output_deliverables`, which is ignored by Git. It contains no API keys and does not call Atlas.
