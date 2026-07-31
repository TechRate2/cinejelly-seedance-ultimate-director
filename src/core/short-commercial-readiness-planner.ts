/**
 * Short commercial readiness gate.
 * This layer keeps the short agent adaptive without hardcoding templates: it
 * scores evidence, learning, crawl policy, reference originality, review, and
 * render handoff readiness before any provider spend.
 */

import type { ShortCommercialReadinessPlan, ShortCommercialReadinessCheck, ShortCommercialReadinessStatus } from "../types/short-commercial-readiness.js";
import type { ShortPipelinePlan, ShortPipelinePlanInput, ProductUrlEvidenceStatus } from "../types/short-pipeline.js";
import type { ShortReferenceVideoLearningInput } from "../types/short-viral-intelligence.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  SHORT_COMMERCIAL_READINESS_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_COMMERCIAL_READINESS_SOURCE_PATTERN_IDS);

const CRAWLER_DEFAULT_MAX_BYTES = 512_000;
const CRAWLER_DEFAULT_TIMEOUT_MS = 10_000;

export interface ShortCommercialReadinessPlannerInput {
  readonly plan: ShortPipelinePlanDraft;
  readonly originalInput?: Pick<ShortPipelinePlanInput, "product" | "channelStyle" | "mediaReferences" | "referenceVideoLearning">;
}

type ShortPipelinePlanDraft = Omit<ShortPipelinePlan, "commercialReadiness"> & Partial<Pick<ShortPipelinePlan, "commercialReadiness">>;

export class ShortCommercialReadinessPlanner {
  public build(input: ShortCommercialReadinessPlannerInput): ShortCommercialReadinessPlan {
    const plan = input.plan;
    const crawlerPolicy = crawlerPolicyFor(plan);
    const referenceAnalysis = referenceAnalysisFor(plan, input.originalInput?.referenceVideoLearning);
    const outcomeMemory = outcomeMemoryFor(plan);
    const checks = [
      productEvidenceCheck(plan),
      brandPolicyCheck(plan),
      viralStrategyCheck(plan),
      agentGraphCheck(plan),
      humanReviewCheck(plan),
      referenceOriginalityCheck(plan, referenceAnalysis.status),
      mediaReferenceCheck(plan, input.originalInput?.mediaReferences?.length ?? 0),
      channelStyleMemoryCheck(plan),
      outcomeMemoryCheck(outcomeMemory.status, plan),
      crawlerPolicyCheck(crawlerPolicy.status, plan),
      renderHandoffCheck(plan)
    ];
    const summary = checkSummary(checks);
    const status: ShortCommercialReadinessStatus = summary.blocked > 0
      ? "blocked"
      : summary.reviewRequired > 0
        ? "review_required"
        : "ready";
    const qualityScore = roundScore(checks.reduce((sum, check) => sum + check.score, 0) / Math.max(1, checks.length));
    const readinessId = createStableId(
      "short_readiness",
      [
        plan.projectId,
        plan.requestId ?? "",
        plan.planId,
        plan.viralIntelligence.intelligenceId,
        plan.agentGraph?.graphRunId ?? "no_agent_graph",
        qualityScore
      ].join(":")
    );
    const canRenderAfterFormalApproval = status !== "blocked" && plan.status !== "blocked";

    return {
      schemaVersion: "cinejelly.short-commercial-readiness.v1",
      readinessId,
      projectId: plan.projectId,
      ...(plan.requestId ? { requestId: plan.requestId } : {}),
      generatedAt: plan.generatedAt,
      status,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      qualityScore,
      checkSummary: summary,
      checks,
      crawlerPolicy,
      referenceAnalysis,
      outcomeMemory,
      releaseGateSummary: {
        canUseAsNoSpendReadinessEvidence: status !== "blocked",
        canRenderAfterFormalApproval,
        canRenderNow: false,
        canReleaseToCustomerTraffic: false,
        releaseBlocker: releaseBlockerFor(status, canRenderAfterFormalApproval)
      },
      nextActions: nextActionsFor(status, checks, crawlerPolicy.status, referenceAnalysis.status, outcomeMemory.status)
    };
  }
}

