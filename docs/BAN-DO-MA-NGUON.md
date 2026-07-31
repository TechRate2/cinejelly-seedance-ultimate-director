# Bản đồ mã nguồn — mọi module và nhiệm vụ của nó

**File này do máy sinh ra từ chính mã nguồn.** Đừng sửa tay: `npm test` sẽ báo đỏ nếu nó lệch
với code. Muốn cập nhật: `node scripts/audit-module-index.mjs --write`.

Mô tả lấy từ câu đầu tiên trong khối chú thích đầu mỗi file. Muốn một module được mô tả rõ hơn ở
đây thì sửa chú thích trong chính file đó — tài liệu và code không thể lệch nhau khi chỉ có một nguồn.

Tổng cộng **187 module** trên 8 khu vực.

Bức tranh tổng thể của dự án, luồng tạo video và việc còn dang dở nằm ở [`BAN-DO-DU-AN.md`](../BAN-DO-DU-AN.md).

## `src/api/` — Cổng vào HTTP — mọi thứ khách và người vận hành chạm tới

34 module.

| Module | Dòng | Nhiệm vụ |
|---|---:|---|
| [`account-persistence.ts`](../src/api/account-persistence.ts) | 442 | Durability drivers for the customer account store. |
| [`account-store-migration.ts`](../src/api/account-store-migration.ts) | 54 | Moving the account/money store from the JSON backend to a SQL backend (sqlite/postgres) when the operator switches CINEJELLY_DATABASE_KIND. |
| [`admin-settings-store.ts`](../src/api/admin-settings-store.ts) | 558 | Runtime operator settings — the admin dashboard's backing store. |
| [`api-auth.ts`](../src/api/api-auth.ts) | 195 | API authentication guard for protecting endpoints that can spend provider credits or reveal run metadata. |
| [`api-client-policy.ts`](../src/api/api-client-policy.ts) | 502 | Per-client render policy and quota reservations. |
| [`api-concurrency-gate.ts`](../src/api/api-concurrency-gate.ts) | 61 | In-process concurrency gate for long-running synchronous API work. |
| [`api-rate-limit.ts`](../src/api/api-rate-limit.ts) | 198 | In-process API rate limiter for credit-spending render endpoints. |
| [`api-response-redaction.ts`](../src/api/api-response-redaction.ts) | 165 | API response redaction for deployment-local filesystem paths and internal source lineage. |
| [`artifact-response.ts`](../src/api/artifact-response.ts) | 54 | Public artifact response DTOs. |
| [`atlas-pricing-probe.ts`](../src/api/atlas-pricing-probe.ts) | 290 | On-demand reader for Atlas Cloud's public model pricing page. |
| [`http-lifecycle.ts`](../src/api/http-lifecycle.ts) | 70 | HTTP lifecycle coordination for paid render requests. |
| [`media-type.ts`](../src/api/media-type.ts) | 26 | HTTP media-type helpers for public API request admission. |
| [`operator-launch-dashboard-page.ts`](../src/api/operator-launch-dashboard-page.ts) | 421 | First-party operator launch dashboard page. |
| [`operator-topup-page.ts`](../src/api/operator-topup-page.ts) | 697 | CineJelly Admin Center. |
| [`production-graph-resume-queue-client.ts`](../src/api/production-graph-resume-queue-client.ts) | 245 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`production-graph-resume-queue-service.ts`](../src/api/production-graph-resume-queue-service.ts) | 315 | Deployment-facing Production Graph resume queue service. |
| [`render-job-history-store.ts`](../src/api/render-job-history-store.ts) | 748 | Optional file-backed retained job history for API operators. |
| [`render-job-manager.ts`](../src/api/render-job-manager.ts) | 1718 | In-process render job manager for long-running CineJelly productions. |
| [`render-provider-graph-resume-worker.ts`](../src/api/render-provider-graph-resume-worker.ts) | 260 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`render-provider-handoff-action-ledger.ts`](../src/api/render-provider-handoff-action-ledger.ts) | 548 | Idempotent action ledger for provider handoff workers. |
| [`render-provider-handoff-external-lease.ts`](../src/api/render-provider-handoff-external-lease.ts) | 316 | External provider handoff lease-store adapter. |
| [`render-provider-handoff-lease-service.ts`](../src/api/render-provider-handoff-lease-service.ts) | 309 | Deployment-facing lease service for render-provider handoff workers. |
| [`render-provider-handoff.ts`](../src/api/render-provider-handoff.ts) | 662 | Provider handoff foundation for restored async render jobs. |
| [`render-provider-reconciler.ts`](../src/api/render-provider-reconciler.ts) | 374 | Provider-state reconciliation for restored async render-job checkpoints. |
| [`render-request-admission.ts`](../src/api/render-request-admission.ts) | 1151 | Render request admission control. |
| [`request-context.ts`](../src/api/request-context.ts) | 39 | Request context for correlating API responses, render jobs, artifacts, and provider metadata. |
| [`server.ts`](../src/api/server.ts) | 4665 | Production HTTP entrypoint for CineJelly's one-input render pipeline. |
| [`short-channel-style-library-store.ts`](../src/api/short-channel-style-library-store.ts) | 365 | Optional file-backed channel style library for Short UI/workspace flows. |
| [`short-pipeline-create-page.ts`](../src/api/short-pipeline-create-page.ts) | 4094 | First-party Short create/review page shell. |
| [`short-pipeline-session-store.ts`](../src/api/short-pipeline-session-store.ts) | 462 | Optional file-backed short-pipeline conversation session store. |
| [`tenant-scoped-retention.ts`](../src/api/tenant-scoped-retention.ts) | 60 | Retention that cannot be used as a weapon. |
| [`terms-page.ts`](../src/api/terms-page.ts) | 122 | Customer-facing Terms of Service + refund policy page (Vietnamese-first). |
| [`user-account-store.ts`](../src/api/user-account-store.ts) | 1409 | Customer accounts, sessions, and the credit ledger. |
| [`workspace-billing-policy.ts`](../src/api/workspace-billing-policy.ts) | 730 | Workspace, project, and billing quota foundation for commercial render traffic. |

