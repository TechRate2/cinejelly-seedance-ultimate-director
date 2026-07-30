#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/backend-system-readiness-audit-report.json",
  sourceRoot: "src",
  scriptRoot: "scripts"
};

const reportCatalog = [
  report("phase6_release_audit", "release", "release_hygiene", "assets/output_deliverables/phase6-validation/release-audit-report.json", "release_ready"),
  report("phase6_paid_render", "short", "paid_media_evidence", "assets/output_deliverables/phase6-validation/paid-render-report.json", "completed", { externalEvidence: true }),
  report("business_readiness_audit", "release", "release_gate", "assets/output_deliverables/phase6-validation/business-readiness-report.json", "blocked"),
  report("business_readiness_plan", "release", "planning", "assets/output_deliverables/business-readiness/business-readiness-validation-plan.json", "blocked_by_missing_inputs"),
  report("live_readiness_inputs", "release", "operator_evidence", "assets/output_deliverables/business-readiness/live-readiness-inputs-report.json", "blocked_by_missing_inputs"),
  report("deployment_package_validation", "deployment", "backend_contract", "assets/output_deliverables/business-readiness/deployment-package-validation-report.json", "pass"),
  report("source_structure_audit", "deployment", "backend_guard", "assets/output_deliverables/business-readiness/source-structure-audit-report.json", "pass"),
  report("api_response_redaction_smoke", "api", "backend_guard", "assets/output_deliverables/business-readiness/api-response-redaction-smoke-report.json", "pass"),
  report("private_source_lineage_boundary_audit", "api", "backend_guard", "assets/output_deliverables/business-readiness/private-source-lineage-boundary-audit-report.json", "pass"),
  report("render_request_contract_smoke", "render", "backend_contract", "assets/output_deliverables/business-readiness/render-request-contract-smoke-report.json", "pass"),
  report("deployment_readiness_capture", "deployment", "operator_evidence", "assets/output_deliverables/business-readiness/deployment-preflight-report.json", "pass", { externalEvidence: true }),
  report("local_deployment_capture_smoke", "deployment", "backend_code", "assets/output_deliverables/business-readiness/local-deployment-capture-smoke.json", "warn"),
  report("render_job_history_smoke", "render", "backend_code", "assets/output_deliverables/business-readiness/render-job-history-smoke-report.json", "pass"),
  report("render_job_review_lifecycle_smoke", "render", "backend_code", "assets/output_deliverables/business-readiness/render-job-review-lifecycle-smoke-report.json", "pass"),
  report("render_scheduler_smoke", "render", "backend_code", "assets/output_deliverables/business-readiness/render-scheduler-smoke-report.json", "pass"),
  report("video_render_strategy_smoke", "render", "backend_code", "assets/output_deliverables/business-readiness/video-render-strategy-smoke-report.json", "pass"),
  report("last_frame_chaining_smoke", "render", "backend_code", "assets/output_deliverables/business-readiness/last-frame-chaining-smoke-report.json", "pass"),
  report("render_provider_reconciliation", "provider", "backend_code", "assets/output_deliverables/business-readiness/render-provider-reconciliation-report.json", "pass"),
  report("render_provider_handoff", "provider", "backend_code", "assets/output_deliverables/business-readiness/render-provider-handoff-report.json", "pass"),
  report("render_provider_external_lease", "provider", "backend_code", "assets/output_deliverables/business-readiness/render-provider-external-lease-report.json", "pass"),
  report("render_provider_lease_service_smoke", "provider", "backend_code", "assets/output_deliverables/business-readiness/render-provider-lease-service-smoke-report.json", "pass"),
  report("render_provider_handoff_action_ledger", "provider", "backend_code", "assets/output_deliverables/business-readiness/render-provider-handoff-action-ledger-report.json", "pass"),
  report("production_graph_sequence_smoke", "production_graph", "backend_code", "assets/output_deliverables/business-readiness/production-graph-sequence-smoke-report.json", "pass"),
  report("production_graph_resume_state", "production_graph", "backend_code", "assets/output_deliverables/business-readiness/production-graph-resume-state-report.json", "pass"),
  report("production_graph_resume_queue_service", "production_graph", "backend_code", "assets/output_deliverables/business-readiness/production-graph-resume-queue-service-smoke-report.json", "pass"),
  report("render_provider_graph_resume_worker", "production_graph", "backend_code", "assets/output_deliverables/business-readiness/render-provider-graph-resume-worker-smoke-report.json", "pass"),
  report("render_provider_multi_worker_handoff", "production_graph", "backend_code", "assets/output_deliverables/business-readiness/render-provider-multi-worker-handoff-report.json", "pass"),
  report("render_provider_production_handoff", "provider", "operator_evidence", "assets/output_deliverables/business-readiness/render-provider-production-handoff-report.json", "pass", { externalEvidence: true }),
  report("render_provider_live_action_evidence_draft", "provider", "operator_evidence_draft", "assets/output_deliverables/business-readiness/render-provider-live-action-evidence-draft-report.json", "pass"),
  report("render_provider_live_action_evidence", "provider", "operator_evidence", "ops/render-provider-live-actions.json", "pass", { externalEvidence: true }),
  report("render_provider_live_actions", "provider", "operator_evidence", "assets/output_deliverables/business-readiness/render-provider-live-actions-report.json", "pass", { externalEvidence: true }),
  report("render_provider_graph_resume_enqueue_evidence", "production_graph", "operator_evidence", "ops/render-provider-graph-resume-enqueues.json", "pass", { externalEvidence: true }),
  report("render_provider_graph_resume_enqueue_evidence_draft", "production_graph", "operator_evidence_draft", "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueue-evidence-draft-report.json", "pass"),
  report("render_provider_graph_resume_enqueues", "production_graph", "operator_evidence", "assets/output_deliverables/business-readiness/render-provider-graph-resume-enqueues-report.json", "pass", { externalEvidence: true }),
  report("snapshot_parity_audit", "release", "backend_guard", "assets/output_deliverables/business-readiness/snapshot-parity-audit-report.json", "pass"),
  report("atlas_billing_readiness", "ops", "paid_provider_evidence", "assets/output_deliverables/business-readiness/atlas-billing-readiness-report.json", "pass", { externalEvidence: true }),
  report("atlas_billing_generated_audio_smoke", "audio", "paid_provider_evidence", "assets/output_deliverables/business-readiness/atlas-billing-generated-audio-smoke-report.json", "pass", { externalEvidence: true }),
  report("commercial_launch_intake_packet", "release", "operator_evidence", "ops/commercial-launch-intake.json", "pass", { externalEvidence: true }),
  report("commercial_launch_intake", "release", "operator_evidence", "assets/output_deliverables/business-readiness/commercial-launch-intake-validation-report.json", "missing_intake"),
  report("commercial_launch_doctor", "release", "release_gate", "assets/output_deliverables/business-readiness/commercial-launch-doctor-report.json", "ready_for_customer_traffic", { externalEvidence: true }),
  report("commercial_launch_inputs", "release", "operator_evidence", "assets/output_deliverables/business-readiness/commercial-launch-inputs-report.json", "blocked_by_operator_inputs"),
  report("business_completion_audit", "release", "release_gate", "assets/output_deliverables/business-readiness/business-completion-audit-report.json", "ready_for_customer_traffic", { externalEvidence: true }),
  report("roadmap_closure_audit", "release", "release_gate", "assets/output_deliverables/business-readiness/roadmap-closure-audit-report.json", "blocked_by_external_inputs"),
  report("billing_admin_attestation_packet", "ops", "operator_evidence", "ops/billing-admin-attestation.json", "pass", { externalEvidence: true }),
  report("production_operations_attestation_packet", "ops", "operator_evidence", "ops/production-operations-attestation.json", "pass", { externalEvidence: true }),
  report("ops_config_validation", "ops", "operator_evidence", "assets/output_deliverables/business-readiness/ops-config-validation-report.json", "pass", { externalEvidence: true }),
  report("long_form_validation", "long", "paid_media_evidence", "assets/output_deliverables/business-readiness/long-form-validation-report.json", "pass", { externalEvidence: true }),
  report("long_form_continuity_smoke", "long", "backend_code", "assets/output_deliverables/business-readiness/long-form-continuity-smoke-report.json", "pass"),
  report("long_form_agent_review_smoke", "long", "backend_code", "assets/output_deliverables/business-readiness/long-form-agent-review-smoke-report.json", "pass"),
  report("long_form_timeline_smoke", "long", "backend_code", "assets/output_deliverables/business-readiness/long-form-timeline-smoke-report.json", "pass"),
  report("long_form_creative_intelligence_smoke", "long", "backend_code", "assets/output_deliverables/business-readiness/long-form-creative-intelligence-smoke-report.json", "pass"),
  report("long_form_readiness_smoke", "long", "backend_code", "assets/output_deliverables/business-readiness/long-form-readiness-smoke-report.json", "pass"),
  report("long_form_manual_quality_review", "long", "operator_evidence", "ops/long-form-manual-quality-review.json", "pass", { externalEvidence: true }),
  report("long_form_manual_quality_review_draft", "long", "operator_evidence_draft", "assets/output_deliverables/business-readiness/long-form-manual-quality-review-draft-report.json", "pass", { externalEvidence: true }),
  report("long_form_manual_quality_review_readiness", "long", "operator_evidence", "assets/output_deliverables/business-readiness/long-form-manual-quality-review-readiness-report.json", "pass", { externalEvidence: true }),
  report("source_video_auto_analysis_smoke", "source_video", "backend_code", "assets/output_deliverables/business-readiness/source-video-auto-analysis-smoke-report.json", "pass"),
  report("source_video_validation", "source_video", "paid_provider_evidence", "assets/output_deliverables/business-readiness/source-video-validation-report.json", "pass", { externalEvidence: true }),
  report("remote_stock_adapter_smoke", "materials", "backend_code", "assets/output_deliverables/business-readiness/remote-stock-adapter-smoke-report.json", "pass"),
  report("remote_stock_validation", "materials", "paid_provider_evidence", "assets/output_deliverables/business-readiness/remote-stock-validation-report.json", "pass", { externalEvidence: true }),
  report("material_source_scoring_smoke", "materials", "backend_code", "assets/output_deliverables/business-readiness/material-source-scoring-smoke-report.json", "pass"),
  report("generated_audio_validation", "audio", "paid_provider_evidence", "assets/output_deliverables/business-readiness/generated-audio-validation-report.json", "pass", { externalEvidence: true }),
  report("generated_audio_artifact_evidence", "audio", "operator_evidence_draft", "assets/output_deliverables/business-readiness/generated-audio-artifact-evidence-report.json", "pass"),
  report("generated_audio_manual_review", "audio", "operator_evidence", "ops/generated-audio-manual-review.json", "pass", { externalEvidence: true }),
  report("generated_audio_manual_review_draft", "audio", "operator_evidence_draft", "assets/output_deliverables/business-readiness/generated-audio-manual-review-draft-report.json", "pass"),
  report("generated_audio_manual_review_readiness", "audio", "operator_evidence", "assets/output_deliverables/business-readiness/generated-audio-manual-review-readiness-report.json", "ready_for_manual_review", { externalEvidence: true }),
  report("generated_audio_mapping_smoke", "audio", "backend_code", "assets/output_deliverables/business-readiness/generated-audio-mapping-smoke-report.json", "pass"),
  report("generated_audio_polling_resilience", "audio", "backend_code", "assets/output_deliverables/business-readiness/generated-audio-polling-resilience-smoke-report.json", "pass"),
  report("transition_audio_continuity_smoke", "audio", "backend_code", "assets/output_deliverables/business-readiness/transition-audio-continuity-smoke-report.json", "pass"),
  report("short_pipeline_smoke", "short", "backend_code", "assets/output_deliverables/business-readiness/short-pipeline-smoke-report.json", "pass"),
  report("short_viral_intelligence_smoke", "short", "backend_code", "assets/output_deliverables/business-readiness/short-viral-intelligence-smoke-report.json", "pass"),
  report("short_agent_graph_smoke", "short", "backend_code", "assets/output_deliverables/business-readiness/short-agent-graph-smoke-report.json", "pass"),
  report("short_pipeline_conversation_smoke", "short", "backend_code", "assets/output_deliverables/business-readiness/short-pipeline-conversation-smoke-report.json", "pass"),
  report("short_pipeline_session_store_smoke", "short", "backend_code", "assets/output_deliverables/business-readiness/short-pipeline-session-store-smoke-report.json", "pass"),
  report("short_pipeline_session_render_handoff_smoke", "short", "backend_code", "assets/output_deliverables/business-readiness/short-pipeline-session-render-handoff-smoke-report.json", "pass"),
  report("short_mvp_ui_contract_smoke", "short", "backend_contract", "assets/output_deliverables/business-readiness/short-mvp-ui-contract-smoke-report.json", "pass"),
  report("short_prompt_pattern_corpus", "short", "training_corpus", "assets/output_deliverables/business-readiness/short-prompt-pattern-corpus-report.json", "pass"),
  report("short_platform_template_corpus", "short", "training_corpus", "assets/output_deliverables/business-readiness/short-platform-template-corpus-report.json", "pass"),
  report("short_backend_integration_audit", "short", "source_connectivity", "assets/output_deliverables/business-readiness/short-backend-integration-audit-report.json", "pass"),
  report("backend_system_readiness_audit", "contracts", "backend_contract", "assets/output_deliverables/business-readiness/backend-system-readiness-audit-report.json", "blocked_by_external_evidence"),
  report("backend_system_suite", "contracts", "backend_contract", "assets/output_deliverables/business-readiness/backend-system-suite-report.json", "pass"),
  report("short_review_operation_evidence", "short", "operator_evidence", "ops/short-review-operation-evidence.json", "pass", { externalEvidence: true }),
  report("short_review_operation_draft", "short", "operator_evidence_draft", "assets/output_deliverables/business-readiness/short-review-operation-evidence-draft-report.json", "pass"),
  report("short_review_operation_validation", "short", "operator_evidence", "assets/output_deliverables/business-readiness/short-review-operation-validation-report.json", "pass", { externalEvidence: true }),
  report("short_review_operation_guard", "short", "backend_guard", "assets/output_deliverables/business-readiness/short-review-operation-evidence-guard-smoke-report.json", "pass"),
  report("short_product_rights_evidence", "short", "operator_evidence", "ops/short-product-rights-evidence.json", "pass", { externalEvidence: true }),
  report("short_product_rights_draft", "short", "operator_evidence_draft", "assets/output_deliverables/business-readiness/short-product-rights-evidence-draft-report.json", "pass"),
  report("short_product_rights_validation", "short", "operator_evidence", "assets/output_deliverables/business-readiness/short-product-rights-validation-report.json", "pass", { externalEvidence: true }),
  report("short_product_rights_guard", "short", "backend_guard", "assets/output_deliverables/business-readiness/short-product-rights-evidence-guard-smoke-report.json", "pass"),
  report("operator_launch_ui_contract_smoke", "ops", "backend_contract", "assets/output_deliverables/business-readiness/operator-launch-ui-contract-smoke-report.json", "pass", { externalEvidence: true }),
  report("director_style_semantic_review", "quality", "operator_evidence", "assets/output_deliverables/business-readiness/director-style-semantic-review.json", "pass", { externalEvidence: true }),
  report("director_style_audio_review", "quality", "operator_evidence", "assets/output_deliverables/business-readiness/director-style-audio-review.json", "pass", { externalEvidence: true }),
  report("director_style_runtime_review", "quality", "operator_evidence", "assets/output_deliverables/business-readiness/director-style-runtime-review.json", "pass", { externalEvidence: true }),
  report("director_style_governance_review", "quality", "operator_evidence", "assets/output_deliverables/business-readiness/director-style-governance-review.json", "pass", { externalEvidence: true }),
  report("director_style_review_drafts", "quality", "operator_evidence_draft", "assets/output_deliverables/business-readiness/director-style-review-drafts-report.json", "pass"),
  report("director_style_review_evidence_readiness", "quality", "operator_evidence", "assets/output_deliverables/business-readiness/director-style-review-evidence-readiness-report.json", "pass", { externalEvidence: true }),
  report("director_style_review_evidence_guard", "quality", "backend_guard", "assets/output_deliverables/business-readiness/director-style-review-evidence-guard-smoke-report.json", "pass"),
  report("director_style_benchmark", "quality", "benchmark", "assets/output_deliverables/business-readiness/director-style-benchmark-report.json", "review_required"),
  report("billing_admin_ops", "ops", "operator_evidence", "assets/output_deliverables/business-readiness/billing-admin-ops-report.json", "pass", { externalEvidence: true }),
  report("production_operations", "ops", "operator_evidence", "assets/output_deliverables/business-readiness/production-operations-report.json", "pass", { externalEvidence: true }),
  report("report_contract_validation", "contracts", "backend_contract", "assets/output_deliverables/business-readiness/report-contract-validation-report.json", "pass"),
];