function mediaReferenceCheck(plan: ShortPipelinePlanDraft, inputReferenceCount: number): ShortCommercialReadinessCheck {
  const references = plan.mediaReferencePlan ?? [];
  const blockedCount = references.filter((reference) => reference.status === "blocked").length;
  const reviewCount = references.filter((reference) => reference.status === "review_required").length;
  const readyCount = references.filter((reference) => reference.status === "ready").length;
  const providerHandoffCount = references.filter((reference) => reference.includeInProviderHandoff).length;
  const identityCount = references.filter((reference) => reference.promptRole === "identity").length;
  const productCount = references.filter((reference) => reference.promptRole === "product").length;
  const hasSourceVideo = references.some((reference) => reference.promptRole === "source_video_structure");
  if (blockedCount > 0) {
    return check(
      "media_references",
      "blocked",
      0.22,
      "One or more Short media references are unsafe, private, or credential-like.",
      "Replace local/private/credential media references with approved asset:// IDs or clean HTTPS references before render.",
      {
        inputReferenceCount,
        referenceCount: references.length,
        blockedCount,
        reviewCount,
        readyCount,
        providerHandoffCount
      }
    );
  }
  if (references.length === 0) {
    return check(
      "media_references",
      "review_required",
      0.66,
      "Short can generate from text, but KOL/product/background references are not attached.",
      "Attach approved KOL, product, first-frame, background, or source-video assets when identity/product fidelity matters.",
      {
        inputReferenceCount,
        referenceCount: 0,
        blockedCount: 0,
        reviewCount: 0,
        readyCount: 0,
        providerHandoffCount: 0
      }
    );
  }
  const reviewRequired = reviewCount > 0 || providerHandoffCount < readyCount || hasSourceVideo;
  return check(
    "media_references",
    reviewRequired ? "review_required" : "ready",
    reviewRequired ? 0.74 : 0.9,
    reviewRequired
      ? "Media references are understood, but rights, source-video, or provider-asset handoff still needs review."
      : "Approved media references are ready for role-scoped Seedance prompt binding.",
    reviewRequired
      ? "Approve rights and register clean HTTPS references as asset:// IDs before render handoff when persistence is required."
      : "Keep reference roles, tags, and transfer scopes bound to every provider shot.",
    {
      inputReferenceCount,
      referenceCount: references.length,
      blockedCount,
      reviewCount,
      readyCount,
      providerHandoffCount,
      identityCount,
      productCount,
      sourceVideoReferencePresent: hasSourceVideo
    }
  );
}

function productEvidenceCheck(plan: ShortPipelinePlanDraft): ShortCommercialReadinessCheck {
  const brief = plan.productBrief;
  if (!brief) {
    return check(
      "product_evidence",
      "review_required",
      0.58,
      "Short can plan from natural language, but commercial UGC/ad quality is lower without product facts and media evidence.",
      "Provide product URL snapshot, title, benefits, claims, approved assets, or a safe URL research result.",
      {
        productBriefPresent: false,
        claimCount: 0,
        imageCount: 0,
        missingFieldCount: 1
      }
    );
  }
  if (brief.status === "blocked") {
    return check(
      "product_evidence",
      "blocked",
      0.2,
      "Product evidence has blocked URL/text issues.",
      "Remove unsafe product URL, local path, credential-like query, or unsafe product text before render.",
      {
        productBriefPresent: true,
        claimCount: brief.claimInventory.length,
        imageCount: brief.images.length,
        missingFieldCount: brief.missingFields.length
      }
    );
  }
  const substantiationCount = brief.claimInventory.filter((claim) => claim.substantiationRequired).length;
  const unapprovedImageCount = brief.images.filter((image) => image.rightsStatus !== "operator_approved").length;
  const reviewRequired = brief.status === "review_required" || substantiationCount > 0 || unapprovedImageCount > 0;
  return check(
    "product_evidence",
    reviewRequired ? "review_required" : "ready",
    reviewRequired ? 0.72 : 0.9,
    reviewRequired
      ? "Product evidence is usable, but claims, missing fields, or image rights still need review."
      : "Product facts are ready for commercial short planning.",
    reviewRequired
      ? "Approve image rights, substantiate/soften claims, and fill missing product fields."
      : "Keep product evidence attached to the render review packet.",
    {
      productBriefPresent: true,
      claimCount: brief.claimInventory.length,
      substantiationRequiredCount: substantiationCount,
      imageCount: brief.images.length,
      unapprovedImageCount,
      missingFieldCount: brief.missingFields.length
    }
  );
}

