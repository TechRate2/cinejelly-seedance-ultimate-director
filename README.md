# CineJelly Seedance Ultimate Director

Agent làm video tự động bằng Seedance 2.0 (qua Atlas Cloud). Khách viết một câu hoặc tải ảnh lên,
hệ thống tự viết kịch bản, vẽ khung hình đầu cho từng cảnh, render, lồng tiếng, ghép và giao MP4.

## 👉 Bắt đầu ở đây

**[BAN-DO-DU-AN.md](BAN-DO-DU-AN.md)** — bản đồ dự án: chức năng nào nằm ở file nào, một lần
render đi qua những bước gì, sửa chỗ nào cho việc gì, và những gì còn dang dở.

Đọc file đó trước. Nó viết cho cả chủ dự án (không đọc code) lẫn model AI được nhờ sửa code.

## Lệnh cần nhớ

```bash
npm test        # kiểm tra toàn bộ dự án — miễn phí, trả lời bằng tiếng Việt
npm run setup   # cài đặt lần đầu, có hướng dẫn từng bước
npm run doctor  # kiểm tra máy đã sẵn sàng chưa
npm start       # bật máy chủ
```

`npm test` chạy 93 bài kiểm tra + 5 bài soi toàn dự án mà **không tốn một đồng nào**.
Chạy nó sau mỗi lần sửa. Lệnh **duy nhất** tiêu tiền thật là `npm run validation:paid-render`.

## Quy tắc bắt buộc

- `src/core/` không đọc biến môi trường, không gọi mạng. Chỉ `src/providers/` được gọi internet.
- Không tạo file test/mock/demo trong `src/` — bài kiểm tra sống ở `scripts/`.
- Mọi cửa chặn phải chạy **trước** bước tốn tiền mà nó bảo vệ.
- `external/upstream/` là repo tham khảo, không phải code chạy. Xem mục 7 của bản đồ để biết
  repo nào được phép sao chép (7 repo MIT) và repo nào không (AGPL-3.0 + không giấy phép).

---

## Product Goal

CineJelly Seedance Ultimate Director turns one user input plus optional references into a polished commercial video:

1. understand intent and references
2. generate script, storyboard, and shot contracts
3. build a Production Graph for long-form control
4. compile Seedance 2.0 prompts
5. render through Atlas Cloud
6. inspect consistency and repair only affected graph nodes
7. assemble, polish, and export final deliverables

The target long-form range is 2 to 8 minutes, handled through graph chunking, continuity ledgers, reference binding, governed material sourcing, batch candidate evidence, and Consistency Guardian checkpoints.

## Architecture Pillars

- `Production Graph`: project, validated reference assets, story, sequences, scenes, beats, shots, renders, inspection reports, repair actions, and deliverables.
- `Model Provider Abstraction`: Atlas Cloud default, future-ready for Kie.ai, fal.ai, Runway, Replicate, direct Volcengine, generated-audio providers, or other providers.
- `Prompt Compiler`: source-traceable Seedance prompt compilation from shot contracts, copied/adapted prompt anatomy, and CineJelly-owned rules, not hardcoded niche templates.
- `Consistency Guardian`: preflight, test-take inspection, post-render inspection, timeline inspection, and targeted repair.
- `Material and Batch Pipeline`: MoneyPrinterTurbo-inspired material sourcing, stage progress, subtitles/TTS/BGM lineage, and batch output evidence adapted into CineJelly-owned graph contracts.
- `Flexible Settings`: Fast/Standard tier, 480p/720p/1080p, quality mode, aspect ratio, duration, audio mode, watermark policy, and last-frame return policy.

## Repository Structure

```text
cinejelly-seedance-ultimate-director/
|-- AGENTS.md
|-- README.md
|-- assets/
|   |-- output_deliverables/
|   `-- reference_inputs/
|-- deploy/
|-- docs/
|-- external/
|-- schemas/
|-- scripts/
`-- src/
    |-- agents/
    |-- api/
    |-- application/
    |-- config/
    |-- core/
    |-- prompt_compiler/
    |-- providers/
    |-- types/
    `-- utils/