const criticalModulePaths = [
  "src/index.ts",
  "src/api/server.ts",
  "src/core/short-pipeline-planner.ts",
  "src/core/short-pipeline-render-handoff.ts",
  "src/core/short-viral-intelligence-planner.ts",
  "src/core/short-creative-pattern-learning.ts",
  "src/core/short-prompt-pattern-corpus.ts",
  "src/core/short-platform-template-corpus.ts",
  "src/core/short-visual-bible-planner.ts",
  "src/core/short-video-pipe-planner.ts",
  "src/core/long-form-timeline-planner.ts",
  "src/core/endpoint-frame-chain.ts",
  "src/core/source-video-auto-analyzer.ts",
  "src/core/assembly-engine.ts",
  "src/core/postproduction-engine.ts",
  "src/providers/atlascloud/atlas-cloud-provider.ts",
  "src/config/seedance-settings.ts",
  "src/types/short-pipeline.ts",
  "src/types/short-mvp-ui.ts"
];

const auditedValidationCommandNames = [
  "validation:account-billing",
  "validation:account-ledger-incremental",
  "validation:account-store-migration",
  "validation:admin-center",
  "validation:anti-slop",
  "validation:api-response-redaction",
  "validation:atlas-billing",
  "validation:atlas-model-preflight",
  "validation:atlas-pricing-probe",
  "validation:backend-system-readiness",
  "validation:backend-system-suite",
  "validation:beat-sync",
  "validation:billing-admin-ops",
  "validation:business-plan",
  "validation:business-readiness",
  "validation:candidate-visual-curation",
  "validation:cinematic-grammar",
  "validation:client-policy-smoke",
  "validation:commercial-inputs",
  "validation:commercial-policy",
  "validation:completion-audit",
  "validation:content-safety",
  "validation:content-safety-punctuation",
  "validation:create-request",
  "validation:deployment-package",
  "validation:deployment-readiness",
  "validation:disk-guard",
  "validation:dub-duration-fit",
  "validation:duration-scripting",
  "validation:env-setup",
  "validation:generated-audio",
  "validation:generated-audio-artifact",
  "validation:generated-audio-mapping",
  "validation:generated-audio-polling-resilience",
  "validation:generated-audio-review-draft",
  "validation:generated-audio-review-readiness",
  "validation:graph-resume-queue-service",
  "validation:graph-resume-state",
  "validation:graph-sequence",
  "validation:image-anchor-verifier",
  "validation:input-matrix",
  "validation:keyframe-first",
  "validation:last-frame-chaining",
  "validation:launch-doctor",
  "validation:launch-intake",
  "validation:launch-rehearsal",
  "validation:live-inputs",
  "validation:local-smoke",
  "validation:long-backend-45s-closure",
  "validation:long-form",
  "validation:long-form-agent-review",
  "validation:long-form-beat-density",
  "validation:long-form-continuity",
  "validation:long-form-creative-intelligence",
  "validation:long-form-readiness",
  "validation:long-form-review-draft",
  "validation:long-form-review-readiness",
  "validation:long-form-timeline",
  "validation:material-source-scoring",
  "validation:mixed-output-assembly",
  "validation:niche-playbooks",
  "validation:operator-health-report",
  "validation:operator-hold",
  "validation:operator-hold-http",
  "validation:operator-launch-ui-contract",
  "validation:ops-config",
  "validation:output-retention-janitor",
  "validation:paid-render",
  "validation:pipeline-100",
  "validation:pipeline-pricing",
  "validation:pipeline-upgrades",
  "validation:private-source-lineage-boundary",
  "validation:published-secrets",
  "validation:production-ops",
  "validation:provider-external-lease",
  "validation:provider-graph-resume",
  "validation:provider-graph-resume-draft",
  "validation:provider-graph-resume-worker",
  "validation:provider-handoff",
  "validation:provider-handoff-actions",
  "validation:provider-lease-service",
  "validation:provider-live-action-draft",
  "validation:provider-live-actions",
  "validation:provider-multi-worker-handoff",
  "validation:provider-production-handoff",
  "validation:provider-reconciliation",
  "validation:quality-benchmark",
  "validation:quality-review-drafts",
  "validation:quality-review-evidence",
  "validation:quality-review-guard",
  "validation:readiness",
  "validation:reconcile-settlement",
  "validation:reference-role-reconcile",
  "validation:register-audio-coherence",
  "validation:release-audit",
  "validation:remote-stock",
  "validation:remote-stock-adapter-smoke",
  "validation:render-job-history",
  "validation:render-job-review-lifecycle",
  "validation:render-request",
  "validation:render-request-contract",
  "validation:render-failure-resilience",
  "validation:render-scheduler",
  "validation:render-settlement-race",
  "validation:report-contracts",
  "validation:review-approval-smoke",
  "validation:roadmap-closure",
  "validation:security-hardening",
  "validation:seedance-dna",
  "validation:series-drama",
  "validation:short-agent-graph",
  "validation:short-backend-integration",
  "validation:short-mvp-ui-contract",
  "validation:short-pipeline",
  "validation:short-pipeline-conversation",
  "validation:short-pipeline-session-render-handoff",
  "validation:short-pipeline-session-store",
  "validation:short-platform-template-corpus",
  "validation:short-product-rights",
  "validation:short-product-rights-draft",
  "validation:short-product-rights-guard",
  "validation:short-prompt-corpus",
  "validation:short-review-operation",
  "validation:short-review-operation-draft",
  "validation:short-review-operation-guard",
  "validation:short-viral-intelligence",
  "validation:shot-framing",
  "validation:simple-brief",
  "validation:single-clip-vo-budget",
  "validation:snapshot-parity",
  "validation:source-structure",
  "validation:source-video-auto-analysis",
  "validation:source-video-auto-analysis-smoke",
  "validation:speech-captions",
  "validation:speech-duration-guard",
  "validation:ssrf-guard",
  "validation:storyboard-approval-gate",
  "validation:subtitle-dub",
  "validation:tenant-isolation",
  "validation:talking-duration-fill",
  "validation:transition-audio-continuity",
  "validation:ui-contract-crosscheck",
  "validation:upload-intake-and-guidance",
  "validation:upload-route",
  "validation:video-render-strategy",
  "validation:wire-contract",
  "validation:workspace-billing",
];

