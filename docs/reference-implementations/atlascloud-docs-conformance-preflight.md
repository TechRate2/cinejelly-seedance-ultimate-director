# AtlasCloud Docs Conformance Preflight

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend runtime preflight check in `src/application/runtime-preflight.ts`. This Reference Implementation is documentation-only and must not import or execute provider SDK code.

## Source Contracts

| Source | Contract Used | CineJelly Boundary |
| --- | --- | --- |
| Atlas Cloud Coding Plan API docs | Coding Plan traffic uses an Atlas API key and OpenAI-compatible base URL `https://api.atlascloud.ai/v1`; production should prefer a dedicated Coding Plan key when the wallet layout requires it. | LLM calls use the configured LLM/Coding Plan key and `/v1/chat/completions` path, falling back to the media key only as an operator-approved temporary fallback. |
| Atlas Cloud Upload Files docs | Media upload uses `POST https://api.atlascloud.ai/api/v1/model/uploadMedia` with bearer-token authentication. | Asset registration builds upload requests from the media base URL plus `/model/uploadMedia`. |
| Atlas Cloud Seedance `generateVideo` docs | Video generation uses `POST /api/v1/model/generateVideo` with a `model` string and prompt settings. | Seedance requests build from the media base URL plus `/model/generateVideo`; model IDs stay operator-configured. |
| Atlas Cloud xAI TTS `generateAudio` model page | Generated-audio/TTS uses `POST /api/v1/model/generateAudio`, returns a prediction ID, and charges by input text characters. | Generated-audio validation uses the media base URL plus `/model/generateAudio`, explicit cost assumptions, and manual-review gates before business readiness. |
| Atlas Cloud Predictions docs | Async media tasks return `data.id`; polling uses `GET /api/v1/model/prediction/{id}` and returns output URLs in `data.outputs`. | Provider polling tries the prediction route first for video and audio before documented result compatibility routes. |
| Atlas Cloud Get Results docs | Generation result compatibility uses `GET /api/v1/model/result/{request_id}` and Quick Start also documents `GET /api/v1/model/getResult?predictionId=...`. | Provider polling keeps both compatibility routes available only after the prediction route is unavailable. |
| Atlas Cloud Billing Public API docs | Balance evidence uses `GET /public/v1/balance` with an Atlas API key. | Paid-validation billing gates treat `/balance` as no-spend network evidence before provider spend. |

## Behavior Requirements

1. The preflight check must be no-spend and must not call Atlas, render endpoints, billing endpoints, upload endpoints, FFmpeg, stock providers, or deployment hosts.
2. It must validate Atlas endpoint families from local configuration only:
   - Coding Plan / LLM base resolves to `/v1`.
   - Media/model base resolves to `/api/v1`.
   - Billing evidence path remains `/public/v1/balance`.
   - Media/model path construction includes upload, video submit, audio submit, prediction polling, and result compatibility endpoints.
3. It must preserve the repo's existing alias behavior:
   - `ATLASCLOUD_LLM_BASE_URL` or `ATLASCLOUD_API_BASE_URL` selects the LLM base.
   - `ATLASCLOUD_MEDIA_BASE_URL`, `ATLASCLOUD_BASE_URL`, or `ATLASCLOUD_ASSET_BASE_URL` selects the media/model base.
4. It must not print secret key values. Comparing two configured key values is allowed only inside the process, and the report may warn when both configured key variables intentionally share one value without revealing either value.
5. If explicit Seedance capability JSON is configured, the configured fast and standard model IDs must both be covered by capability records so tier/model selection cannot pass preflight and then fail later with `MODEL_UNAVAILABLE`.
6. Capability records for Atlas-backed Seedance and generated-audio execution must name provider `atlascloud`.
7. Custom HTTPS endpoint hosts may warn rather than fail, but official `api.atlascloud.ai` endpoints must use the documented path families exactly.

## Edge Cases

- `ATLASCLOUD_BASE_URL=https://api.atlascloud.ai/api/v1` is valid for media/model traffic.
- `ATLASCLOUD_API_BASE_URL=https://api.atlascloud.ai/api/v1` is invalid because that alias feeds the LLM/Coding Plan base and should be `/v1`.
- `ATLASCLOUD_BASE_URL=https://api.atlascloud.ai/v1` is invalid for media/model traffic because it would construct `generateVideo`, `generateAudio`, and prediction polling under the LLM path family.
- Missing `ATLASCLOUD_LLM_API_KEY` warns because current runtime can fall back to the media key, but commercial operators should use Atlas's separate Coding Plan key when their Atlas wallet layout requires it.
- Identical media and LLM key values warn, rather than fail, so an operator can temporarily reuse a known-working Atlas key during paid validation when the separate Coding Plan key is returning authentication or plan errors. The warning still requires explicit `--allow-warnings` before provider spend and does not satisfy customer-traffic readiness by itself.
- Capability JSON that is syntactically invalid is left to the existing capability-specific preflight checks; the docs-conformance check must not duplicate every schema error.

## Validation Checklist

- `npm.cmd run preflight` emits `atlascloud_docs_conformance: pass` with the current ignored `.env`.
- Local smoke readiness includes the check without making network or provider calls.
- A misconfigured official Atlas LLM base path fails before paid validation.
- A misconfigured official Atlas media base path fails before paid validation, including the generated-audio and prediction polling endpoints.
- A configured Seedance capability list that omits the fast or standard model fails before runtime/provider creation.
- Reports never include raw API keys, local paths from this check, signed URLs, inline media, or stack traces.