function brandPolicyCheck(plan: ShortPipelinePlanDraft): ShortCommercialReadinessCheck {
  const brand = plan.brandKitEvaluation;
  if (!brand) {
    return check(
      "brand_policy",
      "review_required",
      0.56,
      "Brand kit is missing, so tone, claim policy, audio language, and visual identity are not anchored.",
      "Attach brand name, tone, claim policy, language/audio preference, and approved brand assets.",
      {
        brandPresent: false,
        issueCount: 0,
        allowedClaimCount: 0,
        forbiddenClaimCount: 0
      }
    );
  }
  if (brand.status === "blocked") {
    return check(
      "brand_policy",
      "blocked",
      0.25,
      "Brand policy blocks at least one claim or unsafe brand asset.",
      "Fix forbidden claims or unsafe brand asset URIs before render.",
      {
        brandPresent: true,
        issueCount: brand.issues.length,
        allowedClaimCount: brand.allowedClaimCount,
        forbiddenClaimCount: brand.forbiddenClaimCount
      }
    );
  }
  return check(
    "brand_policy",
    brand.status === "ready" ? "ready" : "review_required",
    brand.status === "ready" ? 0.9 : 0.7,
    brand.status === "ready"
      ? "Brand kit is ready for short creative constraints."
      : "Brand kit is usable but still needs tone, claim policy, audio language, or asset approval review.",
    brand.status === "ready"
      ? "Keep brand constraints bound to the prompt pack."
      : "Complete missing brand fields before commercial render.",
    {
      brandPresent: true,
      issueCount: brand.issues.length,
      allowedClaimCount: brand.allowedClaimCount,
      forbiddenClaimCount: brand.forbiddenClaimCount,
      approvedAssetCount: brand.approvedAssetCount
    }
  );
}

function viralStrategyCheck(plan: ShortPipelinePlanDraft): ShortCommercialReadinessCheck {
  const viral = plan.viralIntelligence;
  const topScore = viral.conceptScores[0]?.totalScore ?? 0;
  if (viral.status === "blocked") {
    return check(
      "viral_strategy",
      "blocked",
      0.25,
      "Viral strategy is blocked by unsafe reference or commercial-risk evidence.",
      "Correct unsafe source/reference/copy-risk evidence and regenerate the short plan.",
      {
        conceptCount: viral.conceptScores.length,
        topConceptScore: topScore,
        findingCount: viral.findings.length
      }
    );
  }
  const status: ShortCommercialReadinessStatus = viral.status === "ready" && topScore >= 0.78 ? "ready" : "review_required";
  return check(
    "viral_strategy",
    status,
    status === "ready" ? 0.9 : Math.max(0.62, topScore),
    status === "ready"
      ? "Viral strategy has a strong concept, niche, platform focus, and retention levers."
      : "Viral strategy is valid but needs hook, niche, claim, or pacing review before spend.",
    status === "ready"
      ? "Use this strategy as the creative spine for render handoff."
      : "Review findings and strengthen hook, proof, visual rhythm, audio, and no-visible-text policy before render.",
    {
      conceptCount: viral.conceptScores.length,
      topConceptScore: topScore,
      findingCount: viral.findings.length,
      sceneDirectiveCount: viral.sceneDirectives.length
    }
  );
}