const externalEvidenceCommandByReportId = {
  deployment_readiness_capture: "validation:deployment-readiness",
  render_provider_reconciliation: "validation:provider-reconciliation",
  render_provider_handoff: "validation:provider-handoff",
  render_provider_external_lease: "validation:provider-external-lease",
  render_provider_production_handoff: "validation:provider-production-handoff",
  render_provider_live_action_evidence: "validation:provider-live-action-draft",
  render_provider_live_actions: "validation:provider-live-actions",
  render_provider_graph_resume_enqueue_evidence: "validation:provider-graph-resume-draft",
  render_provider_graph_resume_enqueues: "validation:provider-graph-resume",
  atlas_billing_readiness: "validation:atlas-billing",
  commercial_launch_intake_packet: "validation:launch-intake",
  commercial_launch_doctor: "validation:launch-doctor",
  business_completion_audit: "validation:completion-audit",
  billing_admin_attestation_packet: "validation:billing-admin-ops",
  production_operations_attestation_packet: "validation:production-ops",
  ops_config_validation: "validation:ops-config",
  long_form_validation: "validation:long-form",
  long_form_manual_quality_review: "validation:long-form-review-draft",
  long_form_manual_quality_review_draft: "validation:long-form-review-draft",
  long_form_manual_quality_review_readiness: "validation:long-form-review-readiness",
  source_video_validation: "validation:source-video-auto-analysis",
  remote_stock_validation: "validation:remote-stock",
  generated_audio_validation: "validation:generated-audio",
  generated_audio_manual_review: "validation:generated-audio-review-draft",
  short_review_operation_evidence: "validation:short-review-operation-draft",
  short_review_operation_validation: "validation:short-review-operation",
  short_product_rights_evidence: "validation:short-product-rights-draft",
  short_product_rights_validation: "validation:short-product-rights",
  operator_launch_ui_contract_smoke: "validation:operator-launch-ui-contract",
  director_style_semantic_review: "validation:quality-review-drafts",
  director_style_audio_review: "validation:quality-review-drafts",
  director_style_runtime_review: "validation:quality-review-drafts",
  director_style_governance_review: "validation:quality-review-drafts",
  director_style_review_evidence_readiness: "validation:quality-review-evidence",
  billing_admin_ops: "validation:billing-admin-ops",
  production_operations: "validation:production-ops"
};