```

`assets/` is ignored runtime storage for real inputs, outputs, and validation evidence. `ops/` is an ignored operator-evidence directory created only when launch/billing/operations packets are promoted. A future `data/` directory is reserved for production-approved local knowledge artifacts such as copied/adapted prompt-pattern snapshots, bibles, and evaluation rubrics when they become necessary. `external/upstream/` contains legally bounded, pruned upstream source snapshots; CineJelly uses them as source material, then productizes useful parts into `src/`, future `data/`, and `docs/`. Production code must not import directly from `external/upstream/`; `src/` remains CineJelly-owned code written new or adapted into product-specific modules, not a drop zone for large upstream files.

## Documentation Map

- `docs/DEVELOPER_OPERATOR_HANDOFF.vi.md`: one-page Vietnamese handoff for dev/operator source navigation, clean runtime boundaries, deploy config, and required validation commands.
- `docs/PROJECT_CONTEXT.md`: compact project memory for token-efficient agent work.
- `docs/ARCHITECTURE_SPEC.md`: full system architecture and agent responsibilities.
- `docs/CREDITS.md`: attribution, source boundaries, and license cautions.
- `docs/SUBTREE_POLICY.md`: Git Subtree workflow, required `--squash` usage, and copy/adapt policy.
- `docs/EXTERNAL_SOURCE_SNAPSHOTS.md`: local subtree inventory, license status, and reuse boundaries.
- `docs/FAITHFUL_LOGIC_TRANSLATION_PROCESS.md`: source-to-product fidelity process for behavior-critical logic, including practical Reference Implementation examples.
- `docs/IMPLEMENTATION_ROADMAP.md`: practical module-by-module roadmap for implemented fidelity phases and remaining provider validation.
- `docs/ROADMAP_FIDELITY_AUDIT_2026-06-14.md`: owner-level audit of roadmap completion, subtree fidelity, remaining blockers, and next validation steps.
- `docs/reference-implementations/live-readiness-input-validator.md`: no-spend input gate for confirming live deployment, ops, source-video, stock, audio, and long-form budget inputs before paid validation.
- `docs/reference-implementations/report-contract-validation.md`: no-spend schema contract gate for generated release, deployment-capture, and business-readiness reports.
- `docs/reference-implementations/director-style-benchmark-harness.md`: no-spend DirectorBench-style artifact-contract benchmark and parity evidence matrix for backend quality evidence before UI work.
- `docs/reference-implementations/director-agentic-media-reasoning.md`: `video-db/Director` source baseline for chat-style media reasoning, agent/tool orchestration, progress updates, and short-pipeline planning/review/render-handoff evidence.
- `docs/reference-implementations/business-readiness-validation-plan.md`: no-spend planner contract for sequencing remaining commercial validation before paid Atlas spend.
- `docs/reference-implementations/atlas-billing-readiness.md`: no-spend Atlas Billing Public API readiness gate for checking billing-capable key access and budget fit before paid Atlas validation.
- `docs/reference-implementations/deployment-container-packaging.md`: Docker packaging contract and no-spend package validator for repeatable HTTPS deployment preparation without baking secrets or artifacts into images.
- `docs/BEGINNER_QUICKSTART.md`: shortest setup path for non-specialist operators, including automation boundaries and clean-source checks.
- `docs/RUNNING_AND_MODEL_SETTINGS_GUIDE.md`: practical install, environment, model, API, settings, and no-UI runtime guide.
- `docs/SOURCE_STRUCTURE_AND_DEPLOY_SECURITY.vi.md`: Vietnamese source map for runtime code, validation tooling, snapshots, real-mode operation, deploy boundaries, and clean-source policy.
- `docs/SHORT_PIPELINE_AGENTIC_DESIGN.md`: short-form agentic pipeline design that keeps templates optional, chat natural, and human review explicit.
- `docs/COMMERCIAL_READINESS_CHECKLIST.md`: commercial-core checklist for backend evidence, paid validation, operations, product scope, and UI readiness.
- `docs/WORKSPACE_PROJECT_BILLING_FOUNDATION.md`: opt-in workspace/project quota, credit, reservation, and usage-ledger design for commercial backend boundaries.
- `docs/PROMPT_COMPILER_DESIGN.md`: adaptive Seedance prompt compiler design.
- `docs/PRODUCTION_GRAPH_AND_LONG_FORM.md`: 2 to 8 minute graph and chunking strategy.
- `docs/CONSISTENCY_GUARDIAN_DESIGN.md`: quality, continuity, inspection, and repair design.
- `docs/MODEL_PROVIDER_ABSTRACTION.md`: Atlas Cloud default provider layer and future provider contracts.
- `docs/FLEXIBLE_SEEDANCE_SETTINGS.md`: user-facing settings and provider validation policy.

## Configuration And Secrets

Runtime implementation will require:

- `ATLASCLOUD_API_KEY`: Atlas Cloud pay-as-you-go API key for `/api/v1` media, upload, video, and generated-audio validation calls.
- `ATLASCLOUD_LLM_API_KEY`: optional separate Atlas Coding Plan key for `/v1` chat completions; if omitted, the runtime falls back to `ATLASCLOUD_API_KEY`.

Security rules:

- never commit `.env` files
- never commit or return API keys, provider tokens, private keys, signed URL credentials, or local credentials
- keep provider model IDs and runtime capabilities in configuration, not hardcoded business logic
- `setup:local` and `doctor` can write documented Seedance capability assumptions into `.env`; verify the current Atlas model catalog before customer release
- keep generated deliverables and run artifacts inside `CINEJELLY_OUTPUT_DIR`
- verify Atlas Cloud model schema before enabling customer-facing settings

`.gitignore` and `.gitleaks.toml` are included to reduce accidental secret exposure. Use a redacted secret audit before every push.

## Running The Project

Current runtime requirements:

- Node.js 20+
- FFmpeg available on `PATH`, or configured through `CINEJELLY_FFMPEG_PATH`, for final clip assembly and postproduction polish
- FFprobe available on `PATH`, or configured through `CINEJELLY_FFPROBE_PATH`, for media inspection and delivery QC
- Atlas Cloud credentials and configured model IDs

Required environment variables:

- `ATLASCLOUD_API_KEY`
- `ATLASCLOUD_LLM_MODEL`
- `ATLASCLOUD_SEEDANCE_STANDARD_MODEL`
- `ATLASCLOUD_SEEDANCE_FAST_MODEL`
- `CINEJELLY_API_AUTH_TOKEN`

Optional environment variables:

- `PORT`
- `ATLASCLOUD_LLM_API_KEY`
- `ATLASCLOUD_LLM_BASE_URL`
- `ATLASCLOUD_API_BASE_URL`
- `ATLASCLOUD_MEDIA_BASE_URL`
- `ATLASCLOUD_BASE_URL`
- `ATLASCLOUD_ASSET_BASE_URL`
- `ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON`
- `ATLASCLOUD_GENERATED_AUDIO_MODEL`
- `ATLASCLOUD_GENERATED_AUDIO_VOICE_ID`
- `ATLASCLOUD_GENERATED_AUDIO_COST_USD_PER_1K_CHARS`
- `ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON`
- `CINEJELLY_REQUEST_TIMEOUT_MS`
- `CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES`
- `CINEJELLY_POLLING_INTERVAL_MS`
- `CINEJELLY_POLLING_TIMEOUT_MS`
- `CINEJELLY_RENDER_CONCURRENCY`
- `CINEJELLY_API_SYNC_RENDER_CONCURRENCY`
- `CINEJELLY_API_JOB_CONCURRENCY`
- `CINEJELLY_API_JOB_HISTORY_LIMIT`
- `CINEJELLY_API_JOB_QUEUE_LIMIT`
- `CINEJELLY_API_MAX_BODY_BYTES`
- `CINEJELLY_API_RATE_LIMIT_WINDOW_MS`
- `CINEJELLY_API_RATE_LIMIT_MAX_REQUESTS`
- `CINEJELLY_DISABLE_API_RATE_LIMIT`
- `CINEJELLY_TRUST_PROXY_HEADERS`
- `CINEJELLY_API_CLIENTS_JSON`
- `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER`
- `CINEJELLY_CLIENT_USAGE_LEDGER_PATH`
- `CINEJELLY_MAX_USER_INPUT_CHARS`
- `CINEJELLY_MAX_REFERENCES`
- `CINEJELLY_MAX_CAPTION_CUES`
- `CINEJELLY_MAX_AUDIO_TRACKS`
- `CINEJELLY_MAX_GENERATED_AUDIO_INTENTS`
- `CINEJELLY_MAX_METADATA_ENTRIES`
- `CINEJELLY_MAX_SOURCE_VIDEO_SCENES`
- `CINEJELLY_MAX_SOURCE_VIDEO_TRANSCRIPT_CUES`
- `CINEJELLY_MAX_SOURCE_VIDEO_KEYFRAMES_PER_SCENE`
- `CINEJELLY_MAX_SOURCE_VIDEO_NOTES`
- `CINEJELLY_MAX_RENDERED_CLIP_BYTES`
- `CINEJELLY_MAX_AUDIO_TRACK_BYTES`
- `CINEJELLY_DISABLE_API_AUTH`
- `CINEJELLY_OUTPUT_DIR`
- `CINEJELLY_RENDER_COST_USD_PER_SECOND`
- `CINEJELLY_ASSET_REGISTRATION_COST_USD`
- `CINEJELLY_LLM_PLAN_COST_USD`
- `CINEJELLY_COST_BUFFER_MULTIPLIER`
- `CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH`
- `CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH`
- `CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS`
- `CINEJELLY_REMOTE_STOCK_REQUEST_TIMEOUT_MS`
- `CINEJELLY_REMOTE_STOCK_MAX_RESULTS_PER_BRIEF`
- `CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS`
- `CINEJELLY_SOURCE_VIDEO_ANALYSIS_WORK_DIR`
- `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FRAME_INTERVAL_SECONDS`
- `CINEJELLY_SOURCE_VIDEO_ANALYSIS_MAX_FRAMES`
- `CINEJELLY_SOURCE_VIDEO_ANALYSIS_FAIL_ON_ERROR`
- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`
- `COVERR_API_KEY`
- `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED`

`ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON` can be used in production to pin the exact verified Atlas Cloud Seedance model capabilities. `setup:local` writes documented default assumptions based on the configured Standard/Fast model IDs so local readiness is less fragile, but those assumptions still need Atlas catalog verification before customer release.
`ATLASCLOUD_GENERATED_AUDIO_CAPABILITIES_JSON` can pin verified Atlas generated-audio capability records for `tts_narration`, `bgm`, `ambience`, or `sfx`. The local validation command defaults to Atlas's documented `xai/tts-v1` TTS model shape for evidence, but business readiness requires `npm run validation:generated-audio` to pass with explicit spend, schema-review, output validation, ledger, and structured manual audio review evidence. `npm run validation:generated-audio-review-draft` prepares the ignored review template/checklist after a provider-backed output exists; the draft itself is not release evidence.
Preflight, live-input checks, and business-readiness planning validate generated-audio capability JSON shape when it is configured, while keeping Atlas generated-audio execution disabled when no reviewed capability records are present.
Atlas endpoint overrides (`ATLASCLOUD_LLM_BASE_URL`, `ATLASCLOUD_API_BASE_URL`, `ATLASCLOUD_MEDIA_BASE_URL`, `ATLASCLOUD_BASE_URL`, `ATLASCLOUD_ASSET_BASE_URL`) must be valid HTTPS URLs without embedded credentials, query strings, or fragments; insecure or credential-bearing protocols are rejected by runtime configuration and `/v1/preflight` before any provider request can use credentials. When the official `api.atlascloud.ai` host is used, runtime configuration and preflight also require the documented path split: Atlas LLM calls use `/v1`; image/video/upload calls use `/api/v1`.
Numeric runtime environment values must be plain base-10 integer or decimal strings without units or suffixes; malformed deployment knobs fail runtime loading or `/v1/preflight` instead of being partially parsed.
`PORT` must be a valid TCP port from 1 to 65535 when set; `npm run preflight` and startup enforce the same range.
`CINEJELLY_ATLAS_JSON_RESPONSE_MAX_BYTES` bounds Atlas LLM, prediction, and media upload JSON metadata responses before parsing; it does not apply to rendered media downloads, which are handled by the assembly streaming limits below.
`CINEJELLY_TRUST_PROXY_HEADERS=true` allows the API rate limiter to bucket clients by `X-Forwarded-For`; leave it unset unless a trusted reverse proxy strips and rewrites client IP headers before traffic reaches CineJelly.
When a request includes `settings.maxCostUsd`, `CINEJELLY_RENDER_COST_USD_PER_SECOND` must be configured so the render cost gate can block over-budget jobs before provider calls.
`CINEJELLY_LOCAL_MATERIAL_CATALOG_PATH` optionally enables the local material library adapter. The file must be an operator-owned JSON catalog whose entries use safe `asset://` or credential-free `https://` asset URIs, rights metadata, and bounded labels/tags; runtime preflight validates it before customer traffic. Do not put local filesystem paths or signed URLs into catalog `assetUri` values.
`CINEJELLY_GENERATED_AUDIO_ASSET_RESOLUTION_CATALOG_PATH` optionally points to an operator-owned generated-audio asset resolution catalog. Entries must map clean `asset://` generated-audio outputs to credential-free HTTPS delivery URLs with `approvedForMix` and optional identity/provider/duration evidence; preflight validates the catalog but does not call audio providers or create generated audio.
`CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS=true` enables opt-in remote stock material adapters. At least one approved provider key must be configured: `PEXELS_API_KEY`, `PIXABAY_API_KEY`, or `COVERR_API_KEY` with `CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED=true`. Provider keys are used only for outbound search requests; material candidates stored in artifacts must use credential-free HTTPS URLs and attribution metadata.

Build commands:

```bash
npm install
npm run doctor
npm run typecheck
npm run build
npm run preflight
npm run validation:readiness
npm run validation:create-request -- --safe-default
npm run validation:local-smoke
npm run validation:short-pipeline
npm run validation:deployment-package
docker compose up -d --build
npm run validation:deployment-readiness -- --base-url <deployment-url>
npm run validation:long-form -- --duration-seconds 120
npm run validation:atlas-billing -- --max-budget-usd <approved-long-form-budget-usd> --planned-cost-usd <estimated-long-form-cost-usd> --output assets/output_deliverables/business-readiness/atlas-billing-long-form-120s-report.json --confirm-live-network
npm run validation:atlas-billing -- --max-budget-usd <approved-source-video-budget-usd> --planned-cost-usd <approved-source-video-budget-usd> --output assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json --confirm-live-network
npm run validation:source-video-auto-analysis -- --source-video-url <clean-https-video-url> --confirm-provider-spend --max-cost-usd <approved-source-video-budget-usd> --atlas-billing-report assets/output_deliverables/business-readiness/atlas-billing-source-video-report.json
npm run validation:remote-stock -- --confirm-live-network --confirm-commercial-terms-reviewed
npm run validation:atlas-billing -- --max-budget-usd 5 --planned-cost-usd 0.000870 --output assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json --confirm-live-network
npm run validation:generated-audio -- --confirm-provider-spend --confirm-audio-schema-reviewed
npm run validation:generated-audio-review-draft
npm run validation:generated-audio -- --review-existing-report assets/output_deliverables/business-readiness/generated-audio-validation-report.json --manual-audio-review ops/generated-audio-manual-review.json --confirm-manual-audio-review
npm run ops:create-client-policy -- --client-id pilot-client
npm run ops:apply-client-policy-env
npm run validation:ops-config -- --write-drafts
npm run ops:promote-attestations -- --dry-run
npm run ops:promote-attestations
npm run validation:ops-config
npm run validation:launch-intake -- --write-draft
npm run validation:launch-intake
npm run validation:live-inputs
npm run validation:business-plan
npm run validation:atlas-billing
npm run validation:commercial-inputs
npm run validation:quality-benchmark
npm run validation:quality-benchmark -- --audio-review assets/output_deliverables/business-readiness/director-style-audio-review.json
npm run validation:quality-benchmark -- --runtime-review assets/output_deliverables/business-readiness/director-style-runtime-review.json
npm run validation:quality-benchmark -- --governance-review assets/output_deliverables/business-readiness/director-style-governance-review.json
npm run validation:quality-benchmark -- --generated-audio-validation assets/output_deliverables/business-readiness/generated-audio-validation-report.json
npm run validation:quality-benchmark -- --long-form-validation assets/output_deliverables/business-readiness/long-form-validation-report.json
npm run validation:report-contracts
npm run validation:billing-admin-ops -- --base-url <deployment-url> --attestation ops/billing-admin-attestation.json
npm run validation:production-ops -- --base-url <deployment-url> --attestation ops/production-operations-attestation.json
npm run validation:release-audit
npm run validation:render-request -- --request <request-json>
npm run validation:atlas-billing -- --max-budget-usd <approved-paid-render-budget-usd> --planned-cost-usd <estimated-paid-render-cost-usd> --output assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json --confirm-live-network
npm run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report assets/output_deliverables/phase6-validation/atlas-billing-paid-render-report.json
npm run validate:artifacts -- <artifact-directory>
npm start
```

`CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD` is the shared default approved-budget ceiling for `validation:live-inputs`, `validation:business-plan`, and `validation:atlas-billing`; keep it low until the operator explicitly approves the full paid Atlas validation plan, or pass `--max-budget-usd` for a one-off run.
After changing that ceiling, rerun `npm.cmd run validation:atlas-billing -- --max-budget-usd <approved-budget> --confirm-live-network`; stored Atlas billing reports are treated as stale when their captured budget or planned cost no longer matches the current plan.
`CINEJELLY_ATLAS_BILLING_EVIDENCE_MAX_AGE_HOURS` controls how long a stored Atlas billing-readiness report can unlock paid-validation planning; the default is 24 hours, after which `validation:live-inputs`, `validation:business-plan`, and `validation:business-readiness` require a fresh no-spend `/balance` probe.

Production API:

- `GET /health`
- `GET /v1/preflight`
- `GET /v1/validation-readiness`
- `GET /v1/render-settings`
- `POST /v1/short-pipeline/plan`
- `POST /v1/short-pipeline/render-jobs`
- `POST /v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs`
- `POST /v1/render`
- `POST /v1/render-jobs`
- `GET /v1/render-jobs`
- `GET /v1/render-jobs/{jobId}`
- `POST /v1/render-jobs/{jobId}/review`
- `DELETE /v1/render-jobs/{jobId}`
- `GET /v1/admin/client-policy`