function agentGraphCheck(plan: ShortPipelinePlanDraft): ShortCommercialReadinessCheck {
  const graph = plan.agentGraph;
  if (!graph) {
    return check(
      "agent_graph",
      "blocked",
      0.1,
      "Short Agent graph evidence is missing.",
      "Regenerate plan with Short Agent graph planner enabled.",
      {
        graphPresent: false,
        candidateCount: 0,
        critiqueCount: 0,
        promptShotCount: 0
      }
    );
  }
  if (graph.status === "blocked") {
    return check(
      "agent_graph",
      "blocked",
      0.24,
      "Short Agent graph found blocking evidence.",
      "Fix blocked product, claim, brand, reference, or Seedance feasibility evidence.",
      {
        graphPresent: true,
        candidateCount: graph.candidates.length,
        critiqueCount: graph.critiques.length,
        promptShotCount: graph.seedancePromptPack.shotPrompts.length
      }
    );
  }
  const selected = graph.candidates.find((candidate) => candidate.candidateId === graph.selectedCandidateId);
  const selectedScore = selected?.scores.total ?? 0;
  const status: ShortCommercialReadinessStatus = graph.status === "ready" && selectedScore >= 0.78 ? "ready" : "review_required";
  return check(
    "agent_graph",
    status,
    status === "ready" ? 0.92 : Math.max(0.65, selectedScore),
    status === "ready"
      ? "Short Agent graph has enough candidate, critique, repair, and Seedance prompt evidence."
      : "Short Agent graph is usable but still needs review of critiques, repair actions, or winning candidate quality.",
    status === "ready"
      ? "Proceed through formal approval and render cost gates."
      : "Review candidate ranking, critiques, repair actions, and prompt pack before render.",
    {
      graphPresent: true,
      candidateCount: graph.candidates.length,
      critiqueCount: graph.critiques.length,
      repairCount: graph.repairs.length,
      promptShotCount: graph.seedancePromptPack.shotPrompts.length,
      selectedCandidateScore: selectedScore
    }
  );
}

function humanReviewCheck(plan: ShortPipelinePlanDraft): ShortCommercialReadinessCheck {
  const status = plan.reviewApproval.status;
  if (status === "blocked" || status === "rejected") {
    return check(
      "human_review",
      "blocked",
      0.2,
      "Human review gate is blocked or rejected.",
      "Resolve rejected/blocked checkpoints before render handoff.",
      {
        checkpointCount: plan.reviewApproval.summary.checkpointCount,
        approvedRequiredCount: plan.reviewApproval.summary.approvedRequiredCount,
        pendingRequiredCount: plan.reviewApproval.summary.pendingRequiredCount,
        issueCount: plan.reviewApproval.summary.issueCount
      }
    );
  }
  const ready = status === "approved";
  return check(
    "human_review",
    ready ? "ready" : "review_required",
    ready ? 0.95 : 0.68,
    ready
      ? "All required short review checkpoints are approved."
      : "Scene, audio, no-visible-text, and claim checkpoints still need formal approval before render.",
    ready
      ? "Keep approval evidence bound to render-job handoff."
      : "Collect explicit approval for every required checkpoint.",
    {
      checkpointCount: plan.reviewApproval.summary.checkpointCount,
      approvedRequiredCount: plan.reviewApproval.summary.approvedRequiredCount,
      pendingRequiredCount: plan.reviewApproval.summary.pendingRequiredCount,
      issueCount: plan.reviewApproval.summary.issueCount
    }
  );
}