const externalEvidencePhaseDefinitions = [
  {
    phase: 1,
    label: "Budget and operator authority",
    purpose: "Confirm spend caps, client policy, billing owner, production owner, and operational procedures before live or paid validation.",
    evidenceKinds: ["billing_and_budget_approval", "operator_attestation_or_ops_config"]
  },
  {
    phase: 2,
    label: "Commercial launch scope",
    purpose: "Record the commercial offer scope, launch intake, launch doctor result, and business completion evidence.",
    evidenceKinds: ["commercial_launch_evidence"]
  },
  {
    phase: 3,
    label: "Short rights and operator review",
    purpose: "Prove short-product rights, user-supplied asset authority, and accepted short review operation before customer delivery.",
    evidenceKinds: ["short_product_rights_evidence", "short_review_operation_evidence"]
  },
  {
    phase: 4,
    label: "Provider handoff and resume",
    purpose: "Prove live provider handoff, polling, lease, resume, and worker-operation evidence for real render lifecycle recovery.",
    evidenceKinds: ["provider_handoff_or_resume_evidence"]
  },
  {
    phase: 5,
    label: "Paid or live media providers",
    purpose: "Run approved source-video analysis, remote-stock, generated-audio, and long-form paid media validations with provider evidence.",
    evidenceKinds: [
      "paid_source_video_analysis_evidence",
      "live_material_provider_evidence",
      "paid_generated_audio_evidence",
      "paid_long_form_media_evidence"
    ]
  },
  {
    phase: 6,
    label: "Manual quality review",
    purpose: "Attach human review evidence for generated audio, long-form media, director-style semantic/audio/runtime/governance quality, and review readiness.",
    evidenceKinds: ["manual_quality_review_evidence"]
  },
  {
    phase: 7,
    label: "Live deployment capture",
    purpose: "Capture a real HTTPS deployment preflight after the operational evidence and release scope are in place.",
    evidenceKinds: ["live_deployment_capture"]
  },
  {
    phase: 8,
    label: "Other external evidence",
    purpose: "Catch any future external blocker that is not yet mapped to a more specific commercial-readiness phase.",
    evidenceKinds: ["operator_external_evidence"]
  }
];

