/**
 * Short viral/niche intelligence.
 * Adds no-spend platform, niche, concept-score, and reference-video pattern guidance
 * to the short pipeline before any provider call can happen.
 */

import { createHash } from "node:crypto";
import type { AudienceNicheFormat, AudienceNicheIntelligence } from "../types/audience-niche-intelligence.js";
import type {
  BrandKitEvaluation,
  ProductUrlBrief,
  ShortPipelineConcept,
  ShortPipelineIntent,
  ShortPipelineScenePlan,
  WorkflowTemplateSuggestion
} from "../types/short-pipeline.js";
import type {
  ShortCreativeIdeaCandidate,
  ShortCreativePatternLearningPlan,
  ShortReferenceVideoLearningInput,
  ShortReferenceVideoPattern,
  ShortReferenceVideoSafetyStatus,
  ShortViralConceptScore,
  ShortViralCreativeMode,
  ShortViralFinding,
  ShortViralFindingCode,
  ShortViralIntelligencePlan,
  ShortViralLever,
  ShortViralNicheStrategy,
  ShortViralPlatformFocus,
  ShortViralSceneDirective
} from "../types/short-viral-intelligence.js";
import { hasCopyRiskIntent } from "../utils/copy-risk-intent.js";
import { createStableId } from "../utils/ids.js";
import { AudienceNicheIntelligencePlanner } from "./audience-niche-intelligence.js";
import { ShortCreativePatternLearningEngine } from "./short-creative-pattern-learning.js";
import { SHORT_PLATFORM_TEMPLATE_CORPUS_ORIGINS } from "./short-platform-template-corpus.js";
import { SHORT_PROMPT_CORPUS_ORIGINS } from "./short-prompt-pattern-corpus.js";
import {
  internalSourcePatternOrigins,
  SHORT_CORE_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = [
  ...internalSourcePatternOrigins(SHORT_CORE_SOURCE_PATTERN_IDS),
  ...SHORT_PROMPT_CORPUS_ORIGINS,
  ...SHORT_PLATFORM_TEMPLATE_CORPUS_ORIGINS
] as const;

const UNSAFE_SOURCE_PATTERN =
  /[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i;
const HIGH_RISK_CLAIM_PATTERN =
  /cure|heal|medical|clinical|guarantee|guaranteed|100%|risk[-\s]?free|earn|income|profit|investment|weight loss|overnight|#1|best/i;
const STRONG_HOOK_PATTERN = /\b(stop|wait|pov|why|before|after|mistake|secret|watch|proof|tested|real|review|problem)\b|[?!]/i;
const EDUCATION_MODE_PATTERN =
  /\b(explain|explainer|education|educational|course|training|lesson|tutorial|teach|school|bootcamp|curriculum|learn\s+(?:how|to|about|the\s+(?:skill|method|framework)))\b/i;

export interface ShortViralIntelligencePlannerInput {
  readonly projectId: string;
  readonly requestId?: string;
  readonly prompt: string;
  readonly generatedAt: Date;
  readonly intent: ShortPipelineIntent;
  readonly productBrief?: ProductUrlBrief;
  readonly brandKitEvaluation?: BrandKitEvaluation;
  readonly selectedTemplate?: WorkflowTemplateSuggestion;
  readonly concepts: readonly ShortPipelineConcept[];
  readonly scenes: readonly ShortPipelineScenePlan[];
  readonly referenceVideoLearning?: ShortReferenceVideoLearningInput;
}

export class ShortViralIntelligencePlanner {
  private readonly audienceNichePlanner = new AudienceNicheIntelligencePlanner();
  private readonly creativePatternLearningEngine = new ShortCreativePatternLearningEngine();

  public build(input: ShortViralIntelligencePlannerInput): ShortViralIntelligencePlan {
    if (!input.projectId.trim()) {
      throw new Error("projectId is required for short viral intelligence.");
    }
    const prompt = cleanText(input.prompt, 3000) ?? "";
    const findings: ShortViralFinding[] = [];
    const reference = this.referencePattern(input.referenceVideoLearning, prompt, findings);
    const strategy = this.nicheStrategy(input, prompt, reference);
    const creativePatternLearning = this.creativePatternLearningEngine.build({
      projectId: input.projectId,
      prompt,
      strategy,
      ...(reference ? { referenceVideoPattern: reference } : {}),
      ...(input.productBrief ? { productBrief: input.productBrief } : {}),
      ...(input.brandKitEvaluation ? { brandKitEvaluation: input.brandKitEvaluation } : {}),
      concepts: input.concepts,
      scenes: input.scenes,
      durationSeconds: input.intent.targetDurationSeconds
    });
    findings.push(...this.strategyFindings(input, prompt, strategy, reference));
    const conceptScores = this.conceptScores(input.concepts, input, prompt, strategy);
    const winningConceptId = conceptScores[0]?.conceptId ?? input.concepts[0]?.conceptId;
    const sceneDirectives = this.sceneDirectives(input.scenes, input, strategy, reference, creativePatternLearning);
    findings.push(...this.sceneFindings(input.scenes, sceneDirectives, strategy, reference));
    const status = findings.some((finding) => finding.severity === "block")
      ? "blocked"
      : findings.some((finding) => finding.severity === "warn") ||
          input.productBrief?.status === "review_required" ||
          input.brandKitEvaluation?.status === "review_required"
        ? "review_required"
        : "ready";
    const intelligenceId = createStableId(
      "short_viral",
      [
        input.projectId,
        input.requestId ?? "",
        prompt,
        strategy.niche,
        strategy.platformFocus,
        strategy.creativeMode,
        reference?.patternId ?? "no_reference",
        winningConceptId ?? "no_concept",
        creativePatternLearning.selectedIdeaId ?? "no_idea"
      ].join(":")
    );

    return {
      schemaVersion: "cinejelly.short-viral-intelligence.v1",
      intelligenceId,
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      generatedAt: input.generatedAt,
      status,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      nicheStrategy: strategy,
      ...(reference ? { referenceVideoPattern: reference } : {}),
      creativePatternLearning,
      ...(winningConceptId ? { winningConceptId } : {}),
      ...(creativePatternLearning.selectedIdeaId ? { winningIdeaId: creativePatternLearning.selectedIdeaId } : {}),
      conceptScores,
      sceneDirectives,
      findings,
      releaseGateSummary: {
        canUseAsNoSpendViralEvidence: status !== "blocked",
        canRenderAfterApproval: status !== "blocked",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: status === "blocked"
          ? "Short viral intelligence is blocked by unsafe reference, local path, credential, or copy-risk evidence."
          : "Short viral intelligence is no-spend planning evidence; render still requires formal review, cost gates, artifact validation, and manual media review."
      }
    };
  }

  private referencePattern(
    input: ShortReferenceVideoLearningInput | undefined,
    prompt: string,
    findings: ShortViralFinding[]
  ): ShortReferenceVideoPattern | undefined {
    if (!input) {
      if (hasCopyRiskIntent(prompt)) {
        findings.push(finding(
          "reference_video_copy_risk",
          "warn",
          "The brief asks to copy or clone a source. The pipeline will learn structure only and will not copy content, identity, assets, or claims.",
          "Provide rights-cleared assets or describe the pattern to adapt rather than asking for an identical recreation.",
          { promptCopyRisk: true }
        ));
      }
      return undefined;
    }
    const sourceLabel = cleanText(input.sourceLabel, 120);
    const summary = cleanText(input.summary, 600) ?? "reference short video pattern";
    const hookPattern = cleanText(input.hook, 220) ?? inferHookPattern(summary, prompt);
    const pacingPattern = cleanText(input.pacing, 220) ?? pacingFrom(input.durationSeconds, input.sceneCount);
    const cameraPattern = cleanText(input.cameraStyle, 220) ?? "native handheld or product-close framing with clear first-frame readability";
    const captionPattern = cleanText(input.captionStyle, 220) ?? "visual beat rhythm that reveals one idea at a time without on-screen text";
    const audioPattern = cleanText(input.audioStyle, 180) ?? "clean narration or trend-compatible bed that does not overpower speech";
    const retentionMechanics = uniqueClean([
      cleanText(input.retentionPattern, 180),
      "front-load the payoff promise",
      "change visual information before attention drops",
      "carry one unanswered question into the proof beat"
    ], 5, 180);
    const ctaPattern = cleanText(input.ctaStyle, 180) ?? "earned visual payoff after proof, without text cards or new claims";
    const visualMotifs = uniqueClean(input.visualMotifs ?? [], 6, 80);
    const sourceEvidence = safeSourceUrl(input.sourceUrl);
    if (sourceEvidence.status === "blocked") {
      findings.push(finding(
        "reference_video_unsafe_source",
        "block",
        "Reference video source is unsafe or could leak local paths, credentials, or non-HTTPS data.",
        "Use a clean HTTPS reference URL or provide a redacted operator summary.",
        { sourceUnsafe: true }
      ));
    }
    const copyRisk = input.doNotCopy === false || hasCopyRiskIntent(`${prompt} ${summary} ${hookPattern}`);
    if (copyRisk) {
      findings.push(finding(
        "reference_video_copy_risk",
        "warn",
        "Reference video learning is constrained to structure, pacing, and presentation pattern only.",
        "Keep new assets, script wording, captions, claims, faces, brand marks, and product evidence original or rights-cleared.",
        { doNotCopy: input.doNotCopy !== false }
      ));
    }
    const safetyStatus: ShortReferenceVideoSafetyStatus = sourceEvidence.status === "blocked"
      ? "blocked"
      : copyRisk
        ? "review_required"
        : "learned_pattern";
    const patternId = createStableId(
      "short_ref_pattern",
      [
        sourceLabel ?? "",
        sourceEvidence.sourceUrlSha256 ?? "",
        summary,
        hookPattern,
        pacingPattern,
        cameraPattern,
        captionPattern
      ].join(":")
    );
    return {
      schemaVersion: "cinejelly.short-reference-video-pattern.v1",
      patternId,
      safetyStatus,
      ...(sourceLabel ? { sourceLabel } : {}),
      ...(sourceEvidence.sourceUrlSha256 ? { sourceUrlSha256: sourceEvidence.sourceUrlSha256 } : {}),
      ...(sourceEvidence.sourceHost ? { sourceHost: sourceEvidence.sourceHost } : {}),
      ...(finitePositive(input.durationSeconds) ? { durationSeconds: round(input.durationSeconds) } : {}),
      ...(integerPositive(input.sceneCount) ? { sceneCount: Math.round(input.sceneCount) } : {}),
      hookPattern,
      pacingPattern,
      cameraPattern,
      captionPattern,
      audioPattern,
      retentionMechanics,
      ctaPattern,
      visualMotifs,
      originalityGuardrails: [
        "learn structure, timing, framing, visual rhythm, and payoff logic only",
        "do not copy source script wording, faces, brand marks, copyrighted edits, music, or private assets",
        "do not render visible captions, subtitles, labels, CTA cards, or typography",
        "replace claims with reviewed product and brand-kit evidence",
        "treat similarity above structural pattern as human-review risk"
      ],
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS
    };
  }

  private nicheStrategy(
    input: ShortViralIntelligencePlannerInput,
    prompt: string,
    reference: ShortReferenceVideoPattern | undefined
  ): ShortViralNicheStrategy {
    const audienceNicheIntelligence = this.audienceNichePlanner.build({
      projectId: input.projectId,
      prompt,
      explicitAudience: input.intent.audience,
      platform: input.intent.platform,
      durationSeconds: input.intent.targetDurationSeconds,
      referenceProvided: Boolean(reference),
      ...(input.productBrief?.title ? { productTitle: input.productBrief.title } : {}),
      ...(input.productBrief?.category ? { productCategory: input.productBrief.category } : {}),
      ...(input.productBrief ? { productBenefits: input.productBrief.benefits } : {}),
      ...(input.productBrief ? { productClaims: input.productBrief.claimInventory.map((claim) => claim.text) } : {}),
      ...(input.productBrief ? { ctaCandidates: input.productBrief.ctaCandidates } : {}),
      ...(input.brandKitEvaluation?.tone ? { brandTone: input.brandKitEvaluation.tone } : {})
    });
    const platformFocus = platformFocusFrom(input.intent.platform, prompt);
    const creativeMode = creativeModeFrom(prompt, input.productBrief, input.selectedTemplate, audienceNicheIntelligence.format);
    const viewerDesire = cleanText(input.intent.businessGoal, 160) ?? audienceNicheIntelligence.viewerDesire;
    return {
      audienceNicheIntelligence,
      niche: audienceNicheIntelligence.niche,
      audience: audienceNicheIntelligence.audience,
      buyerIntent: buyerIntentFrom(prompt, input.productBrief, audienceNicheIntelligence),
      platformFocus,
      creativeMode,
      viewerDesire,
      viewerObjection: objectionFrom(prompt, input.productBrief, input.brandKitEvaluation, audienceNicheIntelligence),
      viralLevers: viralLeversFor(platformFocus, creativeMode, reference, audienceNicheIntelligence),
      antiPatterns: antiPatternsFor(creativeMode, audienceNicheIntelligence)
    };
  }

  private strategyFindings(
    input: ShortViralIntelligencePlannerInput,
    prompt: string,
    strategy: ShortViralNicheStrategy,
    reference: ShortReferenceVideoPattern | undefined
  ): readonly ShortViralFinding[] {
    const findings: ShortViralFinding[] = [];
    if (!input.productBrief && (strategy.niche === "general_video" || strategy.audienceNicheIntelligence.missingSignals.includes("specific_niche"))) {
      findings.push(finding(
        "generic_niche",
        "warn",
        "The brief does not include enough product or niche evidence for highly specific viral positioning.",
        "Add product facts, a URL snapshot, sample audience, objections, or a reference pattern for sharper creative decisions.",
        { productBriefPresent: false }
      ));
    }
    const firstConcept = input.concepts[0];
    if (!firstConcept || !STRONG_HOOK_PATTERN.test(firstConcept.hook)) {
      findings.push(finding(
        "weak_hook",
        "warn",
        "The first concept hook is usable but not yet strong enough for TikTok/Douyin-style retention.",
        "Add a sharper contradiction, proof promise, mistake, or POV statement in the first second.",
        { conceptCount: input.concepts.length }
      ));
    }
    if (!input.productBrief && /ad|ugc|review|shop|buy|product/i.test(prompt)) {
      findings.push(finding(
        "missing_product_evidence",
        "warn",
        "Commercial short request has no product facts, claims, images, or conversion intent evidence yet.",
        "Provide product URL/snapshot evidence before paid render so claims and visuals can be reviewed.",
        { commercialIntent: true }
      ));
    }
    if (input.productBrief?.claimInventory.some((claim) => claim.substantiationRequired)) {
      findings.push(finding(
        "claim_review_required",
        "warn",
        "Some product claims need substantiation before render.",
        "Approve, rewrite, or remove claim-bound beats before provider spend.",
        { claimCount: input.productBrief.claimInventory.length }
      ));
    }
    if (reference?.safetyStatus === "review_required") {
      findings.push(finding(
        "scene_pacing_review",
        "info",
        "Reference pattern has copy-risk guardrails and should be reviewed as style guidance, not a clone target.",
        "Confirm the reference is being used for structure and pacing only.",
        { referencePatternPresent: true }
      ));
    }
    return findings;
  }

  private conceptScores(
    concepts: readonly ShortPipelineConcept[],
    input: ShortViralIntelligencePlannerInput,
    prompt: string,
    strategy: ShortViralNicheStrategy
  ): readonly ShortViralConceptScore[] {
    return concepts
      .map((concept) => {
        const hookScore = scoreHook(concept.hook, strategy);
        const retentionScore = scoreRetention(concept, strategy);
        const nicheFitScore = scoreNicheFit(concept, strategy, input.productBrief);
        const brandFitScore = scoreBrandFit(concept, input.brandKitEvaluation);
        const claimSafetyScore = scoreClaimSafety(concept, input.productBrief, prompt);
        const renderabilityScore = scoreRenderability(concept, input.scenes, strategy);
        const totalScore = round(
          hookScore * 0.24 +
          retentionScore * 0.2 +
          nicheFitScore * 0.18 +
          brandFitScore * 0.14 +
          claimSafetyScore * 0.14 +
          renderabilityScore * 0.1
        );
        return {
          conceptId: concept.conceptId,
          label: concept.label,
          hookScore,
          retentionScore,
          nicheFitScore,
          brandFitScore,
          claimSafetyScore,
          renderabilityScore,
          totalScore,
          reasons: scoreReasons(concept, strategy, input.productBrief)
        };
      })
      .sort((left, right) => right.totalScore - left.totalScore || left.conceptId.localeCompare(right.conceptId));
  }

  private sceneDirectives(
    scenes: readonly ShortPipelineScenePlan[],
    input: ShortViralIntelligencePlannerInput,
    strategy: ShortViralNicheStrategy,
    reference: ShortReferenceVideoPattern | undefined,
    creativePatternLearning: ShortCreativePatternLearningPlan
  ): readonly ShortViralSceneDirective[] {
    const recommendedDurations = sceneDirectiveDurationsFor(scenes, input.intent.targetDurationSeconds);
    const selectedIdea = selectedCreativeIdea(creativePatternLearning);
    return scenes.map((scene, index) => {
      const roleLevers = leversForScene(scene.role, strategy.viralLevers);
      const isFirst = index === 0;
      const isLast = index === scenes.length - 1;
      return {
        sceneId: scene.sceneId,
        order: scene.order,
        role: scene.role,
        recommendedDurationSeconds: recommendedDurations[index] ?? round(input.intent.targetDurationSeconds / Math.max(1, scenes.length)),
        firstFrameRule: isFirst
          ? `Open with ${firstFrameSubject(input.productBrief, strategy)} and one visible promise before the first second ends, with no on-screen text.${selectedIdea ? ` Selected idea hook: ${selectedIdea.hook}` : ""}`
          : "Continue with a visible state change, not a static talking-head hold.",
        retentionJob: retentionJobFor(scene.role, strategy, reference, selectedIdea),
        cameraCue: cameraCueFor(scene.role, strategy, reference),
        captionCue: captionCueFor(scene, strategy, reference),
        proofCue: proofCueFor(scene, input.productBrief, strategy, selectedIdea),
        ...(isLast ? { ctaCue: ctaCueFor(input.productBrief, strategy) } : {}),
        viralLevers: roleLevers,
        qualityChecks: qualityChecksFor(scene, strategy, selectedIdea),
        ...(reference ? { referencePatternAlignment: referenceAlignmentFor(scene, reference) } : {})
      };
    });
  }

  private sceneFindings(
    scenes: readonly ShortPipelineScenePlan[],
    directives: readonly ShortViralSceneDirective[],
    strategy: ShortViralNicheStrategy,
    reference: ShortReferenceVideoPattern | undefined
  ): readonly ShortViralFinding[] {
    const findings: ShortViralFinding[] = [];
    if (directives.some((directive) => directive.captionCue.length > 180)) {
      findings.push(finding(
        "visual_retention_gap",
        "warn",
        "At least one visual-text policy directive is too verbose for render review.",
        "Keep no-visible-text instructions short and move detail into scene action or audio.",
        { sceneCount: scenes.length }
      ));
    }
    if (reference?.sceneCount && Math.abs(reference.sceneCount - scenes.length) >= 3) {
      findings.push(finding(
        "scene_pacing_review",
        "warn",
        "Reference pattern scene count differs materially from the generated short plan.",
        "Review whether the plan should add/remove scene beats or intentionally adapt the reference more loosely.",
        { referenceSceneCount: reference.sceneCount, planSceneCount: scenes.length }
      ));
    }
    if (strategy.platformFocus === "tiktok_douyin" && scenes.length < 3) {
      findings.push(finding(
        "scene_pacing_review",
        "warn",
        "TikTok/Douyin-first shorts need enough visible beat changes to hold attention.",
        "Use at least hook, proof/demo, and payoff beats.",
        { sceneCount: scenes.length }
      ));
    }
    return findings;
  }
}

function platformFocusFrom(platform: string, prompt: string): ShortViralPlatformFocus {
  if (/douyin|tiktok|tik tok/i.test(prompt) || platform === "tiktok" || platform === "douyin" || platform === "unknown") {
    return "tiktok_douyin";
  }
  if (platform === "instagram_reels" || /reels|instagram/i.test(prompt)) {
    return "reels";
  }
  if (platform === "youtube_shorts" || /youtube shorts|shorts/i.test(prompt)) {
    return "youtube_shorts";
  }
  if (/paid|ads?|campaign|cpa|roas|conversion/i.test(prompt)) {
    return "paid_social";
  }
  return "cross_platform_social";
}

function creativeModeFrom(
  prompt: string,
  productBrief: ProductUrlBrief | undefined,
  template: WorkflowTemplateSuggestion | undefined,
  format: AudienceNicheFormat
): ShortViralCreativeMode {
  const combined = `${prompt} ${template?.category ?? ""}`.toLowerCase();
  // EXPLICIT style choice (customer "Phong cách" select appends a machine tag): absolute priority
  // over every keyword heuristic below — a review-worded brief with [style:cinematic] IS cinematic.
  const explicit = /\[style:(ugc|cinematic|story|demo|education|testimonial|comparison|problem_solution|product_ad)\]/.exec(combined);
  if (explicit) {
    return explicit[1] === "ugc" ? "ugc_review" : (explicit[1] as ShortViralCreativeMode);
  }
  if (/\bugc|review|creator|influencer|native\b/.test(combined)) return "ugc_review";
  if (/testimonial|customer story/.test(combined)) return "testimonial";
  if (/compare|versus|vs|before after|before\/after/.test(combined)) return "comparison";
  if (/demo|how it works|show how|tutorial/.test(combined)) return "demo";
  if (EDUCATION_MODE_PATTERN.test(combined)) return "education";
  if (/story|founder|journey/.test(combined)) return "story";
  if (/cinematic|premium|luxury|reveal/.test(combined)) return "cinematic";
  if (/problem|pain|solution/.test(combined)) return "problem_solution";
  const mapped = creativeModeFromAudienceNiche(format);
  if (mapped) return mapped;
  return productBrief ? "product_ad" : "problem_solution";
}

function creativeModeFromAudienceNiche(format: AudienceNicheFormat): ShortViralCreativeMode | undefined {
  switch (format) {
    case "ugc_review":
      return "ugc_review";
    case "product_ad":
      return "product_ad";
    case "product_demo":
      return "demo";
    case "testimonial":
      return "testimonial";
    case "comparison":
      return "comparison";
    case "education":
      return "education";
    case "brand_story":
      return "story";
    case "cinematic_story":
      return "cinematic";
    case "problem_solution":
      return "problem_solution";
    case "case_study":
    case "community":
    case "unknown":
      return undefined;
  }
}

function buyerIntentFrom(
  prompt: string,
  productBrief: ProductUrlBrief | undefined,
  audienceNiche: AudienceNicheIntelligence
): ShortViralNicheStrategy["buyerIntent"] {
  if (/buy|shop|order|cta|conversion|sale|discount|checkout|lead/i.test(prompt) || productBrief?.ctaCandidates.length) return "conversion";
  if (/compare|review|proof|testimonial|demo|why/i.test(prompt)) return "consideration";
  if (/repeat|loyal|retention|community/i.test(prompt)) return "retention";
  return audienceNiche.funnelStage;
}

function objectionFrom(
  prompt: string,
  productBrief: ProductUrlBrief | undefined,
  brandKitEvaluation: BrandKitEvaluation | undefined,
  audienceNiche: AudienceNicheIntelligence
): string {
  const promptObjection = matches(prompt, /\b(?:objection|hesitation|concern|worry|afraid|but)\s*[:\-]?\s*([^.!?]{4,120})/gi)[0];
  if (promptObjection) return promptObjection;
  if (productBrief?.claimInventory.some((claim) => claim.substantiationRequired)) {
    return "viewer may not trust the claim without visible proof or substantiation";
  }
  if (brandKitEvaluation?.status === "review_required") {
    return "viewer may feel the message is off-brand or unclear";
  }
  return audienceNiche.viewerObjection;
}

function viralLeversFor(
  platform: ShortViralPlatformFocus,
  mode: ShortViralCreativeMode,
  reference: ShortReferenceVideoPattern | undefined,
  audienceNiche: AudienceNicheIntelligence
): readonly ShortViralLever[] {
  const levers: ShortViralLever[] = ["fast_hook", "visual_retention", "visual_payoff", "clear_payoff"];
  if (platform === "tiktok_douyin") levers.push("pattern_interrupt", "curiosity_gap");
  if (mode === "ugc_review" || mode === "testimonial") levers.push("native_ugc", "social_proof");
  if (mode === "product_ad" || mode === "demo" || mode === "comparison") levers.push("proof_stack", "product_demo");
  if (audienceNiche.trendPosture === "trend_native") levers.push("trend_transfer", "native_ugc");
  if (audienceNiche.trendPosture === "proof_led" || audienceNiche.proofStrategy) levers.push("proof_stack");
  if (audienceNiche.trendPosture === "community_social") levers.push("social_proof");
  if (reference) levers.push("trend_transfer");
  return uniqueValues(levers);
}

function antiPatternsFor(mode: ShortViralCreativeMode, audienceNiche: AudienceNicheIntelligence): readonly string[] {
  return [
    "slow brand intro before the viewer understands the payoff",
    "generic stock montage with no product or proof beat",
    "unsupported superlatives or unreviewed before-after claims",
    "visible captions, subtitles, labels, CTA cards, or text walls",
    mode === "ugc_review" ? "overproduced creator delivery that no longer feels native" : "flat single-angle narration without visible state change",
    `template-first execution that ignores ${audienceNiche.audience} and the ${audienceNiche.trendPosture} posture`
  ];
}

function scoreHook(hook: string, strategy: ShortViralNicheStrategy): number {
  let score = STRONG_HOOK_PATTERN.test(hook) ? 0.78 : 0.58;
  if (hook.toLowerCase().includes(strategy.niche.split(" ")[0] ?? "")) score += 0.08;
  if (strategy.platformFocus === "tiktok_douyin") score += 0.05;
  return clampScore(score);
}

function scoreRetention(concept: ShortPipelineConcept, strategy: ShortViralNicheStrategy): number {
  let score = 0.62 + strategy.viralLevers.length * 0.025;
  if (/proof|demo|problem|visible|show/i.test(`${concept.label} ${concept.angle}`)) score += 0.12;
  if (strategy.creativeMode === "ugc_review" && /review|native|buyer|problem/i.test(concept.angle)) score += 0.08;
  return clampScore(score);
}

function scoreNicheFit(
  concept: ShortPipelineConcept,
  strategy: ShortViralNicheStrategy,
  productBrief: ProductUrlBrief | undefined
): number {
  let score = productBrief ? 0.74 : 0.52;
  if (`${concept.label} ${concept.angle} ${concept.hook}`.toLowerCase().includes(strategy.niche.split(" ")[0] ?? "")) score += 0.1;
  if (strategy.viewerDesire && concept.angle.toLowerCase().includes(strategy.viewerDesire.toLowerCase().split(" ")[0] ?? "")) score += 0.05;
  return clampScore(score);
}

function scoreBrandFit(concept: ShortPipelineConcept, brandKitEvaluation: BrandKitEvaluation | undefined): number {
  if (!brandKitEvaluation) return 0.58;
  if (brandKitEvaluation.status === "blocked") return 0.18;
  let score = brandKitEvaluation.status === "ready" ? 0.84 : 0.66;
  if (brandKitEvaluation.tone && concept.angle.toLowerCase().includes(brandKitEvaluation.tone.toLowerCase().split(" ")[0] ?? "")) score += 0.06;
  return clampScore(score);
}

function sceneDirectiveDurationsFor(
  scenes: readonly ShortPipelineScenePlan[],
  targetDurationSeconds: number
): readonly number[] {
  if (scenes.length === 0) {
    return [];
  }
  const weights = scenes.map((scene) => {
    switch (scene.role) {
      case "hook": return 0.72;
      case "problem": return 1;
      case "proof": return 1.15;
      case "demo": return 1.24;
      case "offer": return 0.82;
      case "payoff": return 0.92;
    }
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const minimum = targetDurationSeconds <= 15 ? 2.5 : 3;
  const raw = weights.map((weight) => Math.max(minimum, targetDurationSeconds * (weight / totalWeight)));
  const rawTotal = raw.reduce((sum, value) => sum + value, 0);
  const rounded = raw.map((value) => round(value * (targetDurationSeconds / rawTotal)));
  const delta = round(targetDurationSeconds - rounded.reduce((sum, value) => sum + value, 0));
  const lastIndex = rounded.length - 1;
  if (lastIndex >= 0 && Math.abs(delta) >= 0.01) {
    const lastValue = rounded[lastIndex] ?? minimum;
    rounded[lastIndex] = round(Math.max(minimum, lastValue + delta));
  }
  return rounded;
}

function scoreClaimSafety(concept: ShortPipelineConcept, productBrief: ProductUrlBrief | undefined, prompt: string): number {
  const combined = `${concept.hook} ${concept.angle} ${prompt}`;
  let score = HIGH_RISK_CLAIM_PATTERN.test(combined) ? 0.42 : 0.86;
  if (productBrief?.claimInventory.some((claim) => claim.substantiationRequired)) score -= 0.12;
  if (concept.riskNotes.length > 0) score -= 0.04;
  return clampScore(score);
}

function scoreRenderability(
  concept: ShortPipelineConcept,
  scenes: readonly ShortPipelineScenePlan[],
  strategy: ShortViralNicheStrategy
): number {
  let score = scenes.length >= 3 ? 0.82 : 0.62;
  if (/one clear|visible|simple|show/i.test(concept.angle)) score += 0.05;
  if (strategy.creativeMode === "cinematic") score -= 0.03;
  return clampScore(score);
}

function scoreReasons(
  concept: ShortPipelineConcept,
  strategy: ShortViralNicheStrategy,
  productBrief: ProductUrlBrief | undefined
): readonly string[] {
  return uniqueClean([
    `fits ${strategy.platformFocus} with ${strategy.viralLevers.slice(0, 3).join(", ")}`,
    productBrief ? "uses reviewed product evidence as the proof base" : "needs product evidence before commercial render",
    STRONG_HOOK_PATTERN.test(concept.hook) ? "hook contains a retention trigger" : "hook should be sharpened before paid render",
    `matches ${strategy.creativeMode} creative mode`
  ], 5, 160);
}

function leversForScene(role: ShortPipelineScenePlan["role"], globalLevers: readonly ShortViralLever[]): readonly ShortViralLever[] {
  const preferred: Record<ShortPipelineScenePlan["role"], readonly ShortViralLever[]> = {
    hook: ["fast_hook", "pattern_interrupt", "curiosity_gap", "visual_retention"],
    problem: ["native_ugc", "curiosity_gap", "visual_retention"],
    proof: ["proof_stack", "social_proof", "visual_payoff"],
    demo: ["product_demo", "visual_payoff", "visual_retention"],
    offer: ["proof_stack", "clear_payoff"],
    payoff: ["clear_payoff", "visual_payoff"]
  };
  return preferred[role].filter((lever) => globalLevers.includes(lever)).slice(0, 4);
}

function firstFrameSubject(productBrief: ProductUrlBrief | undefined, strategy: ShortViralNicheStrategy): string {
  return productBrief?.title ? `${productBrief.title} or the buyer result` : `the ${strategy.niche} problem or desired result`;
}

function retentionJobFor(
  role: ShortPipelineScenePlan["role"],
  strategy: ShortViralNicheStrategy,
  reference: ShortReferenceVideoPattern | undefined,
  selectedIdea: ShortCreativeIdeaCandidate | undefined
): string {
  const referenceCue = reference ? ` Adapt the reference pacing pattern: ${reference.pacingPattern}.` : "";
  const ideaCue = selectedIdea ? ` Follow selected idea "${selectedIdea.label}" arc: ${selectedIdea.sceneArc.slice(0, 4).join(" > ")}.` : "";
  switch (role) {
    case "hook":
      return `Create a curiosity gap tied to ${strategy.viewerDesire}; make the viewer understand the payoff immediately.${referenceCue}${ideaCue}`;
    case "problem":
      return `Name the viewer objection visually: ${strategy.viewerObjection}.${ideaCue}`;
    case "proof":
      return `Turn the claim into visible proof, product evidence, or a review-bound fact.${ideaCue}`;
    case "demo":
      return `Show one concrete usage step with a before-state and after-state in the same beat.${ideaCue}`;
    case "offer":
      return `Make the offer feel like the natural next step after proof, not a separate ad card.${ideaCue}`;
    case "payoff":
      return `Close the loop from hook to proof through a visual payoff, without visible text or CTA card.${ideaCue}`;
  }
}

function cameraCueFor(
  role: ShortPipelineScenePlan["role"],
  strategy: ShortViralNicheStrategy,
  reference: ShortReferenceVideoPattern | undefined
): string {
  if (reference) {
    return `${reference.cameraPattern}; adapt for ${role} without copying source assets.`;
  }
  if (strategy.creativeMode === "ugc_review") {
    return role === "hook"
      ? "native creator framing, product/result visible, slight motion in first frame"
      : "handheld creator/product close-up with natural movement and readable proof";
  }
  if (strategy.creativeMode === "cinematic") {
    return "premium product close-up, motivated camera move, clean no-text composition";
  }
  return "clear product/result framing with one visible state change per beat";
}

function captionCueFor(
  scene: ShortPipelineScenePlan,
  strategy: ShortViralNicheStrategy,
  reference: ShortReferenceVideoPattern | undefined
): string {
  const referenceCue = reference ? ` Adapt the reference visual rhythm (${reference.captionPattern}) without rendering text.` : "";
  return `No on-screen text for this ${scene.role} beat: no captions, subtitles, labels, typography, CTA cards, or fake UI text.${referenceCue} Keep the idea specific to ${strategy.niche} through action, framing, and audio.`;
}

function proofCueFor(
  scene: ShortPipelineScenePlan,
  productBrief: ProductUrlBrief | undefined,
  strategy: ShortViralNicheStrategy,
  selectedIdea: ShortCreativeIdeaCandidate | undefined
): string {
  const ideaProof = selectedIdea ? ` Selected idea proof plan: ${selectedIdea.proofPlan}` : "";
  if (scene.claimIds.length > 0) {
    return `Use only review-bound claim IDs ${scene.claimIds.join(", ")} and show visible evidence.${ideaProof}`;
  }
  if (productBrief?.benefits[0]) {
    return `Ground the beat in this reviewed benefit: ${productBrief.benefits[0]}.${ideaProof}`;
  }
  return `Use observable ${strategy.niche} evidence; avoid unsupported performance claims.${ideaProof}`;
}

function ctaCueFor(productBrief: ProductUrlBrief | undefined, strategy: ShortViralNicheStrategy): string {
  return productBrief?.ctaCandidates[0]
    ? `Imply the next step through the result and product presence only; do not render the provided action text.`
    : `Use a ${strategy.buyerIntent === "conversion" ? "conversion" : "low-friction"} visual payoff and do not add text or new claims.`;
}

function qualityChecksFor(
  scene: ShortPipelineScenePlan,
  strategy: ShortViralNicheStrategy,
  selectedIdea: ShortCreativeIdeaCandidate | undefined
): readonly string[] {
  return [
    scene.role === "hook" ? "payoff is visible or spoken inside the first second" : "scene starts with changed visual information",
    "no visible text, captions, subtitles, labels, or CTA cards cover product proof",
    "no unsupported claim or new offer appears outside review evidence",
    `beat supports ${strategy.creativeMode} mode and ${strategy.platformFocus} pacing`,
    selectedIdea ? `beat follows selected idea ${selectedIdea.ideaId} without copying reference expression` : undefined
  ].filter((item): item is string => Boolean(item));
}

function selectedCreativeIdea(plan: ShortCreativePatternLearningPlan): ShortCreativeIdeaCandidate | undefined {
  return plan.candidates.find((candidate) => candidate.ideaId === plan.selectedIdeaId) ?? plan.candidates[0];
}

function referenceAlignmentFor(scene: ShortPipelineScenePlan, reference: ShortReferenceVideoPattern): string {
  return `Use reference ${reference.patternId} for ${scene.role} pacing/visual-rhythm/camera structure only; keep script, assets, claims, and brand identity original or approved.`;
}

function inferHookPattern(summary: string, prompt: string): string {
  if (/mistake|avoid|wrong/i.test(`${summary} ${prompt}`)) return "mistake-first hook that promises a fix";
  if (/review|ugc|creator/i.test(`${summary} ${prompt}`)) return "creator POV hook with a quick credibility cue";
  if (/before|after|transform/i.test(`${summary} ${prompt}`)) return "before-state to payoff promise in the opening beat";
  return "specific problem or payoff promise in the first second";
}

function pacingFrom(durationSeconds: number | undefined, sceneCount: number | undefined): string {
  if (finitePositive(durationSeconds) && integerPositive(sceneCount)) {
    const average = round(durationSeconds / Math.max(1, Math.round(sceneCount)));
    return `${Math.round(sceneCount)} visible beats across ${round(durationSeconds)} seconds, about ${average}s per beat`;
  }
  if (finitePositive(durationSeconds)) return `fast short-form pacing across ${round(durationSeconds)} seconds`;
  return "fast hook, proof shift, demo, then visual payoff";
}

function safeSourceUrl(value: string | undefined): { readonly status: "none" | "ok" | "blocked"; readonly sourceUrlSha256?: string; readonly sourceHost?: string } {
  const cleaned = cleanText(value, 1000);
  if (!cleaned) return { status: "none" };
  if (UNSAFE_SOURCE_PATTERN.test(cleaned)) return { status: "blocked" };
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || /(^localhost$|^127\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^\[?::1\]?)/i.test(parsed.hostname)) {
      return { status: "blocked" };
    }
    return {
      status: "ok",
      sourceUrlSha256: sha256(`${parsed.origin}${parsed.pathname}${parsed.search}`),
      sourceHost: parsed.hostname
    };
  } catch {
    return { status: "blocked" };
  }
}

function finding(
  code: ShortViralFindingCode,
  severity: ShortViralFinding["severity"],
  message: string,
  repair: string,
  evidence?: Readonly<Record<string, string | number | boolean>>
): ShortViralFinding {
  return {
    code,
    severity,
    message,
    repair,
    ...(evidence ? { evidence } : {})
  };
}

function matches(value: string, pattern: RegExp): readonly string[] {
  const output: string[] = [];
  for (const match of value.matchAll(pattern)) {
    const candidate = cleanText(match[1], 120);
    if (candidate) output.push(candidate);
  }
  return output;
}

function cleanText(value: string | undefined, maxLength = 240): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function uniqueClean(values: readonly (string | undefined)[], limit: number, maxLength: number): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = cleanText(value, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function uniqueValues<T extends string>(values: readonly T[]): readonly T[] {
  const seen = new Set<T>();
  const output: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function finitePositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function integerPositive(value: number | undefined): value is number {
  return finitePositive(value) && Number.isInteger(value);
}

function clampScore(value: number): number {
  return round(Math.max(0, Math.min(1, value)));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