function referenceOriginalityCheck(plan: ShortPipelinePlanDraft, referenceStatus: string): ShortCommercialReadinessCheck {
  const pattern = plan.viralIntelligence.referenceVideoPattern;
  if (!pattern) {
    return check(
      "reference_originality",
      "ready",
      0.78,
      "No reference video pattern is required; plan will generate original shots from product/brand evidence.",
      "Optionally add a rights-cleared reference pattern for style learning.",
      {
        referencePresent: false,
        canUseForStyleTransfer: false,
        referenceStatus
      }
    );
  }
  if (pattern.safetyStatus === "blocked") {
    return check(
      "reference_originality",
      "blocked",
      0.18,
      "Reference-video source is unsafe or cannot be used.",
      "Replace with a clean HTTPS reference, asset record, or operator summary.",
      {
        referencePresent: true,
        canUseForStyleTransfer: false,
        referenceStatus
      }
    );
  }
  const reviewRequired = pattern.safetyStatus !== "learned_pattern";
  return check(
    "reference_originality",
    reviewRequired ? "review_required" : "ready",
    reviewRequired ? 0.68 : 0.88,
    reviewRequired
      ? "Reference pattern is usable only after originality review."
      : "Reference pattern is safe for structure, pacing, camera, visual rhythm, and payoff learning.",
    "Use reference for structure only; never copy script, faces, marks, audio, captions, visible text, or exact edits.",
    {
      referencePresent: true,
      canUseForStyleTransfer: true,
      motifCount: pattern.visualMotifs.length,
      retentionMechanicCount: pattern.retentionMechanics.length,
      referenceStatus
    }
  );
}

function channelStyleMemoryCheck(plan: ShortPipelinePlanDraft): ShortCommercialReadinessCheck {
  const profile = plan.channelStyleProfile;
  if (!profile) {
    return check(
      "channel_style_memory",
      "review_required",
      0.62,
      "No reusable channel style profile is attached, so this short may not preserve a long-term channel identity.",
      "Attach channelStyle with recurring character, voice, setting, visual rhythm, and editing anchors for channel building.",
      {
        channelStylePresent: false,
        anchorCount: 0,
        characterCount: 0,
        voiceCount: 0,
        settingCount: 0
      }
    );
  }
  if (profile.status === "blocked") {
    return check(
      "channel_style_memory",
      "blocked",
      0.2,
      "Channel style profile has blocked reusable asset evidence.",
      "Remove unsafe asset URIs or replace them with approved asset:// IDs or clean HTTPS references.",
      {
        channelStylePresent: true,
        anchorCount: profile.styleAnchors.length,
        characterCount: profile.characterCount,
        voiceCount: profile.voiceCount,
        settingCount: profile.settingCount,
        issueCount: profile.issues.length
      }
    );
  }
  const strong = profile.status === "ready" &&
    profile.styleAnchors.length >= 3 &&
    (profile.characterCount > 0 || profile.voiceCount > 0 || profile.settingCount > 0);
  return check(
    "channel_style_memory",
    strong ? "ready" : "review_required",
    strong ? 0.9 : 0.72,
    strong
      ? "Channel style profile has reusable identity anchors for consistent series/channel output."
      : "Channel style profile is usable but should add stronger character, voice, setting, or asset anchors.",
    strong
      ? "Reuse channel profile anchors in every script/render for this channel."
      : "Add recurring character, voice, setting, style rules, and approved assets to strengthen channel consistency.",
    {
      channelStylePresent: true,
      anchorCount: profile.styleAnchors.length,
      characterCount: profile.characterCount,
      voiceCount: profile.voiceCount,
      settingCount: profile.settingCount,
      approvedAssetCount: profile.approvedAssetCount,
      issueCount: profile.issues.length
    }
  );
}