function report(id, area, gateKind, path, expectedStatus, options = {}) {
  return {
    id,
    area,
    gateKind,
    path,
    expectedStatus,
    externalEvidence: options.externalEvidence === true
  };
}

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--source-root") {
      options.sourceRoot = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--script-root") {
      options.scriptRoot = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function printHelp() {
  console.log(`Audit CineJelly backend system readiness from local evidence only.

Usage:
  npm.cmd run validation:backend-system-readiness

Options:
  --output <path>       JSON report path. Default: ${defaults.outputPath}
  --source-root <path>  Source root for import graph audit. Default: ${defaults.sourceRoot}
  --script-root <path>  Validation/ops scripts root. Default: ${defaults.scriptRoot}
  --no-output           Print only; do not write the report.

This command performs no network calls, provider calls, render work, or paid validation.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }

  const reportEvidence = reportCatalog.map(evaluateReport);
  const sourceConnectivity = buildSourceConnectivityAudit(options.sourceRoot, options.scriptRoot);
  const validationCommandCoverage = buildValidationCommandCoverage();
  const reportContractCoverage = buildReportContractCoverage();
  const areaSummaries = summarizeAreas(reportEvidence);
  const blockerSummary = summarizeBlockers(reportEvidence, sourceConnectivity, validationCommandCoverage, reportContractCoverage);
  const externalEvidenceActionMatrix = buildExternalEvidenceActionMatrix(blockerSummary, reportEvidence);
  const externalEvidencePhasePlan = buildExternalEvidencePhasePlan(externalEvidenceActionMatrix);
  const status = statusFor({ reportEvidence, sourceConnectivity, validationCommandCoverage, reportContractCoverage });
  const output = {
    schemaVersion: "cinejelly.backend-system-readiness-audit.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      sourceRoot: toRepoRelative(options.sourceRoot),
      scriptRoot: toRepoRelative(options.scriptRoot),
      reportCount: reportEvidence.length,
      reportContractCount: reportContractCoverage.contractCount,
      criticalModuleCount: criticalModulePaths.length,
      auditedValidationCommandCount: auditedValidationCommandNames.length
    },
    sourceConnectivity,
    validationCommandCoverage,
    reportContractCoverage,
    reportEvidence,
    areaSummaries,
    blockerSummary,
    externalEvidenceActionMatrix,
    externalEvidencePhasePlan,
    releaseGateSummary: buildReleaseGateSummary(status, blockerSummary, sourceConnectivity, validationCommandCoverage, reportContractCoverage),
    nextActions: buildNextActions(blockerSummary, sourceConnectivity, validationCommandCoverage, reportContractCoverage)
  };

  if (options.writeReport) {
    writeJson(options.outputPath, output);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return status === "fail" ? 1 : 0;
}

function evaluateReport(item) {
  const read = readJsonIfExists(item.path);
  if (!read) {
    return {
      ...item,
      present: false,
      rawStatus: "missing",
      status: item.externalEvidence ? "external_missing" : "missing_report",
      issue: `Missing report ${item.path}.`
    };
  }

  const rawStatus = String(read.status ?? read.reportStatus ?? "unknown");
  const releaseBlocker = String(read.releaseGateSummary?.releaseBlocker ?? "");
  const nextActions = Array.isArray(read.nextActions) ? read.nextActions.map(String) : [];
  const issueText = [rawStatus, releaseBlocker, ...nextActions].join(" ").toLowerCase();
  const matchesExpected = rawStatus === item.expectedStatus || (Array.isArray(item.expectedStatus) && item.expectedStatus.includes(rawStatus));
  let status = "pass";
  let issue;
  if (matchesExpected) {
    status = "pass";
  } else if (item.externalEvidence || isExternalEvidenceIssue(rawStatus, issueText)) {
    status = "external_blocked";
    issue = releaseBlocker || `Report status is ${rawStatus}; expected ${item.expectedStatus}.`;
  } else if (rawStatus === "warn" || rawStatus === "review_warnings") {
    status = "warning";
    issue = releaseBlocker || `Report status is ${rawStatus}.`;
  } else {
    status = "code_or_contract_issue";
    issue = releaseBlocker || `Report status is ${rawStatus}; expected ${item.expectedStatus}.`;
  }

  return {
    ...item,
    present: true,
    schemaVersion: typeof read.schemaVersion === "string" ? read.schemaVersion : undefined,
    rawStatus,
    status,
    noSpend: read.noSpend === true,
    networkCallsMade: read.networkCallsMade === true,
    providerCallsMade: read.providerCallsMade === true,
    checkCount: Array.isArray(read.checks) ? read.checks.length : undefined,
    issue,
    releaseBlocker: releaseBlocker || undefined,
    nextActionCount: nextActions.length
  };
}

function isExternalEvidenceIssue(rawStatus, issueText) {
  if (rawStatus.startsWith("blocked_by")) {
    return true;
  }
  return /manual|attestation|operator|base url|deployment|budget|spend|paid|provider|live|approval|review|billing|production|external|input/.test(issueText);
}

function buildSourceConnectivityAudit(sourceRoot, scriptRoot) {
  const absoluteSourceRoot = resolve(repoRoot, sourceRoot);
  const absoluteScriptRoot = resolve(repoRoot, scriptRoot);
  const sourceFiles = listFiles(absoluteSourceRoot, ".ts").map(toRepoRelative).sort();
  const scriptFiles = listFiles(absoluteScriptRoot, ".mjs").map(toRepoRelative).sort();
  const graph = new Map(sourceFiles.map((file) => [file, []]));
  const unresolvedImports = [];
  for (const file of sourceFiles) {
    const imports = parseRelativeImports(readText(file));
    const resolved = [];
    for (const specifier of imports) {
      const target = resolveRelativeImport(file, specifier, sourceFiles);
      if (target) {
        resolved.push(target);
      } else {
        unresolvedImports.push({ file, specifier });
      }
    }
    graph.set(file, [...new Set(resolved)].sort());
  }

  const entrypoints = sourceFiles.filter((file) =>
    file === "src/index.ts" ||
    file === "src/api/server.ts" ||
    /^src\/application\/.+entrypoint\.ts$/.test(file)
  );
  const scriptReferencedSourceFiles = scriptFiles
    .flatMap((file) => parseRelativeImports(readText(file))
      .map((specifier) => resolveScriptImportToSource(file, specifier, sourceFiles))
      .filter(Boolean))
    .filter((file, index, files) => files.indexOf(file) === index)
    .sort();
  const effectiveRoots = [...new Set([...entrypoints, ...scriptReferencedSourceFiles])].sort();
  const reachable = walkReachable(effectiveRoots, graph);
  const criticalModules = criticalModulePaths.map((file) => ({
    path: file,
    present: sourceFiles.includes(file),
    reachableFromBackendEntrypoint: reachable.has(file),
    directImportCount: inboundCount(file, graph)
  }));
  const disconnectedCriticalModules = criticalModules
    .filter((item) => item.present && !item.reachableFromBackendEntrypoint)
    .map((item) => item.path);
  const missingCriticalModules = criticalModules
    .filter((item) => !item.present)
    .map((item) => item.path);
  const zeroInboundCriticalModules = criticalModules
    .filter((item) => item.present && item.path !== "src/index.ts" && item.path !== "src/api/server.ts" && item.directImportCount === 0)
    .map((item) => item.path);
  const disconnectedSourceFiles = sourceFiles.filter((file) => !reachable.has(file));
  const status = unresolvedImports.length === 0 &&
    disconnectedSourceFiles.length === 0 &&
    disconnectedCriticalModules.length === 0 &&
    missingCriticalModules.length === 0
    ? "pass"
    : "fail";

  return {
    status,
    connectivityPolicy: "all_source_files_reachable_from_backend_or_validation_roots",
    sourceFileCount: sourceFiles.length,
    scriptFileCount: scriptFiles.length,
    entrypoints,
    scriptReferencedSourceFiles,
    effectiveRootCount: effectiveRoots.length,
    reachableSourceFileCount: reachable.size,
    allSourceFilesReachable: disconnectedSourceFiles.length === 0,
    disconnectedSourceFileCount: disconnectedSourceFiles.length,
    disconnectedSourceFilesSample: disconnectedSourceFiles.slice(0, 30),
    unresolvedRelativeImportCount: unresolvedImports.length,
    unresolvedRelativeImports: unresolvedImports.slice(0, 30),
    criticalModules,
    missingCriticalModules,
    disconnectedCriticalModules,
    zeroInboundCriticalModules
  };
}

function listFiles(root, extension) {
  if (!existsSync(root)) {
    return [];
  }
  const results = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile() && absolutePath.endsWith(extension)) {
        results.push(absolutePath);
      }
    }
  }
  return results;
}

function parseRelativeImports(text) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:[^"'()]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]?.startsWith(".")) {
        specifiers.push(match[1]);
      }
    }
  }
  return specifiers;
}

function resolveRelativeImport(fromFile, specifier, sourceFiles) {
  const fromAbsolute = resolve(repoRoot, fromFile);
  const base = resolve(dirname(fromAbsolute), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${stripJsExtension(base)}.ts`,
    join(base, "index.ts")
  ].map(toRepoRelative);
  return candidates.find((candidate) => sourceFiles.includes(candidate));
}

function resolveScriptImportToSource(fromFile, specifier, sourceFiles) {
  const fromAbsolute = resolve(repoRoot, fromFile);
  const base = resolve(dirname(fromAbsolute), specifier);
  const repoPath = toRepoRelative(base);
  const srcCandidate = distImportToSource(repoPath);
  if (srcCandidate && sourceFiles.includes(srcCandidate)) {
    return srcCandidate;
  }
  return resolveRelativeImport(fromFile, specifier, sourceFiles);
}

function distImportToSource(repoPath) {
  const normalized = repoPath.replace(/\\/g, "/");
  if (!normalized.startsWith("dist/")) {
    return undefined;
  }
  const withoutDist = normalized.slice("dist/".length);
  if (!withoutDist.endsWith(".js")) {
    return undefined;
  }
  return `src/${withoutDist.slice(0, -3)}.ts`;
}

function stripJsExtension(path) {
  return path.endsWith(".js") ? path.slice(0, -3) : path;
}