## `src/agents/` — Các tác nhân điều phối — nơi một đơn hàng trở thành video

10 module.

| Module | Dòng | Nhiệm vụ |
|---|---:|---|
| [`creative-brief-analyst.ts`](../src/agents/creative-brief-analyst.ts) | 225 | Creative Brief Analyst — the deep-understanding stage BETWEEN intake and the scriptwriter. |
| [`director-agent.ts`](../src/agents/director-agent.ts) | 3082 | Director Agent orchestrates the first runnable render-level pipeline: input -> story plan -> shot planning -> prompt compile -> preflight -> Seedance render -> render inspection. |
| [`intake-director.ts`](../src/agents/intake-director.ts) | 58 | Intake Director turns one founder/customer input into a normalized project request. |
| [`reference-librarian.ts`](../src/agents/reference-librarian.ts) | 321 | Reference Librarian validates and normalizes user-supplied references before any LLM or render spend. |
| [`reference-vision-analyst.ts`](../src/agents/reference-vision-analyst.ts) | 249 | Reference Vision Analyst — grounds the creative decision in the ACTUAL uploaded assets instead of just their {role,label}. |
| [`render-producer.ts`](../src/agents/render-producer.ts) | 268 | Render Producer submits compiled prompts to the selected video provider and waits for async completion. |
| [`script-enhancer.ts`](../src/agents/script-enhancer.ts) | 152 | Script Enhancer — a pre-render polish pass between the Story Architect and the shot planner (mined from ViMax's script_enhancer). |
| [`source-video-analyst.ts`](../src/agents/source-video-analyst.ts) | 390 | Source Video Analyst normalizes caller-supplied video deconstruction metadata. |
| [`source-video-reference-metadata-enricher.ts`](../src/agents/source-video-reference-metadata-enricher.ts) | 204 | Enriches references with structured metadata derived from normalized source-video analysis. |
| [`story-architect.ts`](../src/agents/story-architect.ts) | 1169 | Story Architect uses the configured LLM provider to build a structured scene/beat plan. |

## `src/core/` — Luật nghiệp vụ thuần — không đọc biến môi trường, không gọi mạng

106 module.

| Module | Dòng | Nhiệm vụ |
|---|---:|---|
| [`anti-slop-lexicon.ts`](../src/core/anti-slop-lexicon.ts) | 199 | Anti-slop lexicon — replace generic "AI slop" filler with concrete cinematography. |
| [`assembly-engine.ts`](../src/core/assembly-engine.ts) | 468 | FFmpeg Assembly Engine. |
| [`assembly-output-selector.ts`](../src/core/assembly-output-selector.ts) | 133 | Selects provider outputs that are safe to place on the final assembly timeline. |
| [`audience-niche-intelligence.ts`](../src/core/audience-niche-intelligence.ts) | 589 | Shared deterministic audience/niche intelligence for Short and Long. |
| [`audio-mix-engine.ts`](../src/core/audio-mix-engine.ts) | 327 | FFmpeg audio mix engine. |
| [`avatar-shot-planner.ts`](../src/core/avatar-shot-planner.ts) | 111 | Avatar shot planner — the Topview-class routing decision. |
| [`caption-engine.ts`](../src/core/caption-engine.ts) | 113 | Caption Engine. |
| [`chunking.ts`](../src/core/chunking.ts) | 75 | Smart clip chunking for Seedance 2.0 long-form production. |
| [`consistency-guardian.ts`](../src/core/consistency-guardian.ts) | 907 | Consistency Guardian domain service. |
| [`content-safety-gate.ts`](../src/core/content-safety-gate.ts) | 138 | Content screen — one rule, deliberately. |
| [`continuity-ledger-builder.ts`](../src/core/continuity-ledger-builder.ts) | 96 | Continuity Ledger Builder. |
| [`customer-actionable-error.ts`](../src/core/customer-actionable-error.ts) | 18 | An error whose message is plain-customer guidance (Vietnamese-first) for a problem ONLY the customer can fix — a mis-slotted upload, an unusable input — as opposed to internal/config failures the customer must never see. |
| [`delivery-gate.ts`](../src/core/delivery-gate.ts) | 200 | Delivery Gate blocks customer handoff when deterministic media checks fail. |
| [`director-style-audio-review.ts`](../src/core/director-style-audio-review.ts) | 241 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`director-style-benchmark.ts`](../src/core/director-style-benchmark.ts) | 1450 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`director-style-generated-audio-provider-evidence.ts`](../src/core/director-style-generated-audio-provider-evidence.ts) | 236 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`director-style-governance-review.ts`](../src/core/director-style-governance-review.ts) | 190 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`director-style-long-form-validation-evidence.ts`](../src/core/director-style-long-form-validation-evidence.ts) | 202 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`director-style-media-evidence.ts`](../src/core/director-style-media-evidence.ts) | 685 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`director-style-review-artifact-binding.ts`](../src/core/director-style-review-artifact-binding.ts) | 96 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`director-style-review-text.ts`](../src/core/director-style-review-text.ts) | 42 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`director-style-runtime-review.ts`](../src/core/director-style-runtime-review.ts) | 239 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`director-style-semantic-review.ts`](../src/core/director-style-semantic-review.ts) | 240 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`dub-duration-fit.ts`](../src/core/dub-duration-fit.ts) | 147 | Dubbing duration-fit planner (pure math, no I/O). |
| [`duration-scripting.ts`](../src/core/duration-scripting.ts) | 367 | Duration scripting engine. |
| [`endpoint-frame-chain.ts`](../src/core/endpoint-frame-chain.ts) | 357 | Picks the still that the NEXT shot starts from, so a multi-shot video looks like one continuous take instead of a slideshow of unrelated clips. |
| [`generated-audio-asset-resolver.ts`](../src/core/generated-audio-asset-resolver.ts) | 417 | Resolves reviewed generated-audio asset:// references into safe HTTPS delivery URLs. |
| [`generated-audio-execution-planner.ts`](../src/core/generated-audio-execution-planner.ts) | 246 | Maps generated-audio intents to verified provider capabilities without calling providers. |
| [`generated-audio-output-batch-validator.ts`](../src/core/generated-audio-output-batch-validator.ts) | 275 | Reconciles generated-audio execution plans with provider results before final audio mixing. |
| [`generated-audio-output-validator.ts`](../src/core/generated-audio-output-validator.ts) | 398 | Validates provider-generated audio results before they can become mix tracks. |
| [`generated-audio-provider-execution-runner.ts`](../src/core/generated-audio-provider-execution-runner.ts) | 152 | Executes verified generated-audio provider requests. |
| [`image-anchor-verifier.ts`](../src/core/image-anchor-verifier.ts) | 125 | Image-anchor verifier — the ViMax spend-economy stage CineJelly was missing (repo-fidelity audit gap #2): check the CHEAP image (portrait ~$0.036, keyframe ~$0.036) BEFORE the EXPENSIVE video conditions on it. |
| [`keyframe-first-planner.ts`](../src/core/keyframe-first-planner.ts) | 685 | Keyframe-first planner. |
| [`local-material-library-adapter.ts`](../src/core/local-material-library-adapter.ts) | 368 | Local material library adapter. |
| [`long-director-planner.ts`](../src/core/long-director-planner.ts) | 234 | Long Director planner. |
| [`long-director-ui-contract.ts`](../src/core/long-director-ui-contract.ts) | 203 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`long-form-agent-review-planner.ts`](../src/core/long-form-agent-review-planner.ts) | 369 | Deterministic long-form agentic review board. |
| [`long-form-continuity-planner.ts`](../src/core/long-form-continuity-planner.ts) | 220 | Long-form continuity planner. |
| [`long-form-creative-intelligence-planner.ts`](../src/core/long-form-creative-intelligence-planner.ts) | 1131 | Long-form creative intelligence planner. |
| [`long-form-readiness-planner.ts`](../src/core/long-form-readiness-planner.ts) | 928 | Long-form readiness planner. |
| [`long-form-sequence-planner.ts`](../src/core/long-form-sequence-planner.ts) | 80 | Deterministic long-form sequence planner. |
| [`long-form-timeline-planner.ts`](../src/core/long-form-timeline-planner.ts) | 767 | Deterministic long-form timeline planner. |
| [`material-source-validator.ts`](../src/core/material-source-validator.ts) | 597 | Material source validation gate. |
| [`material-sourcing-planner.ts`](../src/core/material-sourcing-planner.ts) | 158 | Material sourcing planner inspired by staged material flow, implemented as CineJelly-owned planning contracts. |
| [`media-inspector.ts`](../src/core/media-inspector.ts) | 206 | FFprobe-based media inspector for delivery QC. |
| [`niche-playbooks.ts`](../src/core/niche-playbooks.ts) | 504 | Niche playbooks — script-time creative intelligence per content family. |
| [`operator-launch-ui-contract.ts`](../src/core/operator-launch-ui-contract.ts) | 240 | Operator launch UI contract. |
| [`output-retention-janitor.ts`](../src/core/output-retention-janitor.ts) | 103 | Auto-cleans OLD render output so a solo operator's disk never silently fills (durability audit: deliverables/redub/work dirs otherwise accumulate forever, and once the disk is full every render AND every account/ledger write fails). |
| [`postproduction-asset-planner.ts`](../src/core/postproduction-asset-planner.ts) | 252 | Postproduction asset planner. |
| [`postproduction-engine.ts`](../src/core/postproduction-engine.ts) | 113 | FFmpeg postproduction polish. |
| [`private-source-pattern-registry.ts`](../src/core/private-source-pattern-registry.ts) | 412 | Private source-pattern registry. |
| [`product-url-researcher.ts`](../src/core/product-url-researcher.ts) | 785 | Product URL researcher for short-pipeline URL-to-video planning. |
| [`production-graph-builder.ts`](../src/core/production-graph-builder.ts) | 259 | Production Graph Builder. |
| [`production-graph-resume-state.ts`](../src/core/production-graph-resume-state.ts) | 953 | Secure Production Graph resume-state capsule foundation. |
| [`production-graph-run-recorder.ts`](../src/core/production-graph-run-recorder.ts) | 197 | Production Graph Run Recorder. |
| [`production-graph.ts`](../src/core/production-graph.ts) | 134 | Production Graph implementation. |
| [`production-stage-planner.ts`](../src/core/production-stage-planner.ts) | 274 | Builds deterministic stage lifecycle evidence for long-form and batch-aware runs. |
| [`project-artifact-store.ts`](../src/core/project-artifact-store.ts) | 400 | Durable project artifact writer. |
| [`project-artifact-validator.ts`](../src/core/project-artifact-validator.ts) | 3644 | Validates durable run artifacts after real provider validation. |
| [`redub-executor.ts`](../src/core/redub-executor.ts) | 177 | Redub Executor — the missing second half of the dub/subtitle pipeline. |
| [`reference-selection-planner.ts`](../src/core/reference-selection-planner.ts) | 280 | Reference Selection Planner. |
| [`register-grammar.ts`](../src/core/register-grammar.ts) | 172 | Two-register style engine — the zero-hardcode replacement for per-niche style tables. |
| [`remote-stock-material-adapter.ts`](../src/core/remote-stock-material-adapter.ts) | 577 | Remote stock material adapter. |
| [`render-cost-gate.ts`](../src/core/render-cost-gate.ts) | 252 | Render Cost Gate. |
| [`render-scheduler.ts`](../src/core/render-scheduler.ts) | 272 | Render scheduler for long-form production. |
| [`rendered-candidate-visual-inspector.ts`](../src/core/rendered-candidate-visual-inspector.ts) | 348 | Per-candidate visual curation. |
| [`review-approval-system.ts`](../src/core/review-approval-system.ts) | 266 | Review/Approval System. |
| [`review-packet-builder.ts`](../src/core/review-packet-builder.ts) | 413 | Review Packet Builder. |
| [`seedance-cinematic-grammar.ts`](../src/core/seedance-cinematic-grammar.ts) | 107 | Seedance-reliable cinematic grammar. |
| [`seedance-dna.ts`](../src/core/seedance-dna.ts) | 184 | Seedance prompt DNA engine. |
| [`semantic-sequence-segmenter.ts`](../src/core/semantic-sequence-segmenter.ts) | 193 | Semantic long-form scene segmentation. |
| [`semantic-visual-inspector.ts`](../src/core/semantic-visual-inspector.ts) | 145 | Semantic visual inspector powered by the configured LLM provider. |
| [`series-continuity-store.ts`](../src/core/series-continuity-store.ts) | 447 | Series Continuity Store — the persistence layer that turns the no-spend series planner into a real 30-70-episode product. |
| [`series-drama-planner.ts`](../src/core/series-drama-planner.ts) | 443 | Series Drama Planner. |
| [`short-agent-graph-planner.ts`](../src/core/short-agent-graph-planner.ts) | 1577 | Short Agent v2 graph planner. |
| [`short-channel-style-profile.ts`](../src/core/short-channel-style-profile.ts) | 327 | Channel style profile for repeatable short-video identity. |
| [`short-commercial-readiness-planner.ts`](../src/core/short-commercial-readiness-planner.ts) | 807 | Short commercial readiness gate. |
| [`short-creative-pattern-learning.ts`](../src/core/short-creative-pattern-learning.ts) | 728 | Short creative pattern learning. |
| [`short-director-planner.ts`](../src/core/short-director-planner.ts) | 305 | Short Director planner. |
| [`short-mvp-ui-contract.ts`](../src/core/short-mvp-ui-contract.ts) | 624 | Short MVP UI contract. |
| [`short-pipeline-conversation.ts`](../src/core/short-pipeline-conversation.ts) | 362 | Agentic short-pipeline conversation layer. |
| [`short-pipeline-planner.ts`](../src/core/short-pipeline-planner.ts) | 2418 | Agentic short-pipeline foundation. |
| [`short-pipeline-render-handoff.ts`](../src/core/short-pipeline-render-handoff.ts) | 1232 | Short-pipeline render handoff. |
| [`short-platform-template-corpus.ts`](../src/core/short-platform-template-corpus.ts) | 335 | Platform template training corpus for short-form candidates. |
| [`short-prompt-pattern-corpus.ts`](../src/core/short-prompt-pattern-corpus.ts) | 346 | Short prompt pattern corpus. |
| [`short-video-pipe-planner.ts`](../src/core/short-video-pipe-planner.ts) | 806 | Core short video pipe planner. |
| [`short-viral-intelligence-planner.ts`](../src/core/short-viral-intelligence-planner.ts) | 893 | Short viral/niche intelligence. |
| [`short-visual-bible-planner.ts`](../src/core/short-visual-bible-planner.ts) | 817 | Plans the visual bible — the reference board, storyboard or full production bible that fixes how a video will LOOK before it is rendered. |
| [`shot-grammar.ts`](../src/core/shot-grammar.ts) | 402 | Controlled shot-grammar vocabulary. |
| [`shot-planner.ts`](../src/core/shot-planner.ts) | 656 | Shot Planner for converting scene and beat plans into renderable ShotContracts. |
| [`simple-brief-resolver.ts`](../src/core/simple-brief-resolver.ts) | 212 | Simple brief resolver. |
| [`social-publishing-planner.ts`](../src/core/social-publishing-planner.ts) | 159 | Social publishing metadata planner. |
| [`source-logic-translation-ledger.ts`](../src/core/source-logic-translation-ledger.ts) | 143 | In-memory provenance ledger for source-derived behavior. |
| [`source-logic-translation-records.ts`](../src/core/source-logic-translation-records.ts) | 3365 | Default source-logic lineage records for behavior already translated into CineJelly-owned runtime code. |
| [`source-video-auto-analyzer.ts`](../src/core/source-video-auto-analyzer.ts) | 389 | Opt-in source-video auto analysis adapter. |
| [`source-video-media-metrics-analyzer.ts`](../src/core/source-video-media-metrics-analyzer.ts) | 173 | Deterministic source-video media metrics for remake planning. |
| [`spoken-language.ts`](../src/core/spoken-language.ts) | 68 | Spoken-language helpers shared by the analyst, the prompt compiler, and the TTS stage — ONE definition of "is this Vietnamese?" and one language-code normalizer, so the stages can never disagree about the same line (cross-review: the diacritic regex was copy-pasted 3x). |
| [`storyboard-approval-gate.ts`](../src/core/storyboard-approval-gate.ts) | 110 | Storyboard Approval Gate. |
| [`storyboard-planner.ts`](../src/core/storyboard-planner.ts) | 103 | Storyboard Planner. |
| [`subtitle-caption-builder.ts`](../src/core/subtitle-caption-builder.ts) | 198 | Subtitle caption builder. |
| [`subtitle-translator.ts`](../src/core/subtitle-translator.ts) | 232 | Multi-language subtitle translation — Translate → Reflect → Adapt. |
| [`transition-engine.ts`](../src/core/transition-engine.ts) | 405 | FFmpeg transition engine for smooth clip assembly. |
| [`typography-scene-composer.ts`](../src/core/typography-scene-composer.ts) | 230 | Typography / text-scene composition. |
| [`upload-reference.ts`](../src/core/upload-reference.ts) | 56 | Uploaded-reference handles. |
| [`video-redub-planner.ts`](../src/core/video-redub-planner.ts) | 218 | Video re-dub / re-narration planner — the full translate-a-video pipeline. |
| [`video-render-strategy-planner.ts`](../src/core/video-render-strategy-planner.ts) | 527 | Decides HOW a job is rendered before any money is spent: one continuous clip or several chained shots, whether last-frame chaining is on, and which reference roles the plan is actually allowed to use. |