function outcomeMemoryCheck(status: string, plan: ShortPipelinePlanDraft): ShortCommercialReadinessCheck {
  const memory = plan.agentGraph?.memoryPack;
  const ready = status === "ready_to_write_after_review";
  return check(
    "outcome_memory",
    ready ? "ready" : "review_required",
    ready ? 0.82 : 0.64,
    ready
      ? "Outcome-memory contract is ready to store accepted/rejected creative learning after review."
      : "Memory is planned but persistent outcome storage is not configured yet.",
    ready
      ? "Write outcome memory only after manual review/render result is available."
      : "Configure workspace memory/RAG storage before claiming long-term adaptive learning.",
    {
      retrievedPatternCount: memory?.retrievedPatterns.length ?? 0,
      writeIntentCount: memory?.writeIntents.length ?? 0,
      persistentStoreConfigured: false
    }
  );
}

function crawlerPolicyCheck(status: string, plan: ShortPipelinePlanDraft): ShortCommercialReadinessCheck {
  if (status === "blocked_by_unsafe_url") {
    return check(
      "crawler_policy",
      "blocked",
      0.25,
      "Live product crawl is blocked by unsafe URL evidence.",
      "Use a canonical clean HTTPS product URL or provide a reviewed product snapshot/assets.",
      {
        sourceStatus: plan.productBrief?.source.status ?? "not_provided",
        liveNetworkDefaultDisabled: true,
        safeToSkipWhenBlocked: true
      }
    );
  }
  const reviewRequired = status === "live_crawl_optional" || status === "clean_url_required";
  return check(
    "crawler_policy",
    reviewRequired ? "review_required" : "ready",
    reviewRequired ? 0.72 : 0.88,
    reviewRequired
      ? "Crawler is optional and disabled by default until operator confirmation; blocked pages can be skipped."
      : "Crawler policy is safe: use snapshot/manual assets or already-clean evidence.",
    "Do not bypass CAPTCHA, paywalls, login, robots restrictions, or access controls; fall back to snapshot.",
    {
      sourceStatus: plan.productBrief?.source.status ?? "not_provided",
      liveNetworkDefaultDisabled: true,
      safeToSkipWhenBlocked: true
    }
  );
}

function renderHandoffCheck(plan: ShortPipelinePlanDraft): ShortCommercialReadinessCheck {
  const promptPack = plan.seedancePromptPack;
  const shotCount = promptPack?.shotPrompts.length ?? 0;
  const ready = plan.status !== "blocked" && shotCount === plan.scenes.length && shotCount > 0;
  return check(
    "render_handoff",
    ready ? "ready" : "blocked",
    ready ? 0.9 : 0.3,
    ready
      ? "Short plan has aligned scenes and time-coded Seedance prompt shots for render handoff."
      : "Render handoff is missing prompt-pack or scene alignment evidence.",
    ready
      ? "After formal approval, pass handoff through normal quota/cost/render gates."
      : "Regenerate prompt pack and scene plan before render.",
    {
      sceneCount: plan.scenes.length,
      promptShotCount: shotCount,
      durationSeconds: plan.intent.targetDurationSeconds,
      canUsePlanningEvidence: plan.releaseGateSummary.canUseAsNoSpendPlanningEvidence
    }
  );
}

function crawlerPolicyFor(plan: ShortPipelinePlanDraft): ShortCommercialReadinessPlan["crawlerPolicy"] {
  const sourceStatus = plan.productBrief?.source.status ?? "not_provided";
  const snapshotHasFacts = Boolean(plan.productBrief?.title && plan.productBrief.benefits.length > 0);
  const unsafe = sourceStatus === "invalid_url" ||
    sourceStatus === "blocked_non_https" ||
    sourceStatus === "blocked_localhost" ||
    sourceStatus === "blocked_embedded_credentials";
  const status = unsafe
    ? "blocked_by_unsafe_url"
    : sourceStatus === "unsafe_query_redacted"
      ? "clean_url_required"
      : sourceStatus === "clean_https" && !snapshotHasFacts
        ? "live_crawl_optional"
        : snapshotHasFacts
          ? "snapshot_ready"
          : "not_needed";
  const canAttemptLiveCrawlWithConfirmation = status === "live_crawl_optional";
  return {
    schemaVersion: "cinejelly.short-crawler-policy.v1",
    policyId: createStableId("short_crawl_policy", `${plan.projectId}:${plan.requestId ?? ""}:${sourceStatus}:${status}`),
    status,
    sourceStatus,
    liveNetworkDefault: "disabled_until_operator_confirmation",
    bypassPolicy: "never_bypass_access_controls",
    fallbackPolicy: "use_operator_snapshot_or_uploaded_assets",
    estimatedPlatformCostUsd: 0,
    estimatedProviderCostUsd: 0,
    maxBytes: CRAWLER_DEFAULT_MAX_BYTES,
    timeoutMs: CRAWLER_DEFAULT_TIMEOUT_MS,
    canAttemptLiveCrawlWithConfirmation,
    safeToSkipWhenBlocked: true,
    nextAction: crawlerNextAction(status)
  };
}