function walkReachable(entrypoints, graph) {
  const reachable = new Set();
  const stack = [...entrypoints];
  while (stack.length > 0) {
    const file = stack.pop();
    if (!file || reachable.has(file)) {
      continue;
    }
    reachable.add(file);
    for (const child of graph.get(file) ?? []) {
      if (!reachable.has(child)) {
        stack.push(child);
      }
    }
  }
  return reachable;
}

function inboundCount(target, graph) {
  let count = 0;
  for (const children of graph.values()) {
    if (children.includes(target)) {
      count += 1;
    }
  }
  return count;
}

function summarizeAreas(reportEvidence) {
  const areas = [...new Set(reportEvidence.map((item) => item.area))].sort();
  return areas.map((area) => {
    const items = reportEvidence.filter((item) => item.area === area);
    return {
      area,
      reportCount: items.length,
      passCount: items.filter((item) => item.status === "pass").length,
      externalBlockedCount: items.filter((item) => item.status === "external_blocked" || item.status === "external_missing").length,
      missingReportCount: items.filter((item) => item.status === "missing_report").length,
      codeIssueCount: items.filter((item) => item.status === "code_or_contract_issue").length,
      warningCount: items.filter((item) => item.status === "warning").length
    };
  });
}

function buildValidationCommandCoverage() {
  const packageJson = readJsonIfExists("package.json");
  const scripts = packageJson && typeof packageJson === "object" && !Array.isArray(packageJson)
    ? packageJson.scripts
    : undefined;
  const scriptMap = scripts && typeof scripts === "object" && !Array.isArray(scripts)
    ? scripts
    : {};
  const validationCommands = Object.keys(scriptMap)
    .filter((name) => name.startsWith("validation:"))
    .sort();
  const auditedCommands = auditedValidationCommandNames.map((name) => ({
    name,
    present: typeof scriptMap[name] === "string",
    command: typeof scriptMap[name] === "string" ? scriptMap[name] : undefined
  }));
  const missingAuditedCommands = auditedCommands
    .filter((item) => !item.present)
    .map((item) => item.name);
  const extraValidationCommands = validationCommands
    .filter((name) => !auditedValidationCommandNames.includes(name))
    .sort();
  const allValidationCommandsAudited = missingAuditedCommands.length === 0 && extraValidationCommands.length === 0;
  return {
    status: allValidationCommandsAudited ? "pass" : "fail",
    catalogPolicy: "all_package_validation_commands_must_be_audited",
    validationCommandCount: validationCommands.length,
    auditedCommandCount: auditedCommands.length,
    coveredAuditedCommandCount: auditedCommands.filter((item) => item.present).length,
    allValidationCommandsAudited,
    missingAuditedCommandCount: missingAuditedCommands.length,
    missingAuditedCommands,
    extraValidationCommandCount: extraValidationCommands.length,
    extraValidationCommandsSample: extraValidationCommands.slice(0, 40),
    auditedCommands
  };
}

function buildReportContractCoverage() {
  const contractCatalog = parseReportContractsFromValidator();
  const catalogPaths = new Set(reportCatalog.map((item) => normalizeRepoPath(item.path)));
  const catalogIds = new Set(reportCatalog.map((item) => item.id));
  const contractPaths = new Set(contractCatalog.map((item) => normalizeRepoPath(item.path)));
  const uncatalogedContracts = contractCatalog
    .filter((item) => !catalogPaths.has(normalizeRepoPath(item.path)) || !catalogIds.has(item.name))
    .map((item) => ({
      name: item.name,
      path: item.path
    }));
  const catalogedReportsWithoutContract = reportCatalog
    .filter((item) => !contractPaths.has(normalizeRepoPath(item.path)))
    .map((item) => ({
      id: item.id,
      path: item.path
    }));
  const allReportContractsCataloged = uncatalogedContracts.length === 0 && catalogedReportsWithoutContract.length === 0;
  return {
    status: allReportContractsCataloged ? "pass" : "fail",
    catalogPolicy: "all_report_contracts_must_be_classified_in_readiness_catalog",
    contractCount: contractCatalog.length,
    readinessReportCount: reportCatalog.length,
    allReportContractsCataloged,
    catalogedContractCount: contractCatalog.length - uncatalogedContracts.length,
    uncatalogedContractCount: uncatalogedContracts.length,
    uncatalogedContractsSample: uncatalogedContracts.slice(0, 40),
    catalogedReportsWithoutContractCount: catalogedReportsWithoutContract.length,
    catalogedReportsWithoutContractSample: catalogedReportsWithoutContract.slice(0, 40)
  };
}

function parseReportContractsFromValidator() {
  const text = readText("scripts/validate-report-contracts.mjs");
  const contracts = [];
  const contractPattern = /contract\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g;
  for (const match of text.matchAll(contractPattern)) {
    contracts.push({
      name: match[1],
      schemaPath: match[2],
      path: match[3]
    });
  }
  return contracts;
}

function summarizeBlockers(reportEvidence, sourceConnectivity, validationCommandCoverage, reportContractCoverage) {
  const codeIssues = reportEvidence.filter((item) => item.status === "code_or_contract_issue" || item.status === "missing_report");
  const externalEvidence = reportEvidence.filter((item) => item.status === "external_blocked" || item.status === "external_missing");
  const warnings = reportEvidence.filter((item) => item.status === "warning");
  const sourceConnectivityIssueCount = sourceConnectivity.status === "fail" ? 1 : 0;
  const validationCommandIssueCount = validationCommandCoverage.status === "fail" ? 1 : 0;
  const reportContractCoverageIssueCount = reportContractCoverage.status === "fail" ? 1 : 0;
  return {
    codeIssueCount: codeIssues.length + sourceConnectivityIssueCount + validationCommandIssueCount + reportContractCoverageIssueCount,
    externalEvidenceBlockerCount: externalEvidence.length,
    warningCount: warnings.length,
    codeIssues: [
      ...codeIssues.map((item) => blockerFor(item, "backend")),
      ...(sourceConnectivityIssueCount > 0
        ? [{
            id: "source_connectivity",
            area: "source",
            owner: "backend",
            status: "code_or_contract_issue",
            rawStatus: sourceConnectivity.status,
            reportPath: "src",
            issue: "One or more backend source files are missing, disconnected from backend/validation roots, or have unresolved relative imports."
          }]
        : []),
      ...(validationCommandIssueCount > 0
        ? [{
            id: "validation_command_coverage",
            area: "contracts",
            owner: "backend",
            status: "code_or_contract_issue",
            rawStatus: validationCommandCoverage.status,
            reportPath: "package.json",
            issue: validationCommandCoverageIssue(validationCommandCoverage)
          }]
        : []),
      ...(reportContractCoverageIssueCount > 0
        ? [{
            id: "report_contract_coverage",
            area: "contracts",
            owner: "backend",
            status: "code_or_contract_issue",
            rawStatus: reportContractCoverage.status,
            reportPath: "scripts/validate-report-contracts.mjs",
            issue: reportContractCoverageIssue(reportContractCoverage)
          }]
        : [])
    ],
    externalEvidenceBlockers: externalEvidence.map((item) => blockerFor(item, "operator_or_external")),
    warnings: warnings.map((item) => blockerFor(item, "backend_review"))
  };
}