## `src/prompt_compiler/` — Biên dịch lời nhắc gửi cho model

4 module.

| Module | Dòng | Nhiệm vụ |
|---|---:|---|
| [`negative-constraints.ts`](../src/prompt_compiler/negative-constraints.ts) | 56 | Negative constraint builder for Seedance prompts. |
| [`prompt-compiler.ts`](../src/prompt_compiler/prompt-compiler.ts) | 970 | Seedance Prompt Compiler. |
| [`reference-binding.ts`](../src/prompt_compiler/reference-binding.ts) | 428 | Reference binding helpers based on the documented Seedance Reference Cluster pattern. |
| [`repair-hints.ts`](../src/prompt_compiler/repair-hints.ts) | 29 | Prompt repair hints used by Consistency Guardian after render inspection. |

## `src/providers/` — Lớp duy nhất được phép gọi ra Internet

4 module.

| Module | Dòng | Nhiệm vụ |
|---|---:|---|
| [`capability-validator.ts`](../src/providers/capability-validator.ts) | 146 | Provider-neutral video capability validation. |
| [`contracts.ts`](../src/providers/contracts.ts) | 111 | Provider interfaces from docs/MODEL_PROVIDER_ABSTRACTION.md. |
| [`cost-ledger.ts`](../src/providers/cost-ledger.ts) | 38 | In-process cost and latency ledger for provider calls. |
| [`provider-registry.ts`](../src/providers/provider-registry.ts) | 27 | Registry for provider implementations. |

