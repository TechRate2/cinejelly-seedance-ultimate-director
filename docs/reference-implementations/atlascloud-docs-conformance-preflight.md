# AtlasCloud Docs Conformance Preflight

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend runtime preflight check in `src/application/runtime-preflight.ts`. This Reference Implementation is documentation-only and must not import or execute provider SDK code.

## Source Contracts

| Source | Contract Used | CineJelly Boundary |
| --- | --- | --- |
| Atlas Cloud Coding Plan API docs | Coding Plan traffic uses a dedicated key and OpenAI-compatible base URL `https://api.atlascloud.ai/v1`. | LLM calls use the LLM/Coding Plan key and `/v1/chat/completions` path. |
| Atlas Cloud Upload Files docs | Media upload uses `POST https://api.atlascloud.ai/api/v1/model/uploadMedia` with bearer-token authentication. | Asset registration builds upload requests from the media base URL plus `/model/uploadMedia`. |
| Atlas Cloud Seedance `generateVideo` docs | Video generation uses `POST /api/v1/model/generateVideo` with a `model` string and prompt settings. | Seedance requests build from the media base URL plus `/model/generateVideo`; model IDs stay operator-configured. |
| Atlas Cloud Get Results docs | Generation result polling uses `GET /api/v1/model/result/{request_id}`. | Provider polling keeps the documented result route available before compatibility fallbacks. |
| Atlas Cloud Billing Public API docs | Balance evidence uses `GET /public/v1/balance` with an Atlas API key. | Paid-validation billing gates treat `/balance` as no-spend network evidence before provider spend. |

## Behavior Requirements

1. The preflight check must be no-spend and must not call Atlas, render endpoints, billing endpoints, upload endpoints, FFmpeg, stock providers, or deployment hosts.
2. It must validate Atlas endpoint families from local configuration only:
   - Coding Plan / LLM base resolves to `/v1`.
   - Media/model base resolves to `/api/v1`.
   - Billing evidence path remains `/public/v1/balance`.
3. It must preserve the repo's existing alias behavior:
   - `ATLASCLOUD_LLM_BASE_URL` or `ATLASCLOUD_API_BASE_URL` selects the LLM base.
   - `ATLASCLOUD_MEDIA_BASE_URL`, `ATLASCLOUD_BASE_URL`, or `ATLASCLOUD_ASSET_BASE_URL` selects the media/model base.
4. It must not print secret key values. Comparing two configured key values is allowed only inside the process, and the report may say they should be separate without revealing either value.
5. If explicit Seedance capability JSON is configured, the configured fast and standard model IDs must both be covered by capability records so tier/model selection cannot pass preflight and then fail later with `MODEL_UNAVAILABLE`.
6. Capability records for Atlas-backed Seedance and generated-audio execution must name provider `atlascloud`.
7. Custom HTTPS endpoint hosts may warn rather than fail, but official `api.atlascloud.ai` endpoints must use the documented path families exactly.

## Edge Cases

- `ATLASCLOUD_BASE_URL=https://api.atlascloud.ai/api/v1` is valid for media/model traffic.
- `ATLASCLOUD_API_BASE_URL=https://api.atlascloud.ai/api/v1` is invalid because that alias feeds the LLM/Coding Plan base and should be `/v1`.
- Missing `ATLASCLOUD_LLM_API_KEY` warns because current runtime can fall back to the media key, but commercial operators should use Atlas's separate Coding Plan key.
- Identical media and LLM key values fail because Atlas documents separate wallet/key families and the operator must intentionally configure both.
- Capability JSON that is syntactically invalid is left to the existing capability-specific preflight checks; the docs-conformance check must not duplicate every schema error.

## Validation Checklist

- `npm.cmd run preflight` emits `atlascloud_docs_conformance: pass` with the current ignored `.env`.
- Local smoke readiness includes the check without making network or provider calls.
- A misconfigured official Atlas LLM base path fails before paid validation.
- A configured Seedance capability list that omits the fast or standard model fails before runtime/provider creation.
- Reports never include raw API keys, local paths from this check, signed URLs, inline media, or stack traces.