`GET /v1/preflight` and `npm run preflight` verify required Atlas configuration, AtlasCloud docs conformance for LLM/media/billing endpoint families, clean HTTPS Atlas endpoint overrides, strict numeric runtime settings, API authentication configuration, optional client policy configuration, job queue settings, optional render-provider lease-service storage, optional local material catalog validity, optional generated-audio asset resolution catalog validity, optional remote stock provider readiness, optional source-video auto-analysis work-directory readiness, output directory write readiness, and local FFmpeg/FFprobe availability without exposing secret values or local absolute paths. Deployments can use `CINEJELLY_FFMPEG_PATH` and `CINEJELLY_FFPROBE_PATH` to point at portable binaries instead of modifying global `PATH`; runtime media engines use the same resolved commands as preflight. `GET /v1/render-settings` returns a secret-free descriptor of supported tier, resolution, quality, ratio, audio, duration, cost, selected model IDs, admin-allowlisted Seedance model choices for `modelPreferences.seedanceModelId`, and Seedance capability configuration for API clients and future UI controls. `npm run doctor` runs setup plus local no-spend validation as the simplest operator check; it preserves existing `.env` values, creates missing local defaults, writes the local smoke evidence report under `assets/output_deliverables`, and never calls Atlas rendering. `npm run validation:client-policy-smoke` proves client-key digest auth, quota reservation, usage-ledger writing, and quota blocking without starting providers or calling Atlas. `npm run validation:provider-lease-service` starts a local protected API instance and proves `/v1/render-provider-handoff-leases/{acquire,release,heartbeat,leases,active}` against a durable lease file without Atlas/provider calls. `npm run validation:deployment-readiness -- --base-url <deployment-url>` captures no-spend real-host evidence from `/health`, `/v1/preflight`, `/v1/validation-readiness`, and `/v1/render-settings`; localhost captures are marked local and do not satisfy the business-readiness deployment gate. `npm run validation:long-form` creates or reads a 120-480s request, verifies admission/readiness/cost/chunking without provider calls, and writes `cinejelly.long-form-validation.v1` evidence; adding `--confirm-paid-spend` passes the request into the paid-render validation runner, but business readiness still requires artifact pass, 120-480s final duration, provider-safe chunks, and manual quality/redaction review. `npm run validation:source-video-auto-analysis -- --source-video-url <clean-https-video-url>` verifies the source-video spend gate without provider calls; adding `--confirm-provider-spend` also requires `--max-cost-usd` plus a fresh matching `atlas-billing-source-video-report.json` before bounded FFmpeg frame extraction or Atlas LLM calls can run through `SourceVideoAutoAnalyzer`. `npm run validation:remote-stock` verifies the remote-stock network gate without provider calls, and adding `--confirm-live-network --confirm-commercial-terms-reviewed` calls configured Pexels/Pixabay/commercially approved Coverr adapters, validates credential-free HTTPS candidates through `MaterialSourceValidator`, and writes business-readiness evidence without exposing provider keys or outbound search URLs. `npm run validation:generated-audio` verifies Atlas generated-audio input, capability, cost, schema, output-batch, ledger, and manual-review gates without provider execution until `--confirm-provider-spend` is present; business readiness requires the report schema `cinejelly.generated-audio-validation.v1` to pass with schema review and manual audio review evidence. `npm run ops:create-client-policy` creates an ignored client-policy kit with a raw one-time client key file, SHA-256 digest policy JSON, env snippet, and redacted report; it does not call Atlas or deployment endpoints and it should feed `validation:ops-config` before customer traffic. `npm run ops:apply-client-policy-env` merges only the generated client-policy env keys into `.env`, preserves Atlas keys and deployment tokens, creates an ignored backup, and writes a redacted apply report. `npm run validation:ops-config` performs no-spend, no-network pre-capture validation for client quota policy plus non-secret billing/admin and production-operations attestations; `--write-drafts` writes incomplete draft files under ignored output deliverables and those drafts are intentionally not release evidence. `npm run ops:promote-attestations` validates completed draft attestations with `validation:ops-config` before copying them into ignored `ops/*.json` input files, and blocks rather than creating fake evidence when fields are still blank. `npm run validation:launch-intake -- --write-draft` creates the ignored commercial launch intake draft and Markdown fill-out packet; `npm run validation:launch-intake` validates the filled `ops/commercial-launch-intake.json` without secrets, network calls, or provider calls. `npm run validation:live-inputs` reads only local env shape, optional launch intake, ops reports, Atlas billing-readiness evidence, attestation presence, clean deployment/source-video URL shape, remote-stock approvals, generated-audio capability inputs, and known cost estimates; it writes `cinejelly.live-readiness-inputs.v1`, makes no network/provider calls, and recommends deferring Atlas spend while prerequisite gates are incomplete or the Atlas billing/budget gate fails. `npm run validation:business-plan` reads current business-readiness, optional launch intake, ops-config, Atlas billing reports, and non-secret environment reports, estimates known paid validation cost, can mark an independently budgeted paid slice ready while full-sequence spend remains deferred, surfaces `commercial_launch_intake_precheck`, and writes a no-spend sequence plan before any Atlas, stock-provider, deployment, FFmpeg, or render work is attempted. `npm run validation:atlas-billing` is local-only until `--confirm-live-network` is present; with confirmation it calls only Atlas Billing Public API `/balance`, prefers the documented `available` balance, records safe balance/credit-grant breakdown evidence, writes `cinejelly.atlas-billing-readiness.v1`, and checks billing-capable key access plus budget/balance fit before paid Atlas validation. `npm run validation:commercial-inputs` reads the current readiness reports and writes a secret-free JSON plus Markdown checklist of the remaining operator-provided URLs, env placeholders, attestation files, live provider action evidence packet, budget approval, evidence commands, paid validation commands, manual review tasks, and a safe-to-share `operatorHandoffManifest` of ignored operator files, draft/template files, report archive paths, and guarded command order with `releaseEvidence=false`. `npm run validation:business-readiness` now treats Atlas billing reports as hard pre-paid-spend gates while keeping them outside the weighted product-completion percentage. `npm run validation:report-contracts` validates generated release/business-readiness reports and optional deployment-capture reports against local schemas, writes `cinejelly.report-contract-validation.v1`, and catches report/schema drift without calling providers or changing business-readiness status. `npm run validation:billing-admin-ops -- --base-url <deployment-url> --attestation ops/billing-admin-attestation.json` captures no-spend billing/admin/quota evidence from configured client policy, a writable usage ledger, deployment-token-only `/v1/admin/client-policy`, and a non-secret operator attestation for billing/refund/tax/support/account lifecycle controls. `npm run validation:production-ops -- --base-url <deployment-url> --attestation ops/production-operations-attestation.json` captures no-spend production storage/observability/support evidence from diagnostic endpoints and a non-secret operations attestation. `npm run validation:release-audit` reads local smoke evidence, paid-render evidence, git hygiene, ignored secret/output paths, tracked secret scan, and external import boundaries; when `release_ready`, it can be used as Phase 6 hygiene evidence but still reports `canReleaseToCustomerTraffic=false`. `npm run validation:create-request -- --safe-default` writes a local non-sensitive request JSON under `assets/output_deliverables` for operator validation; it does not call Atlas, create providers, write render artifacts, or include secrets. `npm run validation:local-smoke` runs the local no-spend gate in one command: safe request creation, typecheck, build, client-policy quota smoke, readiness, request validation, API diagnostic readiness, and a local no-spend evidence report under `assets/output_deliverables`. `npm run validation:render-request -- --request <request-json>` checks an operator-owned request file through the same render request admission and output-root path normalization used by `/v1/render` and the paid-render runner, emits a redacted pass/fail report, and does not run readiness, initialize providers, call Atlas, or write render artifacts. `npm run validation:readiness` and `GET /v1/validation-readiness` wrap the preflight report into a redacted Phase 6 readiness report with blocker names, warning names, next actions, and an explicit reminder that customer release requires paid Atlas render evidence, artifact validation, source hygiene, and manual review. `npm run validation:paid-render -- --request <request-json> --confirm-paid-spend --atlas-billing-report <atlas-billing-report>` reuses that readiness gate before paid provider spend, blocks with `blocked_by_spend_confirmation` when the explicit spend-confirmation flag is missing, blocks with `blocked_by_atlas_billing` when fresh Atlas billing-readiness evidence is missing or incompatible with the request budget cap, requires `--allow-warnings` to continue from a warning decision, uses the same render request admission and output-root path normalization as `/v1/render`, writes success/failure artifacts, validates them, and emits a redacted operator report without local artifact paths. The CLI preflight exits `1` on hard failure and `0` for pass or warning states; request validation exits `1` for invalid request files, validation readiness exits `1` only when hard blockers remain, release audit exits `1` until hygiene blockers are cleared, while the HTTP readiness endpoint returns `503` for `blocked` and `200` for warning/ready decisions. `/v1/preflight` and `/v1/validation-readiness` are available before the render runtime is initialized, so a fresh deployment can diagnose missing environment variables safely. `/health` is public; protected `/v1` endpoints require `Authorization: Bearer <CINEJELLY_API_AUTH_TOKEN>`, `X-CineJelly-Api-Key: <CINEJELLY_API_AUTH_TOKEN>`, or a configured client API key whose SHA-256 digest appears in `CINEJELLY_API_CLIENTS_JSON`. Render POST attempts are rate limited before auth failure responses so unauthenticated floods cannot bypass the render submission throttle. If no deployment token or client policies are configured, only `/v1/preflight` and `/v1/validation-readiness` remain available and render/job endpoints return 503. `CINEJELLY_DISABLE_API_AUTH=true` is reserved for private trusted networks.

Every API response includes `requestId` and the `X-CineJelly-Request-Id` response header. Callers may provide `X-CineJelly-Request-Id` or `X-Request-Id`; invalid values are ignored and replaced with a generated UUID-based ID. The normalized request stores this ID in metadata so LLM calls, Seedance requests, render jobs, Production Graph project nodes, `run-summary.json`, and `failure-report.json` can be correlated without exposing secrets. Public JSON responses pass through secret redaction plus local filesystem path, inline `data:` URI, non-HTTPS URI, embedded-credential URI, and signed/credential-query URI redaction, preserve deploy-safe URI values such as clean `https://` and `asset://` references while hiding server-only paths, and are returned with `Cache-Control: no-store` plus `X-Content-Type-Options: nosniff`.