function buildExternalEvidenceActionMatrix(blockerSummary, reportEvidence) {
  const packageJson = readJsonIfExists("package.json");
  const scriptMap = packageJson && typeof packageJson === "object" && !Array.isArray(packageJson) &&
    packageJson.scripts && typeof packageJson.scripts === "object" && !Array.isArray(packageJson.scripts)
    ? packageJson.scripts
    : {};
  const evidenceById = new Map(reportEvidence.map((item) => [item.id, item]));
  const actions = blockerSummary.externalEvidenceBlockers
    .map((blocker) => {
      const evidence = evidenceById.get(blocker.id);
      const validationCommand = externalEvidenceCommandByReportId[blocker.id] ?? validationCommandForExternalEvidence(evidence ?? blocker);
      const validationCommandScript = typeof scriptMap[validationCommand] === "string" ? scriptMap[validationCommand] : undefined;
      const requiredEvidenceKind = requiredEvidenceKindForExternalBlocker(evidence ?? blocker, blocker.issue);
      return {
        id: blocker.id,
        area: blocker.area,
        gateKind: evidence?.gateKind ?? "operator_evidence",
        status: blocker.status,
        rawStatus: blocker.rawStatus,
        reportPath: blocker.reportPath,
        issue: blocker.issue,
        requiredEvidenceKind,
        validationCommand,
        validationCommandPresent: typeof validationCommandScript === "string",
        validationCommandScript,
        requiresOperatorInput: requiresOperatorInput(evidence ?? blocker, requiredEvidenceKind, blocker.issue),
        requiresPaidProviderOrNetwork: requiresPaidProviderOrNetwork(evidence ?? blocker, requiredEvidenceKind, blocker.issue),
        requiresManualReview: requiresManualReview(evidence ?? blocker, requiredEvidenceKind, blocker.issue),
        recommendedOrder: recommendedExternalEvidenceOrder(requiredEvidenceKind, blocker.area)
      };
    })
    .sort((left, right) =>
      left.recommendedOrder - right.recommendedOrder ||
      left.area.localeCompare(right.area) ||
      left.id.localeCompare(right.id)
    );
  const evidenceKindCounts = summarizeCounts(actions, "requiredEvidenceKind")
    .map(([kind, count]) => ({ kind, count }));
  const areaActionSummaries = [...new Set(actions.map((item) => item.area))]
    .sort()
    .map((area) => {
      const areaActions = actions.filter((item) => item.area === area);
      return {
        area,
        blockerCount: areaActions.length,
        validationCommandCount: new Set(areaActions.map((item) => item.validationCommand)).size,
        missingReportCount: areaActions.filter((item) => item.status === "external_missing").length,
        paidOrNetworkRequiredCount: areaActions.filter((item) => item.requiresPaidProviderOrNetwork).length,
        operatorInputRequiredCount: areaActions.filter((item) => item.requiresOperatorInput).length,
        manualReviewRequiredCount: areaActions.filter((item) => item.requiresManualReview).length
      };
    });
  return {
    status: actions.length === 0 ? "pass" : "blocked",
    matrixPolicy: "external_blockers_must_have_actionable_validation_command_and_evidence_kind",
    blockerCount: actions.length,
    actionCount: actions.length,
    areaCount: areaActionSummaries.length,
    evidenceKindCounts,
    areaActionSummaries,
    actions
  };
}

function buildExternalEvidencePhasePlan(externalEvidenceActionMatrix) {
  const actions = Array.isArray(externalEvidenceActionMatrix.actions)
    ? externalEvidenceActionMatrix.actions
    : [];
  const phases = externalEvidencePhaseDefinitions
    .map((definition) => {
      const phaseActions = actions
        .filter((action) => definition.evidenceKinds.includes(action.requiredEvidenceKind))
        .sort((left, right) =>
          left.recommendedOrder - right.recommendedOrder ||
          left.area.localeCompare(right.area) ||
          left.id.localeCompare(right.id)
        );
      return {
        phase: definition.phase,
        label: definition.label,
        purpose: definition.purpose,
        status: phaseActions.length === 0 ? "pass" : "blocked",
        requiredEvidenceKinds: definition.evidenceKinds,
        blockerCount: phaseActions.length,
        actionIds: phaseActions.map((item) => item.id),
        validationCommands: uniqueSortedStrings(phaseActions.map((item) => item.validationCommand)),
        reportPaths: uniqueSortedStrings(phaseActions.map((item) => item.reportPath)),
        requiresOperatorInput: phaseActions.some((item) => item.requiresOperatorInput),
        requiresPaidProviderOrNetwork: phaseActions.some((item) => item.requiresPaidProviderOrNetwork),
        requiresManualReview: phaseActions.some((item) => item.requiresManualReview),
        readyWhen: phaseActions.length === 0
          ? "No external evidence blockers remain for this phase."
          : "All listed validation commands complete with accepted operator evidence and the listed reports reach their expected commercial-readiness status."
      };
    })
    .filter((phase) => phase.blockerCount > 0 || phase.status === "blocked");
  return {
    status: phases.some((phase) => phase.status === "blocked") ? "blocked" : "pass",
    phasePolicy: "external_evidence_is_grouped_by_operator_execution_order",
    phaseCount: phases.length,
    blockerCount: phases.reduce((sum, phase) => sum + phase.blockerCount, 0),
    phases
  };
}

function validationCommandForExternalEvidence(item) {
  switch (item.area) {
    case "audio":
      return item.id?.includes("review") ? "validation:generated-audio-review-readiness" : "validation:generated-audio";
    case "deployment":
      return "validation:deployment-readiness";
    case "long":
      return item.id?.includes("review") ? "validation:long-form-review-readiness" : "validation:long-form";
    case "materials":
      return "validation:remote-stock";
    case "ops":
      return item.id?.includes("billing") ? "validation:billing-admin-ops" : "validation:production-ops";
    case "production_graph":
      return item.id?.includes("draft") ? "validation:provider-graph-resume-draft" : "validation:provider-graph-resume";
    case "provider":
      return item.id?.includes("live") ? "validation:provider-live-actions" : "validation:provider-production-handoff";
    case "quality":
      return item.id?.includes("readiness") ? "validation:quality-review-evidence" : "validation:quality-review-drafts";
    case "release":
      return item.id?.includes("intake") ? "validation:launch-intake" : "validation:launch-doctor";
    case "short":
      return item.id?.includes("rights") ? "validation:short-product-rights" : "validation:short-review-operation";
    case "source_video":
      return "validation:source-video-auto-analysis";
    default:
      return "validation:backend-system-readiness";
  }
}

function requiredEvidenceKindForExternalBlocker(item, issueText) {
  const id = String(item.id ?? "").toLowerCase();
  const area = String(item.area ?? "").toLowerCase();
  const gateKind = String(item.gateKind ?? "").toLowerCase();
  const text = `${id} ${area} ${gateKind} ${issueText ?? ""}`.toLowerCase();
  if (area === "deployment") return "live_deployment_capture";
  if (area === "production_graph") return "provider_handoff_or_resume_evidence";
  if (area === "provider") return "provider_handoff_or_resume_evidence";
  if (area === "quality") return "manual_quality_review_evidence";
  if (area === "source_video") return "paid_source_video_analysis_evidence";
  if (area === "materials") return "live_material_provider_evidence";
  if (id.includes("commercial_launch") || id.includes("business_completion")) return "commercial_launch_evidence";
  if (id.includes("short_product_rights")) return "short_product_rights_evidence";
  if (id.includes("short_review_operation")) return "short_review_operation_evidence";
  if (area === "audio") return id.includes("review") ? "manual_quality_review_evidence" : "paid_generated_audio_evidence";
  if (area === "long") return id.includes("review") ? "manual_quality_review_evidence" : "paid_long_form_media_evidence";
  if (area === "ops") {
    return /billing|budget|quota|spend/.test(text)
      ? "billing_and_budget_approval"
      : "operator_attestation_or_ops_config";
  }
  if (/deployment|base url|https/.test(text)) return "live_deployment_capture";
  if (/billing|quota|budget|spend/.test(text)) return "billing_and_budget_approval";
  if (/paid|provider|atlas|render/.test(text) && /audio/.test(text)) return "paid_generated_audio_evidence";
  if (/paid|provider|atlas|render/.test(text) && /long/.test(text)) return "paid_long_form_media_evidence";
  if (/source.video|source_video|video auto-analysis/.test(text)) return "paid_source_video_analysis_evidence";
  if (/remote.stock|remote_stock|stock provider|network/.test(text)) return "live_material_provider_evidence";
  if (/rights|product/.test(text)) return "short_product_rights_evidence";
  if (/short.*review|review operation/.test(text)) return "short_review_operation_evidence";
  if (/semantic|runtime|governance|manual|review/.test(text)) return "manual_quality_review_evidence";
  if (/attestation|ops config|production storage|observability|support/.test(text)) return "operator_attestation_or_ops_config";
  if (/live action|handoff|resume|lease|prediction|polling/.test(text)) return "provider_handoff_or_resume_evidence";
  if (/commercial|launch|intake|customer traffic|completion/.test(text)) return "commercial_launch_evidence";
  return "operator_external_evidence";
}