## `src/application/` — Lắp ráp các thành phần lại với nhau

14 module.

| Module | Dòng | Nhiệm vụ |
|---|---:|---|
| [`artifact-validation-entrypoint.ts`](../src/application/artifact-validation-entrypoint.ts) | 57 | Production CLI entrypoint for validating durable run artifacts after provider validation. |
| [`atlas-model-preflight.ts`](../src/application/atlas-model-preflight.ts) | 140 | Pre-spend Atlas model validation. |
| [`director-factory.ts`](../src/application/director-factory.ts) | 134 | Factory for wiring the production DirectorAgent with Atlas Cloud provider dependencies. |
| [`env-setup.ts`](../src/application/env-setup.ts) | 75 | Pure helpers for the guided `.env` setup (the interactive `npm run setup` wraps these). |
| [`operator-health-report.ts`](../src/application/operator-health-report.ts) | 131 | Turns the raw preflight + live-Atlas + database signals into a short, plain-Vietnamese health report for the operator "🩺 Sức khỏe hệ thống" tab — each row is a green/amber/red status with a concrete "cách sửa". |
| [`paid-render-validation-entrypoint.ts`](../src/application/paid-render-validation-entrypoint.ts) | 761 | Production CLI entrypoint for Phase 6 paid render validation. |
| [`preflight-entrypoint.ts`](../src/application/preflight-entrypoint.ts) | 36 | Production CLI entrypoint for deployment readiness checks. |
| [`render-request-normalizer.ts`](../src/application/render-request-normalizer.ts) | 115 | Shared render-request normalization for API and operator validation CLI entrypoints. |
| [`render-request-validation-entrypoint.ts`](../src/application/render-request-validation-entrypoint.ts) | 239 | Production CLI entrypoint for validating an operator render request before paid validation. |
| [`render-settings-descriptor.ts`](../src/application/render-settings-descriptor.ts) | 385 | Public, secret-free render settings descriptor for API clients and future UI controls. |
| [`runtime-preflight.ts`](../src/application/runtime-preflight.ts) | 1270 | Runtime preflight for deployment readiness. |
| [`series-episode-director.ts`](../src/application/series-episode-director.ts) | 301 | Series Episode Director — renders a 30-70-episode drama ONE episode at a time with real continuity, instead of the planner's templated recaps: load continuity record -> compose the next episode's request (planned beats + the REAL previously-on recap from recorded episode states + pinned cast iden... |
| [`validation-readiness-entrypoint.ts`](../src/application/validation-readiness-entrypoint.ts) | 82 | Production CLI entrypoint for Phase 6 validation readiness reporting. |
| [`validation-readiness-report.ts`](../src/application/validation-readiness-report.ts) | 100 | Phase 6 validation readiness reporting. |

## `src/config/` — Cấu hình và hằng số

4 module.

| Module | Dòng | Nhiệm vụ |
|---|---:|---|
| [`product-identity.ts`](../src/config/product-identity.ts) | 45 | The product's public name, in ONE place. |
| [`runtime-config.ts`](../src/config/runtime-config.ts) | 464 | Secret-safe runtime configuration loader. |
| [`seedance-capabilities.ts`](../src/config/seedance-capabilities.ts) | 86 | Shared Seedance capability defaults used by provider validation and public settings descriptors. |
| [`seedance-settings.ts`](../src/config/seedance-settings.ts) | 261 | Flexible Seedance settings validation and model selection. |

## `src/utils/` — Tiện ích dùng chung

11 module.

| Module | Dòng | Nhiệm vụ |
|---|---:|---|
| [`copy-risk-intent.ts`](../src/utils/copy-risk-intent.ts) | 22 | _(chưa có mô tả đầu file — xem `MISSING_DESCRIPTION_BUDGET` trong scripts/audit-module-index.mjs)_ |
| [`disk-space.ts`](../src/utils/disk-space.ts) | 56 | Free-disk guard for the render path. |
| [`errors.ts`](../src/utils/errors.ts) | 126 | Normalized error classes for provider calls. |
| [`files.ts`](../src/utils/files.ts) | 35 | File-system helpers for production media assembly. |
| [`ids.ts`](../src/utils/ids.ts) | 12 | Stable ID helper for graph nodes and planned shots. |
| [`media-tools.ts`](../src/utils/media-tools.ts) | 40 | Resolves FFmpeg/FFprobe command paths for runtime and preflight. |
| [`process.ts`](../src/utils/process.ts) | 133 | Safe child-process runner for FFmpeg/FFprobe operations. |
| [`redaction.ts`](../src/utils/redaction.ts) | 108 | Redaction utilities for logs, ledger metadata, and provider error messages. |
| [`retry.ts`](../src/utils/retry.ts) | 120 | Small retry helper for provider calls with retryable normalized errors. |
| [`ssrf-guard.ts`](../src/utils/ssrf-guard.ts) | 188 | SSRF guard for every server-side fetch of a caller-influenced URL. |
| [`time.ts`](../src/utils/time.ts) | 33 | Time helpers used for latency tracking and polling without leaking provider details. |