For synchronous `/v1/render`, client disconnects propagate through `AbortSignal` into Story Architect, Atlas media upload or direct-reference handling, Seedance submission/polling, assembly, and postproduction where supported. `CINEJELLY_API_SYNC_RENDER_CONCURRENCY` controls how many synchronous render pipelines can run at once per API process; the lease is acquired after body parsing, admission control, and path normalization but before runtime creation or provider spend. When that capacity is full, the API returns `503` with retry hints and callers should use `/v1/render-jobs` for long-form work. On `SIGINT` or `SIGTERM`, the API stops accepting new connections, aborts active request-bound render orchestration, and cancels queued/running async render jobs with an explicit shutdown reason.

`POST /v1/render`, `POST /v1/render-jobs`, `POST /v1/short-pipeline/conversation`, `POST /v1/short-pipeline/conversation-sessions`, `POST /v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs`, `POST /v1/short-pipeline/product-url-plan`, and `POST /v1/short-pipeline/render-jobs` require an application JSON media type, either `application/json` or `application/*+json`, before body parsing. `CINEJELLY_API_MAX_BODY_BYTES` bounds render POST bodies; oversized requests return `413` before JSON parsing, queue admission, runtime creation, or provider spend. `POST /v1/render` accepts JSON with `userInput`, optional `settings`, optional `references`, optional `sourceVideoAnalysis`, optional `transitionSettings`, optional `captionCues`/`captionOptions`, optional `audioTracks`/`audioMixOptions`, optional `generatedAudioIntents`, optional `frameSamplingOptions`, optional `semanticVisualInspectionOptions`, and optional `outputPath`/`workDirectory`/`artifactDirectory`. `sourceVideoAnalysis` is a bounded deconstruction contract for a `source_video_structure` reference: transcript cues, scenes, keyframes, pacing notes, style notes, structural beats, and safety notes. `generatedAudioIntents` is a bounded planning contract for requested narration, BGM, ambience, or SFX; the current foundation keeps Atlas audio no-spend by default, but can execute ready generated-audio items through the provider-neutral runner when verified audio capabilities and an `AudioProvider` are present. Render requests pass rate limiting and admission control before runtime creation: user input length, reference count, source-video analysis sizes, caption cue count, audio track count, generated-audio intent count, metadata shape, settings, JSON size, option object shape/ranges, and path lengths are bounded before LLM or provider spend. Public API audio track sources must be credential-free HTTPS URLs without credential-like query parameters; local audio files are reserved for internal engine calls. Reference URIs and source-video keyframe URIs must be credential-free HTTPS URLs or pre-registered `asset://` references in the current Atlas path, and credential-like query parameters are rejected before runtime/provider spend. Output, work, and artifact paths are confined to `CINEJELLY_OUTPUT_DIR` or `assets/output_deliverables` by default; relative paths are resolved inside that root and absolute paths outside it are rejected.

During assembly, remote provider clip and audio URLs must be HTTPS and must not include embedded credentials. Remote provider clip URLs and audio tracks are downloaded as streams into temporary files and then atomically moved into the work directory. `CINEJELLY_MAX_RENDERED_CLIP_BYTES` bounds each rendered clip download so long-form jobs cannot exhaust process memory or disk unexpectedly; the default is 2 GiB per clip. `CINEJELLY_MAX_AUDIO_TRACK_BYTES` separately bounds each remote audio track download; the default is 256 MiB per track.

FFmpeg and FFprobe are resolved through `CINEJELLY_FFMPEG_PATH`/`CINEJELLY_FFPROBE_PATH` when configured, otherwise through `PATH`, and are launched through a shared argument-array process runner, not shell-built commands. Child-process stdout and stderr are each capped at 2 MiB by default; if a media tool exceeds that cap, the child process is stopped and the render fails with a bounded error.

For long-running 2 to 8 minute production jobs, `POST /v1/render-jobs` accepts the same body as `/v1/render`, returns `202` plus a `statusUrl`, and runs the render in an in-process queue. Clients may include `reviewApprovalGate` plus `reviewApprovalCheckpoints`; pending, revision-required, or blocked checkpoints hold the job before provider spend, approved checkpoints queue it for render, and rejected checkpoints end the current job path. Clients may also include `preExportReviewApprovalGate` plus `preExportReviewApprovalCheckpoints`; the job renders first, writes artifacts, validates artifacts, then pauses before export until `gate=pre_export` review approves the artifact-bound media/caption/claim evidence.

Clients may send an `Idempotency-Key` header; repeated submissions with the same key and same payload return the retained existing job instead of creating a duplicate render or double-reserving client quota, while reusing the key for a different payload returns `409`. `GET /v1/render-jobs` returns queue telemetry plus retained jobs as compact summaries with `currentStage`, `currentStageStatus`, `progressEventCount`, `hasResult`, `hasCostLedger`, `hasProviderCheckpoint`, `hasArtifacts`, `hasArtifactValidation`, `artifactValidationStatus`, `hasReviewApproval`, `reviewApprovalStatus`, `hasPreRenderReviewApproval`, `preRenderReviewApprovalStatus`, `hasPreExportReviewApproval`, `preExportReviewApprovalStatus`, and `hasError` flags; client API keys see only their own retained jobs, while the deployment token can see all retained jobs. `GET /v1/render-jobs/{jobId}` returns queued/running/paused_for_review/paused_for_revision/blocked/succeeded/failed/canceled/rejected status plus retained `stageProgressEvents`, review approval detail, redacted result, stack-free error name/message detail, cost ledger, compact provider checkpoint evidence, artifact manifest entries, and artifact validation checks when available, without exposing server-local result paths, artifact directories, or manifest paths.