function requiresOperatorInput(item, evidenceKind, issueText) {
  const text = `${item.gateKind ?? ""} ${evidenceKind} ${issueText ?? ""}`.toLowerCase();
  return /operator|attestation|manual|review|rights|intake|approval|input|ops|deployment|commercial|quality/.test(text);
}

function requiresPaidProviderOrNetwork(item, evidenceKind, issueText) {
  const text = `${item.gateKind ?? ""} ${evidenceKind} ${issueText ?? ""}`.toLowerCase();
  return /paid|provider|network|atlas|render|billing|spend|remote|stock|source.video|source_video|live/.test(text);
}

function requiresManualReview(item, evidenceKind, issueText) {
  const text = `${item.id ?? ""} ${item.gateKind ?? ""} ${evidenceKind} ${issueText ?? ""}`.toLowerCase();
  return /manual|semantic|audio.review|runtime|governance|quality|review/.test(text);
}

function recommendedExternalEvidenceOrder(evidenceKind, area) {
  const orderByKind = {
    billing_and_budget_approval: 10,
    operator_attestation_or_ops_config: 20,
    commercial_launch_evidence: 30,
    short_product_rights_evidence: 40,
    short_review_operation_evidence: 45,
    provider_handoff_or_resume_evidence: 50,
    paid_source_video_analysis_evidence: 60,
    live_material_provider_evidence: 65,
    paid_generated_audio_evidence: 70,
    paid_long_form_media_evidence: 80,
    manual_quality_review_evidence: 90,
    live_deployment_capture: 100,
    operator_external_evidence: 110
  };
  const areaBias = {
    ops: 0,
    release: 1,
    short: 2,
    provider: 3,
    production_graph: 4,
    source_video: 5,
    materials: 6,
    audio: 7,
    long: 8,
    quality: 9,
    deployment: 10
  };
  return (orderByKind[evidenceKind] ?? 110) + ((areaBias[area] ?? 20) / 100);
}

function summarizeCounts(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item[key];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)));
}

function uniqueSortedStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))].sort();
}

function blockerFor(item, owner) {
  return {
    id: item.id,
    area: item.area,
    owner,
    status: item.status,
    rawStatus: item.rawStatus,
    reportPath: item.path,
    issue: item.issue || item.releaseBlocker || `Report ${item.id} is not in the expected status.`
  };
}

function statusFor({ reportEvidence, sourceConnectivity, validationCommandCoverage, reportContractCoverage }) {
  if (sourceConnectivity.status === "fail") {
    return "fail";
  }
  if (validationCommandCoverage.status === "fail") {
    return "fail";
  }
  if (reportContractCoverage.status === "fail") {
    return "fail";
  }
  if (reportEvidence.some((item) => item.status === "code_or_contract_issue" || item.status === "missing_report")) {
    return "fail";
  }
  if (reportEvidence.some((item) => item.status === "external_blocked" || item.status === "external_missing")) {
    return "blocked_by_external_evidence";
  }
  if (reportEvidence.some((item) => item.status === "warning")) {
    return "warning";
  }
  return "pass";
}

function buildReleaseGateSummary(status, blockerSummary, sourceConnectivity, validationCommandCoverage, reportContractCoverage) {
  return {
    backendCodeEvidencePass: blockerSummary.codeIssueCount === 0 &&
      sourceConnectivity.status === "pass" &&
      validationCommandCoverage.status === "pass" &&
      reportContractCoverage.status === "pass",
    externalEvidenceComplete: blockerSummary.externalEvidenceBlockerCount === 0,
    canClaimBackendNoSpendPlanningReady: blockerSummary.codeIssueCount === 0,
    canClaimCommercialTrafficReady: status === "pass",
    releaseBlocker: status === "pass"
      ? "Backend system evidence has no local code or external-evidence blockers in the audited report set."
      : status === "blocked_by_external_evidence"
        ? "Backend code/contract evidence passes, but live paid/provider/operator evidence remains incomplete."
        : "Backend source connectivity or local report evidence has code/contract issues."
  };
}

function buildNextActions(blockerSummary, sourceConnectivity, validationCommandCoverage, reportContractCoverage) {
  const actions = [];
  if (sourceConnectivity.status === "fail") {
    actions.push("Fix missing or disconnected backend source files and unresolved relative imports, then rerun validation:backend-system-readiness.");
  }
  if (validationCommandCoverage.status === "fail") {
    actions.push("Restore missing package.json validation commands or catalog newly added validation commands before trusting backend release evidence.");
  }
  if (reportContractCoverage.status === "fail") {
    actions.push("Classify every report contract in backend readiness before trusting release evidence.");
  }
  for (const blocker of blockerSummary.codeIssues.slice(0, 8)) {
    actions.push(`${blocker.id}: ${blocker.issue}`);
  }
  if (blockerSummary.externalEvidenceBlockerCount > 0) {
    actions.push("Complete operator attestation, budget approval, paid provider validation, manual audio/media review, and live deployment evidence before claiming commercial readiness.");
  }
  if (actions.length === 0) {
    actions.push("Keep validation:backend-system-readiness in the final release gate after build, smoke, and report-contract validation.");
  }
  return actions;
}

function validationCommandCoverageIssue(validationCommandCoverage) {
  const parts = [];
  if (validationCommandCoverage.missingAuditedCommands.length > 0) {
    parts.push(`Missing audited validation command(s): ${validationCommandCoverage.missingAuditedCommands.join(", ")}.`);
  }
  if (validationCommandCoverage.extraValidationCommandCount > 0) {
    parts.push(`Unaudited package.json validation command(s): ${validationCommandCoverage.extraValidationCommandsSample.join(", ")}.`);
  }
  return parts.join(" ") || "Validation command coverage is incomplete.";
}

function reportContractCoverageIssue(reportContractCoverage) {
  const parts = [];
  if (reportContractCoverage.uncatalogedContractCount > 0) {
    parts.push(`Uncataloged report contract(s): ${reportContractCoverage.uncatalogedContractsSample.map((item) => item.name).join(", ")}.`);
  }
  if (reportContractCoverage.catalogedReportsWithoutContractCount > 0) {
    parts.push(`Readiness report(s) without local schema contract: ${reportContractCoverage.catalogedReportsWithoutContractSample.map((item) => item.id).join(", ")}.`);
  }
  return parts.join(" ") || "Report contract coverage is incomplete.";
}

function readJsonIfExists(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function readText(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function writeJson(outputPath, value) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  return relative(repoRoot, resolve(repoRoot, path)).split(sep).join("/");
}

function normalizeRepoPath(path) {
  return path.replace(/\\/g, "/");
}

process.exitCode = main();