function referenceAnalysisFor(
  plan: ShortPipelinePlanDraft,
  input: ShortReferenceVideoLearningInput | undefined
): ShortCommercialReadinessPlan["referenceAnalysis"] {
  const requiredFields = ["summary", "hook", "pacing", "cameraStyle", "captionStyle", "audioStyle", "retentionPattern"];
  const missingFields = input
    ? requiredFields.filter((field) => !hasReferenceField(input, field))
    : [];
  const pattern = plan.viralIntelligence.referenceVideoPattern;
  const status = !input && !pattern
    ? "not_provided"
    : pattern?.safetyStatus === "blocked"
      ? "blocked"
      : missingFields.length === 0 && pattern
        ? "operator_summary_ready"
        : pattern
          ? "review_required"
          : "auto_analysis_recommended";
  const source = pattern || input ? "operator_summary" : "none";
  return {
    schemaVersion: "cinejelly.short-reference-analysis-contract.v1",
    contractId: createStableId("short_ref_analysis", `${plan.projectId}:${plan.requestId ?? ""}:${pattern?.patternId ?? "none"}:${missingFields.join("|")}`),
    status,
    source,
    requiredFields,
    missingFields,
    originalityPolicy: "learn_structure_only_never_clone",
    canUseForStyleTransfer: status === "operator_summary_ready" || status === "review_required",
    nextAction: referenceNextAction(status)
  };
}

function outcomeMemoryFor(plan: ShortPipelinePlanDraft): ShortCommercialReadinessPlan["outcomeMemory"] {
  const memory = plan.agentGraph?.memoryPack;
  const writeIntentCount = memory?.writeIntents.length ?? 0;
  const retrievedPatternCount = memory?.retrievedPatterns.length ?? 0;
  const status = plan.status === "blocked"
    ? "blocked"
    : writeIntentCount > 0
      ? "ready_to_write_after_review"
      : "waiting_for_persistent_store";
  return {
    schemaVersion: "cinejelly.short-outcome-memory-contract.v1",
    contractId: createStableId("short_outcome_memory", `${plan.projectId}:${plan.requestId ?? ""}:${memory?.packId ?? "none"}`),
    status,
    retrievedPatternCount,
    writeIntentCount,
    requiredOutcomeFields: [
      "workspaceId",
      "planId",
      "selectedCandidateId",
      "reviewDecisions",
      "renderArtifactIds",
      "manualQualityScore",
      "operatorNotes",
      "platformPerformanceMetrics"
    ],
    persistenceMode: "contract_only_until_store_configured",
    rawTranscriptStored: false,
    rawSourceUrlStored: false,
    nextAction: status === "ready_to_write_after_review"
      ? "Persist accepted/rejected outcome after manual media review and optional platform performance import."
      : "Configure persistent workspace memory before claiming cross-project self-learning."
  };
}