`POST /v1/render-jobs/{jobId}/review` accepts corrected `checkpoints`; approved `pre_render` review queues the job and reserves quota only at that transition, while approved `pre_export` review marks an artifact-retained paused job `succeeded` without rerendering or reserving spend again. `RenderProviderReconciler` can turn restored checkpoint prediction IDs into redacted provider-status evidence through the provider abstraction, and `RenderProviderHandoffCoordinator` adds local file-lease, protected lease-service route, and HTTPS external-lease adapter foundations with retained-worker heartbeat evidence for terminal-close, continue-polling, held-by-other, and manual-audit decisions; this still does not replace multi-worker deployment proof or automatic distributed graph resume. `DELETE /v1/render-jobs/{jobId}` cancels a queued, running, paused, or blocked job through `AbortController`. `GET /v1/admin/client-policy` requires the deployment token and returns secret-free client policy and current-month usage diagnostics without raw keys or key digests. `GET /v1/admin/workspace-billing` returns secret-free workspace/project quota and usage diagnostics. If `CINEJELLY_RENDER_PROVIDER_LEASE_PATH` is set, deployment-token-only `/v1/render-provider-handoff-leases/{acquire,release,heartbeat,leases,active}` exposes the same durable lease contract consumed by external handoff workers. `CINEJELLY_API_CLIENTS_JSON` stores client IDs, SHA-256 key digests, enable flags, monthly request limits, reserved-cost limits, duration limits, and allowed tier/quality policy; `CINEJELLY_REQUIRE_CLIENT_POLICY_FOR_RENDER=true` makes configured client policy mandatory for render submissions; `CINEJELLY_CLIENT_USAGE_LEDGER_PATH` enables a JSONL reservation ledger that survives process restarts. `CINEJELLY_WORKSPACES_JSON` stores opt-in workspace policies with client assignments, enabled project policies, credit ceilings, per-request reserved-cost limits, and monthly request/cost quotas; `CINEJELLY_REQUIRE_WORKSPACE_FOR_RENDER=true` requires `metadata.workspaceId`, and `CINEJELLY_WORKSPACE_USAGE_LEDGER_PATH` enables a safe JSONL workspace reservation ledger. `CINEJELLY_API_JOB_CONCURRENCY` controls how many render jobs run at once per API process, `CINEJELLY_API_JOB_HISTORY_LIMIT` controls retained in-memory job history and the in-process idempotency replay window, and `CINEJELLY_API_JOB_QUEUE_LIMIT` caps queued plus running job occupancy before new job records, runtimes, or provider calls are created. When rate limits, queue capacity, client quota, or workspace quota blocks a request, the API returns `Retry-After` and `retryAfterSeconds` when a retry window is known so upstream gateways can retry later instead of silently accumulating long-form jobs.

`POST /v1/short-pipeline/conversation` accepts multi-turn natural-language `messages` or a shorthand `userPrompt`, analyzes business goal, audience, platform, emotion, requested changes, template preference, and review state, then returns a safe conversation session plus a normal short-pipeline plan. Conversation turns publish only message digests and redacted summaries; raw URLs, local paths, and secret-like values are removed before public evidence and before planning. A user phrase such as "approved" is treated as approval intent only and does not bypass formal scene/audio/caption/claim checkpoint evidence. `POST /v1/short-pipeline/conversation-sessions` persists the same redacted no-spend session only when `CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH` is configured; `GET /v1/short-pipeline/conversation-sessions` and `GET /v1/short-pipeline/conversation-sessions/{sessionId}` provide client-scoped list/detail views for future UI continuity without storing raw transcript, raw product/media URLs, local paths, or secret-like values. `POST /v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs` reads the stored server-side plan, rejects client-supplied `planInput`, applies submitted review checkpoints, creates paused jobs for pending review, blocks unsafe approved-looking review text, and requires `confirmRenderSubmission=true` before approved review evidence can queue provider spend.

`POST /v1/short-pipeline/render-jobs` rebuilds a no-spend short plan from `planInput`, converts it into the normal async render-job request with captions, generated-audio intents, plan lineage, review approval checkpoints, quota/billing gates, idempotency, and artifact validation intact, and requires `confirmRenderSubmission=true` before already approved review evidence can queue provider spend. Pending or revision-required short-pipeline review evidence creates a paused job instead of spending provider credits.

`POST /v1/short-pipeline/product-url-plan` performs bounded Product URL-to-Video research before short-pipeline planning. It requires `confirmLiveNetwork=true` before fetching a clean HTTPS product page, rejects embedded credentials and credential-like query strings before any fetch, extracts product facts from HTML/JSON-LD into a safe snapshot, feeds that snapshot into `ShortPipelinePlanner`, and returns raw-URL-free research evidence plus a review-gated plan. `npm run validation:product-url-extraction` proves this contract with an injected fake fetch and no Atlas, render, stock-provider, or live network spend.

`npm run validation:provider-handoff-actions` verifies the redacted idempotent action ledger for terminal-close, resume-polling, and manual-audit handoff intents without Atlas/provider calls; it is replay evidence only and does not prove live multi-worker deployment.

At foundation level, the current codebase provides the provider layer, robust structured LLM parsing, Story Architect plan normalization with bounded source-video deconstruction guidance, Reference Librarian validation for role/kind compatibility and credential-free HTTPS or `asset://` reference URIs, Source Video Analyst normalization for transcript/scene/keyframe/pacing/style/safety analysis, provider-neutral capability validation before media upload or render spend, provider telemetry with prediction IDs, robust nested Atlas prediction output URL extraction, redacted non-JSON Atlas HTTP error diagnostics with preserved status-based error normalization, retryable Atlas abort/timeout ProviderError normalization, bounded Atlas JSON metadata response parsing, provider-returned cost metadata when available, actual retry counts for retryable Atlas HTTP calls, and graph/model context for prediction polling ledger entries, Atlas direct clean-reference preservation plus `/model/uploadMedia` handling for local video/audio references before Seedance generation, deterministic storyboard panel planning from shot contracts, Guardian storyboard preflight before render spend, quality-mode candidate rendering, high-risk test-take gating before full render, conservative dependency-aware render scheduling, targeted repair-only rerendering, Guardian-based candidate selection, configurable cost planning and budget gating with test-take, candidate, and repair multipliers, prompt compiler, Production Graph planning plus reference asset lineage, source-video analysis lineage, storyboard panel/preflight lineage, and run evidence recording for clip renders/inspections/deliverables, continuity ledger generation for Character/Style bibles, batch Consistency Guardian preflight gating, render gate blocking before assembly, director orchestration, FFmpeg assembly engine, bounded HTTPS streaming materialization of provider clip URLs and remote audio tracks, bounded FFmpeg/FFprobe process output capture, xfade/acrossfade transition assembly, selected-resolution and selected-aspect-ratio postproduction scaling, final video byte-size and SHA-256 integrity recording, FFprobe media inspection, deterministic delivery gate validation for selected resolution and non-adaptive aspect ratio, frame sampling QC, semantic visual inspection through the configured Atlas LLM provider, review packet generation for commercial handoff, postproduction polish, caption sidecar/burn-in automation, supplied-audio mix automation, generated-audio planning/execution evidence through a provider-neutral runner plus Atlas `generateAudio` submit/poll execution behind verified capability and explicit validation spend gates, output/artifact path confinement, redacted API responses and run artifacts, inline `data:` plus unsafe URI response redaction, stack-free failure-report error payloads, strict application JSON media-type enforcement and configurable body-size gating for credit-spending POST endpoints, shared render request normalization for API and validation CLI paths, local filesystem path redaction and no-store response headers for public API JSON payloads, credential-free HTTPS Atlas endpoint override validation, strict numeric runtime environment validation, API port/boolean-flag startup-preflight parity, API artifact response DTOs that omit server-local artifact paths, API artifact validation DTOs that omit server-local validator paths, compact render-job list summaries with detail payloads and stack-free error detail plus artifact validation checks reserved for per-job polling, synchronous render responses with artifact validation evidence, failure-path cost ledger capture after partial provider spend, SHA-256 manifest integrity hashes for run/failure artifacts, case-insensitive bearer-token auth guard, pre-auth proxy-safe render POST rate limiting with `Retry-After`, synchronous render concurrency gating, retry-safe async render submission with in-process idempotency, request admission control for credit-spending endpoints including nested source-video/caption/audio/generated-audio/transition/frame-sampling/semantic-inspection option validation, request correlation IDs across API/provider/job/graph/artifact metadata, client disconnect and deployment shutdown cancellation propagation, in-process render job submit/poll/cancel orchestration with queue-saturation retry hints, runtime preflight validation for writable output storage, redacted CLI and HTTP validation-readiness gates for deployment readiness, a redacted paid-render validation CLI that gates spend on readiness and immediately validates artifacts, stable ESM package exports for built production imports across API/agent/core/provider/type modules, deterministic success and failure artifact persistence, and production HTTP entrypoint. The correct operating loop is:

1. read `AGENTS.md`
2. read `docs/PROJECT_CONTEXT.md`
3. read the relevant detailed design spec
4. implement the next production module under `src/`
5. run secret audit
6. commit and push

When semantic visual inspection is enabled, `ATLASCLOUD_LLM_MODEL` must be a model that accepts image inputs in OpenAI-compatible chat content.

## Implementation Status And Next Order

Current foundation:

- Provider, prompt, graph, guardian, API, cost, error, artifact, redaction, stage lifecycle, material sourcing, and media-processing foundations exist under `src/`.
- Source lineage and logging foundations exist, and Phase 1-5 source-faithful foundations plus the Source Video Auto Analysis Adapter, Render Job Stage Progress Telemetry, Generated Audio Intent Planning, Generated Audio Execution Planner, Generated Audio Provider Execution Runner, Generated Audio Output Validation, Generated Audio Output Batch Validation, Generated Audio Batch Artifact Evidence including review-packet handoff evidence, Generated Audio Asset Resolution, Generated Audio Asset Resolution Catalog, Generated Audio Provider Execution Contract, Phase 6 Validation Readiness Report, and Phase 6 Paid Render Validation Runner have Reference Implementations, lineage records, and validation notes.
- Runtime readiness now has local Atlas credentials, configured model IDs, FFmpeg/FFprobe availability, no-spend readiness, one short paid provider validation, source-video auto-analysis validation tooling with an explicit spend gate, remote-stock provider validation tooling with explicit live-network/commercial-terms gates, no-spend ops-config draft/precheck tooling, and a trustworthy clean release-candidate Git/source-hygiene audit. Customer release still depends on manual media/artifact/redaction review, optional approved material catalogs or provider keys for source-material fulfillment, a live source-video auto-analysis run with a real clean HTTPS source video, live remote-stock validation with approved provider keys, long-form validation, billing/admin and production-ops attestations/captures, and Atlas generated-audio validation if audio generation is enabled.

Next implementation order:

1. Prepare deployment environment: Atlas credentials, verified model IDs, `CINEJELLY_API_AUTH_TOKEN`, FFmpeg/FFprobe on `PATH` or configured binary paths, and any opt-in material/source-video analysis settings.
2. Run `npm.cmd run doctor` for the complete no-spend setup/readiness check, or run `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run preflight` manually.
3. Validate the operator request file with `npm.cmd run validation:render-request -- --request <request-json>` before any paid run.
4. Reuse the existing short paid Atlas validation evidence for the current snapshot, or run a new paid Atlas validation render only after explicitly approving Atlas credit spend for a new release candidate.
5. Run `npm.cmd run validate:artifacts -- <artifact-directory>` and inspect `review-packet.json`, `cost-ledger.json`, `run-summary.json`, `stage-lifecycle.json`, `material-sourcing-plan.json`, and deliverable metadata.
6. Run `npm.cmd run validation:ops-config -- --write-drafts`, fill real non-secret operator attestations, run `npm.cmd run ops:promote-attestations`, then run `npm.cmd run validation:live-inputs` before live network or paid validation.
7. Run `npm.cmd run validation:commercial-inputs` to generate the secret-free JSON and Markdown checklist of the remaining operator inputs, including the ignored live provider action evidence packet.
8. Run `npm.cmd run validation:atlas-billing` locally, then `npm.cmd run validation:atlas-billing -- --confirm-live-network` only when the no-spend Atlas Billing Public API check is approved.
9. Run `validation:billing-admin-ops`, `validation:production-ops`, and `validation:provider-production-handoff` against the HTTPS deployment after the live-input report says those captures can run.
10. After a real deployment worker executes provider handoff callbacks, archive `ops/render-provider-live-actions.json` and run `npm.cmd run validation:provider-live-actions -- --confirm-live-provider-actions`.
11. Run `npm.cmd run validation:release-audit` and keep the release-audit report with the release evidence.
12. Update readiness notes and remaining blockers in `docs/PROJECT_CONTEXT.md` and `docs/IMPLEMENTATION_ROADMAP.md`.

Detailed milestones are tracked in `docs/IMPLEMENTATION_ROADMAP.md`; validation execution is described in `docs/OPERATOR_RUNBOOK.md`.

## Source Snapshot Strategy

CineJelly is source-traceable and product-owned. It keeps curated upstream source snapshots under `external/upstream/` so engineers can check behavior against original sources, copy or adapt useful pieces, and then develop them into CineJelly-owned modules under `src/`, `data/`, and `docs/`. The product repo intentionally prunes upstream tests, demos, examples, generated build folders, temporary files, notebooks, sample media, generated datasets, cache files, binary model weights, and vendored font/music resources; full raw upstream clones should live outside this repository when deeper legal/source review is needed. The current snapshot set includes `video-db/Director` under `external/upstream/director` for agentic chat/media workflow patterns, but the production implementation remains CineJelly's own product layer.

Public source is not automatically unrestricted. MIT sources can be reused with attribution and notices, CC BY prompt content needs attribution review before bundled use, AGPL implementation code requires acceptance of AGPL obligations or legal approval, and no-license sources stay in the snapshot/audit layer until permission is clarified.