function check(
  code: ShortCommercialReadinessCheck["code"],
  status: ShortCommercialReadinessStatus,
  score: number,
  message: string,
  repair: string,
  evidence: Readonly<Record<string, string | number | boolean>>
): ShortCommercialReadinessCheck {
  return {
    checkId: createStableId("short_readiness_check", `${code}:${status}:${message}:${JSON.stringify(evidence)}`),
    code,
    status,
    score: roundScore(score),
    message,
    repair,
    evidence
  };
}

function checkSummary(checks: readonly ShortCommercialReadinessCheck[]): ShortCommercialReadinessPlan["checkSummary"] {
  return {
    ready: checks.filter((checkItem) => checkItem.status === "ready").length,
    reviewRequired: checks.filter((checkItem) => checkItem.status === "review_required").length,
    blocked: checks.filter((checkItem) => checkItem.status === "blocked").length
  };
}

function hasReferenceField(input: ShortReferenceVideoLearningInput, field: string): boolean {
  const value = input[field as keyof ShortReferenceVideoLearningInput];
  return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function crawlerNextAction(status: ShortCommercialReadinessPlan["crawlerPolicy"]["status"]): string {
  switch (status) {
    case "not_needed":
      return "Use natural-language/product snapshot inputs; no live crawl is required.";
    case "snapshot_ready":
      return "Use the reviewed snapshot and keep claim/media approval active.";
    case "live_crawl_optional":
      return "Run ProductUrlResearcher only after explicit operator confirmation; skip if blocked.";
    case "clean_url_required":
      return "Replace signed/tracked URL with a canonical clean HTTPS URL or use manual snapshot.";
    case "blocked_by_unsafe_url":
      return "Do not crawl; provide clean URL or manual product evidence.";
  }
}

function referenceNextAction(status: ShortCommercialReadinessPlan["referenceAnalysis"]["status"]): string {
  switch (status) {
    case "not_provided":
      return "Reference video is optional; continue with original creative or upload a rights-cleared sample for style learning.";
    case "operator_summary_ready":
      return "Use operator summary as style/pacing structure only.";
    case "auto_analysis_recommended":
      return "Run source-video auto-analysis when a media asset is available, then feed the extracted pattern back into Short.";
    case "review_required":
      return "Complete missing reference fields and approve originality guardrails before render.";
    case "blocked":
      return "Replace unsafe reference source before using it.";
  }
}

function nextActionsFor(
  status: ShortCommercialReadinessStatus,
  checks: readonly ShortCommercialReadinessCheck[],
  crawlerStatus: string,
  referenceStatus: string,
  memoryStatus: string
): readonly string[] {
  if (status === "blocked") {
    return [
      "Fix blocked product, brand, reference, agent, or render-handoff evidence before spend.",
      "Regenerate Short commercial readiness after blocked evidence is repaired."
    ];
  }
  return uniqueStrings([
    ...checks.filter((checkItem) => checkItem.status === "review_required").map((checkItem) => checkItem.repair),
    crawlerStatus === "live_crawl_optional"
      ? "Crawler is optional and free at provider level, but should run only after explicit live-network confirmation."
      : "",
    referenceStatus === "auto_analysis_recommended"
      ? "Attach a reference asset and run source-video auto-analysis to learn style without cloning."
      : "",
    memoryStatus === "ready_to_write_after_review"
      ? "After render/manual review, write accepted and rejected outcome memory back to the workspace."
      : "",
    "Keep templates optional; choose creative structure through scoring, critique, evidence, and user approval."
  ], 8);
}

function releaseBlockerFor(status: ShortCommercialReadinessStatus, canRenderAfterFormalApproval: boolean): string {
  if (status === "blocked") {
    return "Short commercial readiness is blocked before provider spend.";
  }
  if (!canRenderAfterFormalApproval) {
    return "Short readiness is usable only after formal approval checkpoints and render handoff gates pass.";
  }
  return "Short readiness is no-spend backend evidence; actual render still requires explicit approval, quota/cost gates, artifact validation, and manual media review.";
}

function uniqueStrings(values: readonly string[], limit: number): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function roundScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}
