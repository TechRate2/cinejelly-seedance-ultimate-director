/**
 * Agentic short-pipeline foundation.
 * It converts natural-language briefs, safe product URL evidence, optional templates,
 * and brand policy into a reviewable no-spend plan before provider work.
 */

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { ShortChannelStyleProfileEvaluator } from "./short-channel-style-profile.js";
import { ReviewApprovalSystem } from "./review-approval-system.js";
import { ShortDirectorPlanner } from "./short-director-planner.js";
import { ShortAgentGraphPlanner } from "./short-agent-graph-planner.js";
import { ShortCommercialReadinessPlanner } from "./short-commercial-readiness-planner.js";
import { ShortViralIntelligencePlanner } from "./short-viral-intelligence-planner.js";
import { ShortVisualBiblePlanner } from "./short-visual-bible-planner.js";
import { ShortVideoPipePlanner } from "./short-video-pipe-planner.js";
import {
  internalSourcePatternOrigins,
  SHORT_BRAND_SOURCE_PATTERN_IDS,
  SHORT_CORE_SOURCE_PATTERN_IDS,
  SHORT_PRODUCT_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";
import type {
  BrandKitEvaluation,
  BrandKitInput,
  BrandKitIssue,
  ProductClaimInventoryItem,
  ProductClaimRisk,
  ProductImageEvidence,
  ProductUrlBrief,
  ProductUrlBriefInput,
  ProductUrlBriefIssue,
  ProductUrlSourceEvidence,
  ProductUrlEvidenceStatus,
  ProductUrlSnapshotInput,
  ShortPipelineAudioPolicy,
  ShortPipelineAudioPolicyInput,
  ShortPipelineConcept,
  ShortPipelineEmotion,
  ShortPipelineIntent,
  ShortPipelinePlan,
  ShortPipelinePlanInput,
  ShortPipelinePlatform,
  ShortMediaReferenceInput,
  ShortMediaReferencePlan,
  ShortMediaReferencePlanStatus,
  ShortSeedanceRoutingPlan,
  ShortReferenceRemakeBlueprint,
  ShortPipelineScenePlan,
  ShortPipelineVisualTextPolicy,
  ShortVisualBiblePlan,
  WorkflowTemplateDefinition,
  WorkflowTemplateSuggestion
} from "../types/short-pipeline.js";
import type { ReviewApprovalCheckpointInput } from "../types/review-approval.js";
import type { ShortReferenceVideoLearningInput } from "../types/short-viral-intelligence.js";
import type { AspectRatio, BitrateMode, Resolution } from "../types/settings.js";
import { hasCopyRiskIntent } from "../utils/copy-risk-intent.js";
import { createStableId } from "../utils/ids.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_CORE_SOURCE_PATTERN_IDS);
const PRODUCT_SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_PRODUCT_SOURCE_PATTERN_IDS);
const BRAND_SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_BRAND_SOURCE_PATTERN_IDS);

import { isUploadUri } from "./upload-reference.js";

const UNSAFE_TEXT_PATTERN =
  /[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|https?:\/\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i;

const UNSAFE_MEDIA_REFERENCE_PATTERN =
  /[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i;

const UNSAFE_QUERY_PATTERN = /token|signature|sig|key|apikey|api_key|secret|password|auth|credential|expires|policy/i;

const HIGH_RISK_CLAIM_PATTERN =
  /cure|heal|medical|doctor|clinical|guarantee|guaranteed|100%|risk[-\s]?free|earn|income|profit|investment|weight loss|before and after|overnight|best|#1/i;

const MEDIUM_RISK_CLAIM_PATTERN =
  /improve|increase|reduce|boost|faster|stronger|premium|proven|safe|certified|limited time|save|discount/i;
const SHORT_MIN_COMMERCIAL_RENDER_SECONDS = 15;
const SHORT_MAX_COMMERCIAL_RENDER_SECONDS = 60;
const SHORT_MAX_SEQUENCE_RENDER_SECONDS = 480;
const NO_VISIBLE_TEXT_CAPTION = "NO_ON_SCREEN_TEXT";
const DEFAULT_SHORT_SEEDANCE_RESOLUTION: Resolution = "720p";
const DEFAULT_SHORT_SEEDANCE_BITRATE_MODE: BitrateMode = "high";

export class ProductUrlBriefExtractor {
  public build(input: ProductUrlBriefInput | undefined, userPrompt = ""): ProductUrlBrief | undefined {
    if (!input?.productUrl && !input?.snapshot) {
      return undefined;
    }
    const snapshot = input.snapshot ?? {};
    const source = this.sourceEvidence(input.productUrl);
    const title = this.pickTitle(snapshot, userPrompt);
    const category = cleanText(snapshot.category) ?? this.categoryFromText(`${input.productUrl ?? ""} ${title ?? ""} ${userPrompt}`);
    const benefits = this.benefits(snapshot, userPrompt);
    const claims = this.claimInventory(snapshot, benefits, userPrompt);
    const images = this.images(snapshot.imageUrls ?? []);
    const issues = this.issues({ source, title, benefits, claims, images, snapshot });
    const missingFields = this.missingFields(title, benefits, images, snapshot);
    const priceText = cleanText(snapshot.priceText, 80);
    const targetBuyer = cleanText(snapshot.targetBuyer, 160);
    const status = issues.some((issue) => issue.severity === "block")
      ? "blocked"
      : issues.length > 0 || claims.some((claim) => claim.substantiationRequired)
      ? "review_required"
      : "ready";
    const briefId = createStableId(
      "product_brief",
      [source.sourceUrlSha256 ?? "no_url", title ?? "", category ?? "", benefits.join("|")].join(":")
    );

    return {
      schemaVersion: "cinejelly.product-url-brief.v1",
      briefId,
      status,
      source,
      ...(title ? { title } : {}),
      ...(category ? { category } : {}),
      ...(priceText ? { priceText } : {}),
      ...(targetBuyer ? { targetBuyer } : {}),
      benefits,
      ctaCandidates: this.ctas(snapshot, userPrompt),
      images,
      claimInventory: claims,
      missingFields,
      issues,
      sourcePatternOrigins: PRODUCT_SOURCE_PATTERN_ORIGINS
    };
  }

  private sourceEvidence(rawUrl: string | undefined): ProductUrlSourceEvidence {
    if (!rawUrl?.trim()) {
      return {
        status: "not_provided" as const,
        queryKeyCount: 0,
        unsafeQueryKeyCount: 0
      };
    }
    const sourceUrlSha256 = sha256(rawUrl.trim());
    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return {
        status: "invalid_url" as const,
        sourceUrlSha256,
        queryKeyCount: 0,
        unsafeQueryKeyCount: 0
      };
    }
    const queryEntries = [...parsed.searchParams.entries()];
    const unsafeQueryKeyCount = queryEntries.filter(([key, value]) =>
      UNSAFE_QUERY_PATTERN.test(key) || UNSAFE_QUERY_PATTERN.test(value)
    ).length;
    const base = {
      sourceUrlSha256,
      sourceHost: parsed.hostname.toLowerCase(),
      sourcePathSha256: sha256(parsed.pathname || "/"),
      queryKeyCount: queryEntries.length,
      unsafeQueryKeyCount
    };
    if (parsed.protocol !== "https:") {
      return { ...base, status: "blocked_non_https" as const };
    }
    if (isLocalHost(parsed.hostname)) {
      return { ...base, status: "blocked_localhost" as const };
    }
    if (parsed.username || parsed.password) {
      return { ...base, status: "blocked_embedded_credentials" as const };
    }
    return {
      ...base,
      status: unsafeQueryKeyCount > 0 ? "unsafe_query_redacted" as const : "clean_https" as const
    };
  }

  private pickTitle(snapshot: ProductUrlSnapshotInput, userPrompt: string): string | undefined {
    return cleanText(snapshot.productTitle, 120) ??
      cleanText(snapshot.pageTitle, 120) ??
      firstQuotedText(userPrompt) ??
      undefined;
  }

  private benefits(snapshot: ProductUrlSnapshotInput, userPrompt: string): readonly string[] {
    const values = [
      ...(snapshot.benefits ?? []),
      ...splitBenefitText(snapshot.metaDescription),
      ...splitBenefitText(snapshot.pageText),
      ...splitBenefitText(userPrompt)
    ];
    return uniqueClean(values, 5, 180);
  }

  private claimInventory(
    snapshot: ProductUrlSnapshotInput,
    benefits: readonly string[],
    userPrompt: string
  ): readonly ProductClaimInventoryItem[] {
    const rawClaims = [
      ...(snapshot.claims ?? []).map((text) => ({ text, source: "snapshot_claim" as const })),
      ...benefits.map((text) => ({ text, source: "benefit" as const })),
      ...splitBenefitText(snapshot.metaDescription).map((text) => ({ text, source: "description" as const })),
      ...claimLikeFragments(userPrompt).map((text) => ({ text, source: "operator_note" as const }))
    ];
    return uniqueClean(rawClaims.map((item) => item.text), 12, 180).map((text) => {
      const source = rawClaims.find((item) => cleanText(item.text, 180) === text)?.source ?? "operator_note";
      const risk = claimRisk(text);
      return {
        claimId: createStableId("claim", text),
        text,
        risk,
        confidence: risk === "high" ? 0.44 : risk === "medium" ? 0.58 : 0.72,
        substantiationRequired: risk !== "low",
        source
      };
    });
  }

  private images(imageUrls: readonly string[]): readonly ProductImageEvidence[] {
    return imageUrls.slice(0, 12).map((url, index) => {
      const evidence = this.sourceEvidence(url);
      const status: ProductUrlEvidenceStatus = evidence.status;
      return {
        imageId: createStableId("product_image", `${index}:${evidence.sourceUrlSha256 ?? url}`),
        status,
        ...(evidence.sourceUrlSha256 ? { imageUrlSha256: evidence.sourceUrlSha256 } : {}),
        ...(evidence.sourceHost ? { sourceHost: evidence.sourceHost } : {}),
        rightsStatus: "unverified"
      };
    });
  }

  private ctas(snapshot: ProductUrlSnapshotInput, userPrompt: string): readonly string[] {
    return uniqueClean([
      snapshot.cta,
      /shop now/i.test(userPrompt) ? "shop intent mentioned" : undefined,
      /book|demo|call/i.test(userPrompt) ? "lead intent mentioned" : undefined,
      /learn/i.test(userPrompt) ? "learning intent mentioned" : undefined
    ], 4, 80);
  }

  private missingFields(
    title: string | undefined,
    benefits: readonly string[],
    images: readonly ProductImageEvidence[],
    snapshot: ProductUrlSnapshotInput
  ): readonly string[] {
    return [
      ...(title ? [] : ["product_title"]),
      ...(benefits.length > 0 ? [] : ["product_benefits"]),
      ...(images.length > 0 ? [] : ["product_images"]),
      ...(snapshot.targetBuyer ? [] : ["target_buyer"])
    ];
  }

  private issues(input: {
    readonly source: ReturnType<ProductUrlBriefExtractor["sourceEvidence"]>;
    readonly title: string | undefined;
    readonly benefits: readonly string[];
    readonly claims: readonly ProductClaimInventoryItem[];
    readonly images: readonly ProductImageEvidence[];
    readonly snapshot: ProductUrlSnapshotInput;
  }): readonly ProductUrlBriefIssue[] {
    const issues: ProductUrlBriefIssue[] = [];
    if (input.source.status === "not_provided") {
      issues.push(issue("missing_product_url", "warn", "Product URL is missing.", "Add a clean HTTPS product URL when URL-to-video evidence is required."));
    }
    if (input.source.status === "invalid_url") {
      issues.push(issue("invalid_product_url", "block", "Product URL is missing or invalid.", "Provide a clean HTTPS product URL."));
    }
    if (input.source.status === "blocked_non_https") {
      issues.push(issue("non_https_product_url", "block", "Product URL is not HTTPS.", "Use a clean HTTPS product URL."));
    }
    if (input.source.status === "blocked_localhost") {
      issues.push(issue("localhost_product_url", "block", "Product URL points to localhost or a private host.", "Use a public HTTPS product URL."));
    }
    if (input.source.status === "blocked_embedded_credentials") {
      issues.push(issue("embedded_url_credentials", "block", "Product URL contains embedded credentials.", "Remove username/password credentials from the URL."));
    }
    if (input.source.status === "unsafe_query_redacted") {
      issues.push(issue("unsafe_query_redacted", "warn", "Product URL query looked credential-like and was reduced to fingerprint evidence.", "Use a clean canonical product URL before launch evidence."));
    }
    if (!input.title) {
      issues.push(issue("missing_product_title", "warn", "Product title is missing.", "Confirm the product title before generating the final script."));
    }
    if (input.benefits.length === 0) {
      issues.push(issue("missing_product_benefits", "warn", "Product benefits are missing.", "Add benefits or let the researcher extract them from reviewed product copy."));
    }
    if (input.images.length === 0 || input.images.every((image) => image.rightsStatus !== "operator_approved")) {
      issues.push(issue("missing_product_image_rights", "warn", "Product image rights are not approved.", "Attach approved product imagery or mark operator-owned assets before render."));
    }
    if (input.claims.some((claim) => claim.substantiationRequired)) {
      issues.push(issue("claim_substantiation_required", "warn", "One or more product claims require substantiation.", "Approve, soften, or remove risky claims before provider spend."));
    }
    const publicText = [
      input.snapshot.productTitle,
      input.snapshot.pageTitle,
      input.snapshot.metaDescription,
      input.snapshot.pageText,
      ...(input.snapshot.benefits ?? []),
      ...(input.snapshot.claims ?? [])
    ].filter(Boolean).join(" ");
    if (UNSAFE_TEXT_PATTERN.test(publicText)) {
      issues.push(issue("unsafe_product_text", "block", "Product text contains unsafe URL, path, or credential-like content.", "Remove unsafe public text before planning."));
    }
    return issues;
  }

  private categoryFromText(value: string): string | undefined {
    const lower = value.toLowerCase();
    if (/serum|skincare|cosmetic|beauty/.test(lower)) return "beauty";
    if (/course|training|lesson|education/.test(lower)) return "education";
    if (/software|saas|app|platform/.test(lower)) return "software";
    if (/supplement|fitness|workout/.test(lower)) return "wellness";
    if (/shirt|fashion|apparel/.test(lower)) return "fashion";
    return undefined;
  }
}

export class BrandKitEvaluator {
  public evaluate(
    input: BrandKitInput | undefined,
    claims: readonly ProductClaimInventoryItem[],
    additionalText?: string
  ): BrandKitEvaluation | undefined {
    if (!input) {
      return undefined;
    }
    const brandName = cleanText(input.brandName, 100);
    const tone = cleanText(input.tone, 120);
    const language = cleanText(input.language, 80);
    const visualStyle = cleanText(input.visualStyle, 160);
    const issues: BrandKitIssue[] = [];
    if (!brandName) {
      issues.push(brandIssue("missing_brand_name", "warn", "Brand name is missing.", "Add the brand name to the brand kit."));
    }
    if (!tone) {
      issues.push(brandIssue("missing_tone", "warn", "Brand tone is missing.", "Define tone before finalizing narration and audio."));
    }
    if (!input.allowedClaims?.length && !input.forbiddenClaims?.length) {
      issues.push(brandIssue("missing_claim_policy", "warn", "Brand claim policy is missing.", "Add allowed or forbidden claims so the claim reviewer has policy evidence."));
    }
    // Also scan the raw user prompt, not just the extracted claim inventory: short or
    // non-risk-flagged phrases (e.g. "Detox tea") never enter the inventory, so a
    // forbidden phrase there would otherwise slip past the brand policy.
    const rawPromptLower = (cleanText(additionalText, 2000) ?? "").toLowerCase();
    for (const forbidden of input.forbiddenClaims ?? []) {
      const normalizedForbidden = cleanText(forbidden, 120);
      if (!normalizedForbidden) continue;
      const forbiddenLower = normalizedForbidden.toLowerCase();
      const matchingClaim = claims.find((claim) => claim.text.toLowerCase().includes(forbiddenLower));
      const inRawPrompt = rawPromptLower.length > 0 && rawPromptLower.includes(forbiddenLower);
      if (matchingClaim || inRawPrompt) {
        issues.push(brandIssue(
          "forbidden_claim_present",
          "block",
          "A product claim conflicts with the brand kit forbidden-claim policy.",
          "Remove or rewrite the forbidden claim before render.",
          matchingClaim?.claimId ?? sha256(forbiddenLower)
        ));
      }
    }
    for (const assetUri of input.logoAssetUris ?? []) {
      const cleanAsset = cleanText(assetUri, 240);
      if (!cleanAsset || !(cleanAsset.startsWith("asset://") || isCleanHttps(cleanAsset))) {
        issues.push(brandIssue("unsafe_brand_asset_uri", "block", "Brand asset URI is not a clean asset:// or HTTPS URI.", "Register brand assets as asset:// IDs or clean HTTPS URLs.", sha256(assetUri)));
      }
    }
    if ((input.logoAssetUris?.length ?? 0) > 0 && (input.approvedAssetIds?.length ?? 0) === 0) {
      issues.push(brandIssue("unapproved_brand_asset", "warn", "Brand assets are present but not marked approved.", "Approve logo/color assets before final render."));
    }
    const status = issues.some((item) => item.severity === "block") ? "blocked" : issues.length > 0 ? "review_required" : "ready";
    return {
      schemaVersion: "cinejelly.brand-kit-evaluation.v1",
      brandKitId: createStableId("brand_kit", [input.brandId ?? "", brandName ?? "", tone ?? ""].join(":")),
      status,
      ...(brandName ? { brandName } : {}),
      ...(tone ? { tone } : {}),
      ...(language ? { language } : {}),
      ...(visualStyle ? { visualStyle } : {}),
      colorPalette: uniqueClean(input.colorPalette ?? [], 12, 40),
      allowedClaimCount: input.allowedClaims?.length ?? 0,
      forbiddenClaimCount: input.forbiddenClaims?.length ?? 0,
      ctaRuleCount: input.ctaRules?.length ?? 0,
      voicePreferenceCount: input.voicePreferences?.length ?? 0,
      approvedAssetCount: input.approvedAssetIds?.length ?? 0,
      issues,
      sourcePatternOrigins: BRAND_SOURCE_PATTERN_ORIGINS
    };
  }
}

export class WorkflowTemplateRegistry {
  public readonly templates: readonly WorkflowTemplateDefinition[] = [
    template("tiktok_product_ad", "TikTok/Douyin Product Ad", "product_ad", ["tiktok", "douyin"], [15, 35], [
      ["hook", "Open with a concrete product problem or surprising use case."],
      ["proof", "Show one visible product proof point before the offer."],
      ["payoff", "End on a visual payoff without text cards."]
    ]),
    template("ugc_ad", "UGC Ad", "ugc_ad", ["tiktok", "douyin", "instagram_reels"], [20, 45], [
      ["hook", "Use a first-person problem statement."],
      ["scene", "Cut between face-to-camera, product handling, and proof inserts."],
      ["audio", "Keep narration conversational and believable."]
    ]),
    template("explainer", "Explainer", "explainer", ["youtube_shorts", "linkedin", "website"], [30, 60], [
      ["hook", "Start with the outcome and why it matters."],
      ["scene", "Use step-by-step visual proof."],
      ["visual", "Prioritize clear visual chapter beats without on-screen text."]
    ]),
    template("cinematic_product_reveal", "Cinematic Product Reveal", "cinematic_reveal", ["tiktok", "douyin", "instagram_reels", "website"], [15, 30], [
      ["hook", "Lead with atmosphere and product silhouette."],
      ["scene", "Use macro, texture, light, and motion cues."],
      ["claim", "Keep claims minimal and visual."]
    ]),
    template("founder_story", "Founder Story", "founder_story", ["linkedin", "youtube_shorts"], [35, 60], [
      ["hook", "Introduce the founder's tension or mission."],
      ["proof", "Bind the product to real user pain."],
      ["payoff", "End with an earned emotional or product payoff, not a text CTA."]
    ]),
    template("comparison", "Comparison", "comparison", ["tiktok", "douyin", "youtube_shorts", "website"], [20, 45], [
      ["hook", "Frame the before/after or old-way/new-way contrast."],
      ["claim", "Require proof for comparative claims."],
      ["visual", "Make comparison visible through staging, motion, and object placement without labels."]
    ]),
    template("testimonial", "Testimonial / Customer Proof", "testimonial", ["tiktok", "douyin", "instagram_reels", "youtube_shorts", "website"], [20, 45], [
      ["hook", "Open with the buyer objection or before-state in plain language."],
      ["proof", "Use reviewed customer proof, product evidence, or operator-approved testimonial facts only."],
      ["claim", "Keep testimonial claims conservative and explicitly review-bound."]
    ])
  ];

  public suggest(input: {
    readonly prompt: string;
    readonly intent: ShortPipelineIntent;
    readonly productBrief?: ProductUrlBrief;
    readonly preferredTemplateId?: string;
  }): readonly WorkflowTemplateSuggestion[] {
    const prompt = input.prompt.toLowerCase();
    return this.templates
      .map((templateItem) => {
        const reasons: string[] = [];
        let score = 0.2;
        if (input.preferredTemplateId === templateItem.templateId) {
          score += 0.5;
          reasons.push("operator selected this optional accelerator");
        }
        if (templateItem.platforms.includes(input.intent.platform)) {
          score += 0.25;
          reasons.push(`fits ${input.intent.platform}`);
        }
        if (templateItem.category === "product_ad" && input.productBrief) {
          score += 0.2;
          reasons.push("product brief available");
        }
        if (templateItem.category === "ugc_ad" && /ugc|creator|testimonial|authentic|review/i.test(prompt)) {
          score += 0.2;
          reasons.push("brief asks for creator-style trust");
        }
        if (templateItem.category === "testimonial" && /testimonial|customer story|customer proof|review|trust/i.test(prompt)) {
          score += 0.22;
          reasons.push("brief asks for testimonial or customer-proof trust");
        }
        if (templateItem.category === "explainer" && /explain|how|why|educat|training|demo/i.test(prompt)) {
          score += 0.2;
          reasons.push("brief asks for explanation");
        }
        if (templateItem.category === "cinematic_reveal" && /cinematic|premium|luxury|beautiful|reveal/i.test(prompt)) {
          score += 0.2;
          reasons.push("brief asks for cinematic reveal");
        }
        if (templateItem.category === "comparison" && /compare|versus|vs|better|before|after/i.test(prompt)) {
          score += 0.2;
          reasons.push("brief asks for comparison");
        }
        return {
          templateId: templateItem.templateId,
          label: templateItem.label,
          category: templateItem.category,
          score: Math.min(1, Number(score.toFixed(2))),
          reasons: reasons.length > 0 ? reasons : ["generic short-video accelerator"],
          usePolicy: "optional_accelerator" as const,
          planningHints: templateItem.planningHints
        };
      })
      .filter((item) => item.score >= 0.32 || input.preferredTemplateId === item.templateId)
      .sort((left, right) => right.score - left.score || left.templateId.localeCompare(right.templateId))
      .slice(0, 3);
  }
}

export class ShortPipelinePlanner {
  private readonly productExtractor = new ProductUrlBriefExtractor();
  private readonly brandKitEvaluator = new BrandKitEvaluator();
  private readonly channelStyleEvaluator = new ShortChannelStyleProfileEvaluator();
  private readonly templateRegistry = new WorkflowTemplateRegistry();
  private readonly approvalSystem = new ReviewApprovalSystem();
  private readonly shortDirectorPlanner = new ShortDirectorPlanner();
  private readonly viralIntelligencePlanner = new ShortViralIntelligencePlanner();
  private readonly agentGraphPlanner = new ShortAgentGraphPlanner();
  private readonly commercialReadinessPlanner = new ShortCommercialReadinessPlanner();
  private readonly visualBiblePlanner = new ShortVisualBiblePlanner();
  private readonly videoPipePlanner = new ShortVideoPipePlanner();

  public buildPlan(input: ShortPipelinePlanInput): ShortPipelinePlan {
    const generatedAt = input.generatedAt ?? new Date();
    const prompt = cleanText(input.userPrompt, 2000) ?? "";
    if (!input.projectId.trim()) {
      throw new Error("projectId is required for short-pipeline planning.");
    }
    if (!prompt && !input.product?.productUrl && !input.product?.snapshot) {
      throw new Error("Short pipeline requires a natural-language prompt, product URL, or product snapshot.");
    }
    const productBrief = this.productExtractor.build(input.product, prompt);
    const brandKitEvaluation = this.brandKitEvaluator.evaluate(input.brandKit, productBrief?.claimInventory ?? [], prompt);
    const channelStyleProfile = this.channelStyleEvaluator.evaluate(input.channelStyle);
    const intent = this.intent(input, prompt, productBrief, brandKitEvaluation);
    const audioPolicy = audioPolicyFor(input.audio, brandKitEvaluation);
    const visualTextPolicy = noVisibleTextPolicy();
    const mediaReferencePlan = mediaReferencePlanFor(input.mediaReferences ?? [], input.projectId, input.requestId);
    const referenceVideoLearning = input.referenceVideoLearning ??
      referenceVideoLearningFromSourceMedia(input.mediaReferences ?? [], mediaReferencePlan, prompt);
    const templateSuggestions = input.allowTemplateSuggestions === false
      ? []
      : this.templateRegistry.suggest({
          prompt,
          intent,
          ...(productBrief ? { productBrief } : {}),
          ...(input.preferredTemplateId ? { preferredTemplateId: input.preferredTemplateId } : {})
        });
    const selectedTemplate = input.preferredTemplateId
      ? templateSuggestions.find((item) => item.templateId === input.preferredTemplateId)
      : undefined;
    const suggestedTemplate = templateSuggestions[0];
    const planningTemplate = selectedTemplate ?? suggestedTemplate;
    const concepts = this.concepts(prompt, intent, productBrief, brandKitEvaluation, planningTemplate);
    const preliminaryScenes = this.scenes(prompt, intent, productBrief, concepts[0], planningTemplate);
    const preliminaryViralIntelligence = this.viralIntelligencePlanner.build({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      prompt,
      generatedAt,
      intent,
      ...(productBrief ? { productBrief } : {}),
      ...(brandKitEvaluation ? { brandKitEvaluation } : {}),
      ...(channelStyleProfile ? { channelStyleProfile } : {}),
      ...(selectedTemplate ? { selectedTemplate } : {}),
      concepts,
      scenes: preliminaryScenes,
      ...(referenceVideoLearning ? { referenceVideoLearning } : {})
    });
    const preliminaryAgentGraphOutput = this.agentGraphPlanner.build({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      generatedAt,
      prompt,
      intent,
      ...(productBrief ? { productBrief } : {}),
      ...(brandKitEvaluation ? { brandKitEvaluation } : {}),
      ...(channelStyleProfile ? { channelStyleProfile } : {}),
      ...(selectedTemplate ? { selectedTemplate } : {}),
      ...(referenceVideoLearning ? { referenceVideoLearning } : {}),
      concepts,
      scenes: preliminaryScenes,
      viralIntelligence: preliminaryViralIntelligence
    });
    const scenes = this.candidateDrivenScenes({
      prompt,
      intent,
      productBrief,
      templateSuggestion: planningTemplate,
      concepts,
      preliminaryScenes,
      preliminaryAgentGraph: preliminaryAgentGraphOutput.graphRun
    });
    const viralIntelligence = this.viralIntelligencePlanner.build({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      prompt,
      generatedAt,
      intent,
      ...(productBrief ? { productBrief } : {}),
      ...(brandKitEvaluation ? { brandKitEvaluation } : {}),
      ...(channelStyleProfile ? { channelStyleProfile } : {}),
      ...(selectedTemplate ? { selectedTemplate } : {}),
      concepts,
      scenes,
      ...(referenceVideoLearning ? { referenceVideoLearning } : {})
    });
    const referenceRemakeBlueprint = referenceRemakeBlueprintFor(input, prompt, viralIntelligence, referenceVideoLearning, mediaReferencePlan);
    const visualBiblePlan = this.visualBiblePlanner.build({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      prompt,
      intent,
      ...(productBrief ? { productBrief } : {}),
      scenes,
      mediaReferencePlan,
      ...(referenceRemakeBlueprint ? { referenceRemakeBlueprint } : {}),
      ...(input.visualBible ? { visualBible: input.visualBible } : {})
    });
    const agentGraphOutput = this.agentGraphPlanner.build({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      generatedAt,
      prompt,
      intent,
      ...(productBrief ? { productBrief } : {}),
      ...(brandKitEvaluation ? { brandKitEvaluation } : {}),
      ...(channelStyleProfile ? { channelStyleProfile } : {}),
      ...(selectedTemplate ? { selectedTemplate } : {}),
      ...(referenceVideoLearning ? { referenceVideoLearning } : {}),
      concepts,
      scenes,
      viralIntelligence
    });
    const agentGraph = agentGraphOutput.graphRun;
    const seedancePromptPack = agentGraphOutput.seedancePromptPack;
    const seedanceRouting = seedanceRoutingFor({
      input,
      intent,
      mediaReferencePlan,
      scenes,
      audioPolicy,
      viralIntelligence,
      referenceRemakeBlueprint,
      visualBiblePlan
    });
    const directorPlan = this.shortDirectorPlanner.build({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      userPrompt: prompt,
      intent,
      ...(productBrief ? { productBrief } : {}),
      ...(brandKitEvaluation ? { brandKitEvaluation } : {}),
      ...(channelStyleProfile ? { channelStyleProfile } : {}),
      ...(selectedTemplate ? { selectedTemplate } : {}),
      concepts,
      scenes,
      viralIntelligence,
      audioPolicy,
      visualTextPolicy
    });
    const videoPipePlan = this.videoPipePlanner.build({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      intent,
      mediaReferencePlan,
      visualBiblePlan,
      seedanceRouting,
      directorPlan,
      ...(referenceRemakeBlueprint ? { referenceRemakeBlueprint } : {})
    });
    const checkpoints = this.checkpoints(scenes, intent, productBrief, brandKitEvaluation, audioPolicy, visualTextPolicy, mediaReferencePlan, visualBiblePlan);
    const reviewApproval = this.approvalSystem.evaluate({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      gate: "pre_render",
      generatedAt,
      checkpoints
    });
    const status = productBrief?.status === "blocked" || brandKitEvaluation?.status === "blocked" || viralIntelligence.status === "blocked" || agentGraph.status === "blocked" || reviewApproval.status === "blocked"
      ? "blocked"
      : reviewApproval.status === "changes_requested" || reviewApproval.status === "rejected"
      ? "changes_requested"
      : "approval_required";
    const planId = createStableId(
      "short_plan",
      [
        input.projectId,
        input.requestId ?? "",
        prompt,
        productBrief?.briefId ?? "",
        brandKitEvaluation?.brandKitId ?? "",
        selectedTemplate?.templateId ?? templateSuggestions[0]?.templateId ?? "custom"
      ].join(":")
    );

    const planWithoutReadiness: Omit<ShortPipelinePlan, "commercialReadiness"> = {
      schemaVersion: "cinejelly.short-pipeline-plan.v1",
      planId,
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      generatedAt,
      status,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      intent,
      ...(productBrief ? { productBrief } : {}),
      ...(brandKitEvaluation ? { brandKitEvaluation } : {}),
      ...(channelStyleProfile ? { channelStyleProfile } : {}),
      templateSuggestions,
      ...(selectedTemplate ? { selectedTemplate } : {}),
      templatePolicy: selectedTemplate ? "operator_selected_optional" : templateSuggestions.length > 0 ? "suggested_optional" : "none",
      dynamicWorkflowRequired: true,
      audioPolicy,
      visualTextPolicy,
      directorPlan,
      concepts,
      scenes,
      mediaReferencePlan,
      visualBiblePlan,
      videoPipePlan,
      seedanceRouting,
      viralIntelligence,
      ...(referenceRemakeBlueprint ? { referenceRemakeBlueprint } : {}),
      agentGraph,
      seedancePromptPack,
      reviewApproval,
      releaseGateSummary: {
        canRenderAfterApproval: reviewApproval.releaseGateSummary.canRenderAfterReview && status !== "blocked" && viralIntelligence.status !== "blocked" && agentGraph.status !== "blocked" && !visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved,
        canUseAsNoSpendPlanningEvidence: status !== "blocked" && viralIntelligence.status !== "blocked" && agentGraph.status !== "blocked",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: status === "blocked" || viralIntelligence.status === "blocked" || agentGraph.status === "blocked"
          ? "Short-pipeline plan is blocked by unsafe URL, product, brand-kit, reference, or agent-graph evidence."
          : "Short-pipeline plan is planning evidence only; render requires accepted review checkpoints, quota/cost gates, artifact validation, and business-readiness evidence."
      },
      nextActions: [
        ...this.nextActions(status, productBrief, brandKitEvaluation, reviewApproval.status, viralIntelligence.status),
        ...agentGraph.nextActions.slice(0, 3)
      ]
    };
    const originalInput = {
      ...(input.product ? { product: input.product } : {}),
      ...(input.channelStyle ? { channelStyle: input.channelStyle } : {}),
      ...(input.mediaReferences ? { mediaReferences: input.mediaReferences } : {}),
      ...(input.visualBible ? { visualBible: input.visualBible } : {}),
      ...(referenceVideoLearning ? { referenceVideoLearning } : {})
    };
    const commercialReadiness = this.commercialReadinessPlanner.build({
      plan: planWithoutReadiness,
      ...(Object.keys(originalInput).length > 0 ? { originalInput } : {})
    });
    return {
      ...planWithoutReadiness,
      commercialReadiness,
      nextActions: [
        ...planWithoutReadiness.nextActions,
        ...commercialReadiness.nextActions.slice(0, 4)
      ]
    };
  }

  private intent(
    input: ShortPipelinePlanInput,
    prompt: string,
    productBrief: ProductUrlBrief | undefined,
    brandKitEvaluation: BrandKitEvaluation | undefined
  ): ShortPipelineIntent {
    const platform = input.targetPlatform ?? inferPlatform(prompt);
    const requestedDurationSeconds = input.targetDurationSeconds ?? inferDuration(prompt);
    // An explicit request over the short-form band opts into the long-form/series band
    // (drama episodes, production bibles). It is still hard-clamped to the sequence max
    // below, and provider spend is bounded by the cost gate + maxCostUsd — not by this band.
    const maxDurationSeconds = input.visualBible?.mode === "production_bible" || requestedDurationSeconds > SHORT_MAX_COMMERCIAL_RENDER_SECONDS
      ? SHORT_MAX_SEQUENCE_RENDER_SECONDS
      : SHORT_MAX_COMMERCIAL_RENDER_SECONDS;
    const targetDurationSeconds = clampDuration(
      requestedDurationSeconds,
      SHORT_MIN_COMMERCIAL_RENDER_SECONDS,
      maxDurationSeconds
    );
    const businessGoal = inferGoal(prompt, productBrief);
    const audience = cleanText(productBrief?.targetBuyer, 160) ?? inferAudience(prompt);
    const offer = inferOffer(prompt, productBrief);
    return {
      businessGoal,
      audience,
      platform,
      emotion: inferEmotion(`${prompt} ${brandKitEvaluation?.tone ?? ""}`),
      targetDurationSeconds,
      aspectRatio: input.targetAspectRatio ?? (platform === "website" || platform === "linkedin" ? "16:9" : "9:16"),
      ...(offer ? { offer } : {}),
      missingInputs: [
        ...(!productBrief ? ["product_facts"] : productBrief.missingFields),
        ...(!brandKitEvaluation ? ["brand_kit"] : brandKitEvaluation.status === "ready" ? [] : ["brand_kit_review"]),
        "human_review_decisions"
      ],
      inferredFrom: [
        ...(prompt ? ["natural_language_prompt"] : []),
        ...(productBrief ? ["product_url_brief"] : []),
        ...(brandKitEvaluation ? ["brand_kit"] : [])
      ]
    };
  }

  private concepts(
    prompt: string,
    intent: ShortPipelineIntent,
    productBrief: ProductUrlBrief | undefined,
    brandKitEvaluation: BrandKitEvaluation | undefined,
    templateSuggestion: WorkflowTemplateSuggestion | undefined
  ): readonly ShortPipelineConcept[] {
    const productName = productBrief?.title ?? "the product";
    const primaryBenefit = productBrief?.benefits[0] ?? intent.businessGoal;
    const tone = brandKitEvaluation?.tone ?? intent.emotion.replace(/_/g, " ");
    const rawConcepts: readonly ShortPipelineConcept[] = [
      {
        conceptId: createStableId("concept", `${productName}:proof:${primaryBenefit}`),
        label: "Pattern-interrupt proof story",
        angle: `Open with a specific buyer tension, then prove ${productName} through one visible state change and one clean payoff.`,
        hook: hookFor(intent, productName, primaryBenefit, templateSuggestion),
        riskNotes: riskNotes(productBrief, brandKitEvaluation)
      },
      {
        conceptId: createStableId("concept", `${productName}:tone:${tone}:${prompt}`),
        label: "Brand-tone native short",
        angle: `Make the ad feel ${tone} while keeping claims reviewable and the visual story clear without on-screen text.`,
        hook: `${productName} in ${intent.targetDurationSeconds} seconds: the buyer problem, the proof, and the next step.`,
        riskNotes: riskNotes(productBrief, brandKitEvaluation)
      },
      {
        conceptId: createStableId("concept", `${productName}:ugc:${intent.audience}:${primaryBenefit}`),
        label: "Native UGC objection breaker",
        angle: `Let a believable creator voice name the viewer objection, show ${productName} in use, then make the payoff feel earned.`,
        hook: `POV: you want ${primaryBenefit}, but you do not want another overhyped ad.`,
        riskNotes: riskNotes(productBrief, brandKitEvaluation)
      },
      {
        conceptId: createStableId("concept", `${productName}:demo:${intent.targetDurationSeconds}:${primaryBenefit}`),
        label: "Demo-first conversion arc",
        angle: `Start with the outcome, demonstrate one step, show proof, and make the payoff feel like the natural next action.`,
        hook: `Watch ${productName} make one benefit visible before the final payoff.`,
        riskNotes: riskNotes(productBrief, brandKitEvaluation)
      },
      {
        conceptId: createStableId("concept", `${productName}:cinematic:${tone}:${primaryBenefit}`),
        label: "Cinematic payoff reveal",
        angle: `Use a premium visual payoff, macro detail, and restrained claim language so the short feels high-quality without losing clarity.`,
        hook: `${productName}, revealed through the result first.`,
        riskNotes: riskNotes(productBrief, brandKitEvaluation)
      }
    ];
    const promptLower = prompt.toLowerCase();
    const preferred = rawConcepts.filter((concept) => {
      if (/ugc|review|creator|native|testimonial/i.test(promptLower)) return /UGC|native|proof/i.test(concept.label);
      if (/demo|how|tutorial|show/i.test(promptLower)) return /Demo|proof/i.test(concept.label);
      if (/cinematic|premium|luxury|reveal/i.test(promptLower)) return /Cinematic|proof|Brand-tone/i.test(concept.label);
      return true;
    });
    return uniqueConcepts(preferred.length >= 3 ? preferred : rawConcepts, 5);
  }

  private scenes(
    prompt: string,
    intent: ShortPipelineIntent,
    productBrief: ProductUrlBrief | undefined,
    concept: ShortPipelineConcept | undefined,
    templateSuggestion: WorkflowTemplateSuggestion | undefined
  ): readonly ShortPipelineScenePlan[] {
    const productName = productBrief?.title ?? "the product";
    const benefit = productBrief?.benefits[0] ?? intent.businessGoal;
    const claimIds = productBrief?.claimInventory.slice(0, 2).map((claim) => claim.claimId) ?? [];
    const templateCue = templateSuggestion ? ` Optional accelerator: ${templateSuggestion.label}.` : "";
    const roles = sceneRolesFor(prompt, intent, templateSuggestion);
    return roles.map((role, index) => scene(
      role,
      index + 1,
      sceneGoalFor(role, productName, benefit, templateCue),
      sceneNarrationFor(role, productName, benefit, concept),
      sceneCaptionFor(role),
      role === "hook" ? claimIds.slice(0, 1) : role === "proof" ? claimIds : []
    ));
  }

  private candidateDrivenScenes(input: {
    readonly prompt: string;
    readonly intent: ShortPipelineIntent;
    readonly productBrief: ProductUrlBrief | undefined;
    readonly templateSuggestion: WorkflowTemplateSuggestion | undefined;
    readonly concepts: readonly ShortPipelineConcept[];
    readonly preliminaryScenes: readonly ShortPipelineScenePlan[];
    readonly preliminaryAgentGraph: NonNullable<ShortPipelinePlan["agentGraph"]>;
  }): readonly ShortPipelineScenePlan[] {
    const selectedCandidate = input.preliminaryAgentGraph.candidates.find((candidate) =>
      candidate.candidateId === input.preliminaryAgentGraph.selectedCandidateId
    );
    if (!selectedCandidate || selectedCandidate.sceneRoles.length === 0) {
      return input.preliminaryScenes;
    }
    const productName = input.productBrief?.title ?? "the product";
    const benefit = input.productBrief?.benefits[0] ?? input.intent.businessGoal;
    const claimIds = input.productBrief?.claimInventory.slice(0, 2).map((claim) => claim.claimId) ?? [];
    const templateCue = input.templateSuggestion ? ` Optional accelerator: ${input.templateSuggestion.label}.` : "";
    const sourceConcept = selectedCandidate.sourceConceptId
      ? input.concepts.find((concept) => concept.conceptId === selectedCandidate.sourceConceptId)
      : undefined;
    const concept: ShortPipelineConcept = sourceConcept ?? {
      conceptId: selectedCandidate.candidateId,
      label: selectedCandidate.label,
      angle: selectedCandidate.storyArc,
      hook: selectedCandidate.hook,
      riskNotes: []
    };
    const roles = normalizeCandidateSceneRoles(selectedCandidate.sceneRoles, input.prompt, input.intent, input.templateSuggestion);
    return roles.map((role, index) => scene(
      role,
      index + 1,
      candidateSceneGoalFor(role, productName, benefit, selectedCandidate.storyArc, templateCue),
      candidateSceneNarrationFor(role, productName, benefit, concept, selectedCandidate.storyArc),
      candidateSceneCaptionFor(role),
      role === "hook" ? claimIds.slice(0, 1) : role === "proof" ? claimIds : []
    ));
  }

  private checkpoints(
    scenes: readonly ShortPipelineScenePlan[],
    intent: ShortPipelineIntent,
    productBrief: ProductUrlBrief | undefined,
    brandKitEvaluation: BrandKitEvaluation | undefined,
    audioPolicy: ShortPipelineAudioPolicy,
    visualTextPolicy: ShortPipelineVisualTextPolicy,
    mediaReferencePlan: readonly ShortMediaReferencePlan[],
    visualBiblePlan: ShortVisualBiblePlan
  ): readonly ReviewApprovalCheckpointInput[] {
    const checkpoints: ReviewApprovalCheckpointInput[] = scenes.map((sceneItem) => ({
      surface: "scene",
      label: `Approve short scene ${sceneItem.order}: ${sceneItem.role}`,
      subjectId: sceneItem.sceneId,
      required: true,
      evidence: {
        sceneRole: sceneItem.role,
        claimCount: sceneItem.claimIds.length
      }
    }));
    checkpoints.push({
      surface: "audio",
      label: "Approve short audio mode, narration language, voice tone, BGM, ambience, and SFX plan",
      subjectId: "short_audio_plan",
      required: true,
      issueCodes: brandKitEvaluation?.status === "review_required" ? ["brand_voice_review_required"] : [],
      evidence: {
        targetDurationSeconds: intent.targetDurationSeconds,
        sceneCount: scenes.length,
        audioMode: audioPolicy.renderAudioMode,
        requestedAudioPolicyMode: audioPolicy.mode,
        generatedAudioIntentEnabled: audioPolicy.generatedAudioIntentEnabled,
        ...(audioPolicy.language ? { language: audioPolicy.language } : {}),
        ...(audioPolicy.languageLabel ? { languageLabel: audioPolicy.languageLabel } : {})
      }
    });
    checkpoints.push({
      surface: "caption",
      label: "Approve no visible text, no captions, and no CTA-card policy",
      subjectId: "short_visual_text_policy",
      required: true,
      evidence: {
        sceneCount: scenes.length,
        allowOnScreenText: visualTextPolicy.allowOnScreenText,
        allowCaptions: visualTextPolicy.allowCaptions,
        allowCtaCards: visualTextPolicy.allowCtaCards,
        allowTextOverlays: visualTextPolicy.allowTextOverlays
      }
    });
    for (const reference of mediaReferencePlan) {
      checkpoints.push({
        surface: "scene",
        label: `Approve media reference: ${reference.label}`,
        subjectId: reference.referenceId,
        required: true,
        decision: reference.status === "blocked" ? "blocked" : "pending",
        issueCodes: [
          ...(reference.status === "blocked" ? ["media_reference_blocked"] : []),
          ...(reference.rightsStatus !== "operator_approved" ? ["media_rights_review_required"] : []),
          ...(reference.includeInProviderHandoff ? [] : ["provider_reference_not_ready"])
        ],
        evidence: {
          inputRole: reference.inputRole,
          promptRole: reference.promptRole,
          providerKind: reference.providerKind,
          uriPolicy: reference.uriPolicy,
          rightsStatus: reference.rightsStatus,
          promptTag: reference.promptTag,
          includeInProviderHandoff: reference.includeInProviderHandoff
        }
      });
    }
    if (visualBiblePlan.status !== "not_needed") {
      checkpoints.push({
        surface: "scene",
        label: `Approve visual bible workflow: ${visualBiblePlan.recommendedPipe}`,
        subjectId: visualBiblePlan.planId,
        required: visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved,
        decision: "pending",
        issueCodes: [
          ...(visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved ? ["visual_bible_assets_required_before_render"] : []),
          ...visualBiblePlan.warnings.slice(0, 4)
        ],
        evidence: {
          status: visualBiblePlan.status,
          requestedMode: visualBiblePlan.requestedMode,
          recommendedPipe: visualBiblePlan.recommendedPipe,
          durationBand: visualBiblePlan.durationBand,
          assetPlanCount: visualBiblePlan.assetPlans.length,
          boardCount: visualBiblePlan.sequencePlan.boardCount,
          targetClipCount: visualBiblePlan.sequencePlan.targetClipCount,
          blocksRenderUntilAssetsApproved: visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved
        }
      });
    }
    for (const claim of productBrief?.claimInventory ?? []) {
      checkpoints.push({
        surface: "claim",
        label: `Approve claim: ${claim.text}`,
        subjectId: claim.claimId,
        required: true,
        decision: brandKitEvaluation?.issues.some((issueItem) =>
          issueItem.code === "forbidden_claim_present" && issueItem.subject === claim.claimId
        ) ? "changes_requested" : "pending",
        issueCodes: [
          ...(claim.substantiationRequired ? ["claim_substantiation_required"] : []),
          ...(claim.risk === "high" ? ["high_risk_claim"] : [])
        ],
        evidence: {
          risk: claim.risk,
          confidence: claim.confidence
        }
      });
    }
    if (!productBrief || productBrief.claimInventory.length === 0) {
      checkpoints.push({
        surface: "claim",
        label: "Approve that the short video contains no unsupported commercial claims",
        subjectId: "claim_policy_default",
        required: true,
        evidence: {
          claimInventoryCount: productBrief?.claimInventory.length ?? 0
        }
      });
    }
    return checkpoints;
  }

  private nextActions(
    status: ShortPipelinePlan["status"],
    productBrief: ProductUrlBrief | undefined,
    brandKitEvaluation: BrandKitEvaluation | undefined,
    reviewStatus: string,
    viralStatus: string
  ): readonly string[] {
    if (status === "blocked") {
      return [
        "Fix blocked product URL or brand-kit evidence before using this plan for render.",
        "Regenerate the short-pipeline plan after unsafe URLs, local paths, credentials, or forbidden claims are removed."
      ];
    }
    return [
      ...(productBrief?.status === "review_required" ? ["Confirm product facts, image rights, and claim substantiation."] : []),
      ...(brandKitEvaluation?.status === "review_required" ? ["Complete brand-kit tone, claim policy, and asset approval review."] : []),
      ...(viralStatus === "review_required" ? ["Review short viral strategy, reference-video guardrails, concept score, and scene directives before render."] : []),
      reviewStatus === "approval_required" || reviewStatus === "changes_requested"
        ? "Collect human scene, audio, no-visible-text, and claim approval before render."
        : "Proceed only through render cost/quota gates after approval.",
      "Keep templates optional; user natural-language edits can replace or ignore every suggested accelerator."
    ];
  }
}

function referenceVideoLearningFromSourceMedia(
  references: readonly ShortMediaReferenceInput[],
  mediaReferencePlan: readonly ShortMediaReferencePlan[],
  prompt: string
): ShortReferenceVideoLearningInput | undefined {
  const inputReference = references.find((reference) => reference.role === "source_video");
  const plannedReference = mediaReferencePlan.find((reference) => reference.promptRole === "source_video_structure");
  if (!inputReference && !plannedReference) {
    return undefined;
  }
  const note = cleanText(inputReference?.description, 240);
  const label = cleanText(inputReference?.label ?? plannedReference?.label, 120) ?? "Uploaded trend/reference video";
  const sourceUrl = cleanSourceVideoLearningUrl(inputReference?.uri);
  const sceneCount = inferSourceSceneCount(`${prompt} ${note ?? ""}`);
  return {
    sourceLabel: label,
    ...(sourceUrl ? { sourceUrl } : {}),
    summary: uniqueClean([
      "User supplied a source video for Video Remake trend intake.",
      note,
      "Learn edit rhythm, acting beats, camera grammar, retention timing, audio energy, and payoff shape while replacing KOL, product, background, script, claims, and CTA."
    ], 3, 220).join(" "),
    hook: "Preserve the source video's first-second viewer job, rewritten around the user's product, KOL, and proof.",
    durationSeconds: inferDuration(prompt),
    ...(sceneCount ? { sceneCount } : {}),
    pacing: "Derive scene timing, cut density, reveal order, and payoff timing from the uploaded/source video.",
    cameraStyle: "Derive camera path, framing, lens distance, and endpoint composition while replacing creator, product, background, and props.",
    captionStyle: "Derive visual rhythm only; keep generated output free of visible captions, subtitles, labels, watermarks, and CTA cards.",
    audioStyle: "Derive tempo and energy only; use new guided/licensed voice, music, and sound design.",
    retentionPattern: "Carry source retention mechanics into a new product-proof story with user-owned assets.",
    ctaStyle: "Adapt the payoff action to the user's offer and approved claims.",
    visualMotifs: uniqueClean([
      plannedReference?.label,
      note,
      "source-video beat map"
    ], 4, 80),
    doNotCopy: true
  };
}

function cleanSourceVideoLearningUrl(value: string | undefined): string | undefined {
  const uri = cleanText(value, 600);
  if (!uri?.startsWith("https://")) {
    return undefined;
  }
  return uri;
}

function inferSourceSceneCount(value: string): number | undefined {
  const match = /(?:scene|beat|shot)s?\s*[:=-]?\s*(\d{1,2})|(\d{1,2})\s*(?:scene|beat|shot)s?/i.exec(value);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(12, Math.max(1, Math.round(parsed))) : undefined;
}

function referenceRemakeBlueprintFor(
  input: ShortPipelinePlanInput,
  prompt: string,
  viralIntelligence: ShortPipelinePlan["viralIntelligence"],
  referenceVideoLearning: ShortReferenceVideoLearningInput | undefined,
  mediaReferencePlan: readonly ShortMediaReferencePlan[]
): ShortReferenceRemakeBlueprint | undefined {
  const reference = viralIntelligence.referenceVideoPattern;
  const learning = referenceVideoLearning;
  const sourceVideoReference = mediaReferencePlan.find((referenceItem) => referenceItem.promptRole === "source_video_structure");
  if (!reference && !learning && !sourceVideoReference) {
    return undefined;
  }
  const copyRiskOrCloseRemake = learning?.doNotCopy === false || hasCopyRiskIntent([
    prompt,
    learning?.summary ?? "",
    learning?.hook ?? "",
    learning?.pacing ?? ""
  ].join(" "));
  const mode = copyRiskOrCloseRemake ? "rights_cleared_close_remake" : "structure_remake";
  const sourceVideoBlocked = sourceVideoReference?.status === "blocked";
  const sourceVideoReviewRequired = Boolean(sourceVideoReference && sourceVideoReference.status !== "ready");
  const status = reference?.safetyStatus === "blocked" || sourceVideoBlocked
    ? "blocked"
    : reference?.safetyStatus === "review_required" || copyRiskOrCloseRemake || sourceVideoReviewRequired
      ? "review_required"
      : "ready";
  const sourceSafetyStatus = reference?.safetyStatus ??
    (sourceVideoReference
      ? sourceVideoReference.status === "blocked"
        ? "blocked"
        : sourceVideoReference.status === "ready"
          ? "learned_pattern"
          : "review_required"
      : "not_provided");
  const fidelityTarget = mode === "rights_cleared_close_remake"
    ? "rights_cleared_close"
    : "structure_locked";
  const trendVideoIntakeMode = sourceVideoReference
    ? "uploaded_or_clean_https_reference"
    : "operator_summary_only";
  const lockedElements = uniqueClean([
    "first-second hook job and viewer tension",
    reference ? `pacing map: ${reference.pacingPattern}` : cleanText(learning?.pacing, 180),
    reference ? `camera grammar: ${reference.cameraPattern}` : cleanText(learning?.cameraStyle, 180),
    reference ? `retention mechanics: ${reference.retentionMechanics.join(" | ")}` : cleanText(learning?.retentionPattern, 180),
    reference ? `payoff shape: ${reference.ctaPattern}` : cleanText(learning?.ctaStyle, 180),
    sourceVideoReference ? `source-video reference scope: ${sourceVideoReference.transferScope}` : undefined,
    "scene rhythm and acting beats, not source-owned expression"
  ], 8, 220);
  const adherenceTargets = uniqueClean([
    "source beat order and approximate timeline pacing",
    "cut density and visual-information cadence",
    "camera grammar, lens distance, movement direction, and endpoint framing",
    "KOL performance rhythm, gesture timing, eye-line, and reaction shape",
    "audio energy envelope and narration rhythm with new licensed/generated audio",
    "final payoff timing and before/after state logic",
    mode === "rights_cleared_close_remake"
      ? "rights-cleared close remake may stay closer after human similarity review"
      : "structure-locked remake must preserve originality beyond reusable format"
  ], 8, 220);
  const sourceBeatMap = sourceBeatMapFor(reference, learning, input.targetDurationSeconds);
  const providerExecutionPlan = uniqueClean([
    trendVideoIntakeMode === "uploaded_or_clean_https_reference"
      ? "Use the source-video reference as scoped motion/camera/structure guidance after rights review."
      : "Use the operator summary as the source beat map when no video asset is attached.",
    "Bind KOL identity and product geometry before any source-video, motion, camera, style, or audio reference.",
    "Map every generated scene to the source beat map while replacing script, props, claims, background, product, and CTA.",
    "Use @image identity/product/background references as higher priority than @video structure references.",
    "Use new guided/licensed voice and audio; never transfer source music, source voice identity, or source captions.",
    "Keep no-visible-text policy unless an operator-approved UI policy changes it."
  ], 8, 240);
  const remakeGuardrails = uniqueClean([
    ...(reference?.originalityGuardrails ?? []),
    "replace KOL, product, offer, setting, background, voice, audio, and claims with user-approved inputs",
    "derive edit rhythm and performance beats without reusing source transcript, captions, music, watermarks, logos, face identity, or private assets",
    "rights-cleared close remake requests stay review-required until an operator confirms source rights and similarity risk",
    "video output must feel native to the user's niche, product proof, and platform instead of repeating a fixed template"
  ], 10, 240);
  const sourceLabel = cleanText(learning?.sourceLabel ?? reference?.sourceLabel ?? sourceVideoReference?.label, 120);
  const sourceHost = reference?.sourceHost ?? sourceVideoReference?.sourceHost;
  const blueprintId = createStableId(
    "short_remake_blueprint",
    [
      input.projectId,
      input.requestId ?? "",
      reference?.patternId ?? "reference_summary_only",
      mode,
      status,
      trendVideoIntakeMode,
      lockedElements.join("|"),
      sourceBeatMap.join("|"),
      remakeGuardrails.join("|")
    ].join(":")
  );
  return {
    schemaVersion: "cinejelly.short-reference-remake-blueprint.v1",
    blueprintId,
    userFacingModeLabel: "Video Remake",
    mode,
    status,
    ...(reference?.patternId ? { sourcePatternId: reference.patternId } : {}),
    sourceSafetyStatus,
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(sourceHost ? { sourceHost } : {}),
    fidelityTarget,
    trendVideoIntakeMode,
    replacementSlots: [
      "KOL/creator",
      "product or offer",
      "background or setting",
      "voiceover and audio bed",
      "proof props and product evidence",
      "CTA or payoff"
    ],
    lockedElements,
    adherenceTargets,
    sourceBeatMap,
    providerExecutionPlan,
    remakeGuardrails,
    reviewRequiredBeforeRender: true,
    canUseAfterReview: status !== "blocked"
  };
}

function sourceBeatMapFor(
  reference: ShortPipelinePlan["viralIntelligence"]["referenceVideoPattern"] | undefined,
  learning: ShortReferenceVideoLearningInput | undefined,
  targetDurationSeconds: number | undefined
): readonly string[] {
  const timing = cleanText(reference?.pacingPattern ?? learning?.pacing, 420);
  const retention = cleanText(
    reference?.retentionMechanics.join(" | ") ?? learning?.retentionPattern,
    320
  );
  const hook = cleanText(reference?.hookPattern ?? learning?.hook, 220);
  const camera = cleanText(reference?.cameraPattern ?? learning?.cameraStyle, 220);
  const payoff = cleanText(reference?.ctaPattern ?? learning?.ctaStyle, 180);
  const rawBeats = timing
    ? timing
        .split(/\s*(?:,|;|\||>|\bthen\b|\band then\b)\s*/i)
        .map((item) => cleanText(item, 140))
    : [];
  return uniqueClean([
    hook ? `hook: ${hook}` : "hook: match the source viewer job in the first beat",
    ...rawBeats,
    camera ? `camera: ${camera}` : undefined,
    retention ? `retention: ${retention}` : undefined,
    payoff ? `payoff: ${payoff}` : undefined,
    typeof targetDurationSeconds === "number" && Number.isFinite(targetDurationSeconds) && targetDurationSeconds > 0
      ? `target timeline: ${Number(targetDurationSeconds.toFixed(2))}s total`
      : undefined
  ], 10, 180);
}

function mediaReferencePlanFor(
  references: readonly ShortMediaReferenceInput[],
  projectId: string,
  requestId: string | undefined
): readonly ShortMediaReferencePlan[] {
  const tagCounts: Partial<Record<"image" | "video" | "audio", number>> = {};
  return references.slice(0, 12).map((reference, index) => {
    const role = normalizedMediaRole(reference.role);
    const providerKind = mediaProviderKindFor(reference, role);
    const promptTagKind = promptReferenceTagKind(providerKind);
    tagCounts[promptTagKind] = (tagCounts[promptTagKind] ?? 0) + 1;
    const promptTag = `@${promptTagKind}${tagCounts[promptTagKind]}`;
    const uri = cleanText(reference.uri, 600) ?? "";
    const uriEvidence = mediaUriEvidence(uri);
    const rightsStatus = reference.rightsStatus ?? "unknown";
    const sourceVideoProviderEligible = role.promptRole === "source_video_structure" &&
      rightsStatus === "operator_approved" &&
      uriEvidence.status === "ready" &&
      uriEvidence.providerReady;
    const issues = uniqueClean([
      ...(uriEvidence.status === "blocked" ? ["unsafe_or_private_media_reference"] : []),
      ...(rightsStatus !== "operator_approved" ? ["media_rights_review_required"] : []),
      ...(role.promptRole === "source_video_structure" && !sourceVideoProviderEligible
        ? ["source_video_structure_is_planning_only_until_live_analysis_or_rights_review"]
        : []),
      ...(sourceVideoProviderEligible ? ["source_video_provider_handoff_requires_similarity_review"] : [])
    ], 6, 120);
    const status: ShortMediaReferencePlanStatus = uriEvidence.status === "blocked"
      ? "blocked"
      : rightsStatus === "operator_approved"
        ? "ready"
        : "review_required";
    const label = cleanText(reference.label, 120) ?? mediaRoleLabel(role.inputRole, index);
    const referenceId = createStableId(
      "short_media_ref",
      [
        projectId,
        requestId ?? "",
        role.inputRole,
        role.promptRole,
        providerKind,
        uriEvidence.uriSha256 ?? uriEvidence.providerAssetId ?? "",
        label
      ].join(":")
    );

    return {
      schemaVersion: "cinejelly.short-media-reference-plan.v1",
      referenceId,
      inputRole: role.inputRole,
      promptRole: role.promptRole,
      providerKind,
      label,
      promptTag,
      status,
      rightsStatus,
      priority: reference.priority ?? (role.promptRole === "identity" || role.promptRole === "product" ? "primary" : "supporting"),
      uriPolicy: uriEvidence.uriPolicy,
      ...(uriEvidence.uriSha256 ? { uriSha256: uriEvidence.uriSha256 } : {}),
      ...(uriEvidence.sourceHost ? { sourceHost: uriEvidence.sourceHost } : {}),
      ...(uriEvidence.providerUri ? { providerUri: uriEvidence.providerUri } : {}),
      ...(uriEvidence.providerAssetId ? { providerAssetId: uriEvidence.providerAssetId } : {}),
      includeInProviderHandoff: status === "ready" &&
        uriEvidence.status === "ready" &&
        uriEvidence.providerReady &&
        (role.promptRole !== "source_video_structure" || sourceVideoProviderEligible),
      transferScope: mediaTransferScope(role.promptRole, promptTag, cleanText(reference.description, 160)),
      doNotTransfer: mediaDoNotTransfer(role.promptRole),
      issues
    };
  });
}

function seedanceRoutingFor(input: {
  readonly input: ShortPipelinePlanInput;
  readonly intent: ShortPipelineIntent;
  readonly mediaReferencePlan: readonly ShortMediaReferencePlan[];
  readonly scenes: readonly ShortPipelineScenePlan[];
  readonly audioPolicy: ShortPipelineAudioPolicy;
  readonly viralIntelligence: ShortPipelinePlan["viralIntelligence"];
  readonly referenceRemakeBlueprint: ShortReferenceRemakeBlueprint | undefined;
  readonly visualBiblePlan: ShortVisualBiblePlan;
}): ShortSeedanceRoutingPlan {
  const readyReferences = input.mediaReferencePlan.filter((reference) => reference.status !== "blocked");
  const providerReadyReferences = readyReferences.filter((reference) => reference.includeInProviderHandoff);
  const hasSourceOrMotion = Boolean(input.referenceRemakeBlueprint) ||
    readyReferences.some((reference) =>
      reference.promptRole === "source_video_structure" ||
      reference.promptRole === "motion" ||
      reference.promptRole === "camera" ||
      reference.providerKind === "video"
    ) ||
    Boolean(input.viralIntelligence.referenceVideoPattern);
  const hasVisualBibleSequence = input.visualBiblePlan.status !== "not_needed";
  const routableReferenceCount = readyReferences.filter((reference) => reference.promptRole !== "source_video_structure").length;
  const imageReferenceCount = readyReferences.filter((reference) => isImageLikeProviderKind(reference.providerKind)).length;
  const recommendedProviderMode: ShortSeedanceRoutingPlan["recommendedProviderMode"] = hasSourceOrMotion || hasVisualBibleSequence || imageReferenceCount >= 2
    ? "reference_to_video"
    : imageReferenceCount === 1
      ? "image_to_video"
      : "text_to_video";
  const storyboardRequired = input.scenes.length > 1 || input.intent.targetDurationSeconds > 15;
  const preferredTier = preferredSeedanceTier(input.intent.targetDurationSeconds, recommendedProviderMode, routableReferenceCount, input.referenceRemakeBlueprint, input.visualBiblePlan);
  const requestedSettings = input.input.seedanceSettings;
  const resolution = requestedSettings?.resolution ?? DEFAULT_SHORT_SEEDANCE_RESOLUTION;
  const bitrateMode = requestedSettings?.bitrateMode ?? DEFAULT_SHORT_SEEDANCE_BITRATE_MODE;
  const returnLastFrame = requestedSettings?.returnLastFrame ?? true;
  const targetPerClip = Math.min(15, Math.max(4, Math.ceil(input.intent.targetDurationSeconds / Math.max(1, input.scenes.length))));
  const referenceTags = readyReferences.map((reference) => ({
    tag: reference.promptTag,
    role: reference.promptRole,
    providerKind: reference.providerKind,
    label: reference.label,
    transferScope: reference.transferScope,
    priority: reference.priority
  }));
  const recipeName: ShortSeedanceRoutingPlan["promptRecipe"]["name"] = input.referenceRemakeBlueprint
    ? "reference_to_video_remake_blueprint"
    : hasVisualBibleSequence
      ? "reference_board_to_video_sequence"
    : recommendedProviderMode === "reference_to_video"
      ? "reference_to_video_multi_reference"
      : recommendedProviderMode === "image_to_video"
        ? "image_to_video_product_or_kol"
        : "text_to_video_niche_short";
  const reasonCodes = uniqueClean([
    recommendedProviderMode,
    preferredTier,
    requestedSettings?.resolution ? `user_resolution_${resolution}` : `default_resolution_${resolution}`,
    requestedSettings?.bitrateMode ? `user_bitrate_${bitrateMode}` : `default_bitrate_${bitrateMode}`,
    requestedSettings?.returnLastFrame !== undefined ? `user_return_last_frame_${returnLastFrame}` : undefined,
    storyboardRequired ? "storyboard_multishot" : "single_clip",
    input.referenceRemakeBlueprint ? "video_remake_blueprint_present" : undefined,
    hasVisualBibleSequence ? "visual_bible_sequence_present" : undefined,
    input.visualBiblePlan.releaseGateSummary.blocksRenderUntilAssetsApproved ? "visual_bible_assets_required_before_render" : undefined,
    input.visualBiblePlan.recommendedPipe !== "normal_short_pipe" ? `visual_pipe_${input.visualBiblePlan.recommendedPipe}` : undefined,
    readyReferences.some((reference) => reference.promptRole === "source_video_structure") ? "source_video_structure_reference_ready" : undefined,
    readyReferences.some((reference) => reference.promptRole === "identity") ? "kol_identity_reference_ready" : undefined,
    readyReferences.some((reference) => reference.promptRole === "product") ? "product_reference_ready" : undefined,
    readyReferences.some((reference) => reference.promptRole === "first_frame" || reference.promptRole === "last_frame") ? "first_last_frame_anchor_ready" : undefined
  ], 10, 100);
  const warnings = uniqueClean([
    ...input.mediaReferencePlan.flatMap((reference) => reference.issues),
    ...input.visualBiblePlan.warnings,
    providerReadyReferences.length === 0 && readyReferences.length > 0 ? "media_references_need_rights_or_asset_review_before_provider_handoff" : undefined,
    preferredTier === "mini" ? "mini_tier_requires_operator_configured_capability_or_runtime_fallback_to_fast" : undefined
  ], 10, 180);
  const routingId = createStableId(
    "short_seedance_routing",
    [
      input.input.projectId,
      input.input.requestId ?? "",
      recommendedProviderMode,
      preferredTier,
      resolution,
      input.intent.aspectRatio,
      referenceTags.map((reference) => `${reference.tag}:${reference.role}`).join("|")
    ].join(":")
  );

  return {
    schemaVersion: "cinejelly.short-seedance-routing.v1",
    routingId,
    provider: "atlascloud",
    modelFamily: "seedance_2_0",
    recommendedProviderMode,
    preferredTier,
    modelSelectionPolicy: "admin_allowlist_capability_first",
    preferredConfiguredModelEnv: preferredTier === "standard"
      ? "ATLASCLOUD_SEEDANCE_STANDARD_MODEL"
      : preferredTier === "fast"
        ? "ATLASCLOUD_SEEDANCE_FAST_MODEL"
        : "ATLASCLOUD_SEEDANCE_MINI_MODEL",
    modelAlias: preferredTier === "standard"
      ? "Seedance 2.0"
      : preferredTier === "fast"
        ? "Seedance 2.0 Fast"
        : "Seedance 2.0 Mini",
    resolution,
    ratio: input.intent.aspectRatio,
    bitrateMode,
    superResolution: resolution.endsWith("-SR"),
    returnLastFrame,
    providerClipDurationSeconds: {
      min: 4,
      max: 15,
      targetPerClip
    },
    storyboardRequired,
    sequentialRenderRecommended: storyboardRequired && (hasSourceOrMotion || hasVisualBibleSequence || providerReadyReferences.length === 0),
    generatedAudioMode: input.audioPolicy.renderAudioMode,
    referenceTags,
    promptRecipe: seedancePromptRecipe(recipeName, referenceTags, input.referenceRemakeBlueprint, input.visualBiblePlan),
    reasonCodes,
    warnings,
    releaseGateSummary: {
      canUseAsNoSpendModelRoutingEvidence: true,
      canSubmitToProviderNow: false,
      releaseBlocker: "Short Seedance routing is planning evidence only; provider submission still requires review approval, model allowlist/capability checks, quota/cost gates, artifact validation, and manual media review."
    }
  };
}

function promptReferenceTagKind(providerKind: ShortMediaReferencePlan["providerKind"]): "image" | "video" | "audio" {
  if (providerKind === "audio") {
    return "audio";
  }
  return providerKind === "video" || providerKind === "motion" || providerKind === "camera" ? "video" : "image";
}

function isImageLikeProviderKind(providerKind: ShortMediaReferencePlan["providerKind"]): boolean {
  return providerKind === "image" ||
    providerKind === "first_frame" ||
    providerKind === "last_frame" ||
    providerKind === "identity" ||
    providerKind === "product" ||
    providerKind === "environment" ||
    providerKind === "style";
}

function normalizedMediaRole(role: ShortMediaReferenceInput["role"]): {
  readonly inputRole: ShortMediaReferenceInput["role"];
  readonly promptRole: ShortMediaReferencePlan["promptRole"];
} {
  switch (role) {
    case "kol":
    case "creator":
      return { inputRole: role, promptRole: "identity" };
    case "product":
      return { inputRole: role, promptRole: "product" };
    case "wardrobe":
    case "clothing":
      return { inputRole: role, promptRole: "wardrobe" };
    case "background":
    case "environment":
      return { inputRole: role, promptRole: "environment" };
    case "first_frame":
      return { inputRole: role, promptRole: "first_frame" };
    case "last_frame":
      return { inputRole: role, promptRole: "last_frame" };
    case "style":
      return { inputRole: role, promptRole: "style" };
    case "motion":
      return { inputRole: role, promptRole: "motion" };
    case "camera":
      return { inputRole: role, promptRole: "camera" };
    case "audio":
      return { inputRole: role, promptRole: "audio_tempo" };
    case "source_video":
      return { inputRole: role, promptRole: "source_video_structure" };
  }
}

function mediaProviderKindFor(
  reference: ShortMediaReferenceInput,
  role: ReturnType<typeof normalizedMediaRole>
): ShortMediaReferencePlan["providerKind"] {
  if (reference.kind === "audio" || role.promptRole === "audio_tempo") {
    return "audio";
  }
  if (
    reference.kind === "video" ||
    role.promptRole === "motion" ||
    role.promptRole === "camera" ||
    role.promptRole === "source_video_structure" ||
    /\.(?:mp4|mov|webm|m4v)(?:$|[?#])/i.test(reference.uri)
  ) {
    return "video";
  }
  if (role.promptRole === "first_frame" || role.promptRole === "last_frame") {
    return role.promptRole;
  }
  if (role.promptRole === "identity" || role.promptRole === "product" || role.promptRole === "environment" || role.promptRole === "style") {
    return role.promptRole;
  }
  return "image";
}

function mediaUriEvidence(uri: string): {
  readonly status: "ready" | "blocked";
  readonly uriPolicy: ShortMediaReferencePlan["uriPolicy"];
  readonly uriSha256?: string;
  readonly sourceHost?: string;
  readonly providerReady: boolean;
  readonly providerUri?: string;
  readonly providerAssetId?: string;
} {
  if (!uri || UNSAFE_MEDIA_REFERENCE_PATTERN.test(uri)) {
    return {
      status: "blocked",
      uriPolicy: "blocked_unsafe_or_private",
      providerReady: false
    };
  }
  if (isUploadUri(uri)) {
    return {
      status: "ready",
      uriPolicy: "upload_handle_retained",
      uriSha256: sha256(uri),
      providerReady: true,
      providerUri: uri
    };
  }
  if (uri.startsWith("asset://")) {
    const providerAssetId = uri.slice("asset://".length).trim();
    return providerAssetId
      ? {
          status: "ready",
          uriPolicy: "asset_id_retained",
          uriSha256: sha256(uri),
          providerReady: true,
          providerUri: `asset://${providerAssetId}`,
          providerAssetId
        }
      : {
          status: "blocked",
          uriPolicy: "blocked_unsafe_or_private",
          providerReady: false
        };
  }
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return {
      status: "blocked",
      uriPolicy: "blocked_unsafe_or_private",
      providerReady: false
    };
  }
  if (parsed.protocol !== "https:" || isLocalHost(parsed.hostname) || parsed.username || parsed.password || parsed.hash) {
    return {
      status: "blocked",
      uriPolicy: "blocked_unsafe_or_private",
      providerReady: false
    };
  }
  if ([...parsed.searchParams.entries()].some(([key, value]) => UNSAFE_QUERY_PATTERN.test(key) || UNSAFE_QUERY_PATTERN.test(value))) {
    return {
      status: "blocked",
      uriPolicy: "blocked_unsafe_or_private",
      providerReady: false
    };
  }
  return {
    status: "ready",
    uriPolicy: "clean_https_hashed",
    // Hash the SAME canonical form render-time recovery hashes (whitespace-collapsed + trimmed —
    // security-audit F4): the plan used to hash the raw string while recovery hashed the cleaned
    // one, so a pasted URI carrying stray whitespace could never match its own hash and the
    // customer's reference was silently dropped from the paid render.
    uriSha256: sha256(uri.replace(/\s+/g, " ").trim()),
    sourceHost: parsed.hostname.toLowerCase(),
    providerReady: true
  };
}

function mediaRoleLabel(role: ShortMediaReferenceInput["role"], index: number): string {
  switch (role) {
    case "kol":
    case "creator":
      return `KOL reference ${index + 1}`;
    case "product":
      return `Product reference ${index + 1}`;
    case "wardrobe":
    case "clothing":
      return `Wardrobe reference ${index + 1}`;
    case "background":
    case "environment":
      return `Background reference ${index + 1}`;
    case "first_frame":
      return `First-frame reference ${index + 1}`;
    case "last_frame":
      return `Last-frame reference ${index + 1}`;
    case "style":
      return `Style reference ${index + 1}`;
    case "motion":
      return `Motion reference ${index + 1}`;
    case "camera":
      return `Camera reference ${index + 1}`;
    case "audio":
      return `Audio reference ${index + 1}`;
    case "source_video":
      return `Source-video reference ${index + 1}`;
  }
}

function mediaTransferScope(
  role: ShortMediaReferencePlan["promptRole"],
  promptTag: string,
  description: string | undefined
): string {
  const suffix = description ? ` Operator note: ${description}.` : "";
  switch (role) {
    case "identity":
      return `${promptTag} controls approved KOL identity, face continuity, hair, and creator presence only.${suffix}`;
    case "product":
      return `${promptTag} controls product shape, packaging, logo placement, label, material, and hero-object continuity only.${suffix}`;
    case "wardrobe":
      return `${promptTag} controls clothing silhouette, fabric, fit, color, and outfit continuity only.${suffix}`;
    case "environment":
      return `${promptTag} controls background/set atmosphere and layout only; product and KOL stay anchored separately.${suffix}`;
    case "first_frame":
      return `${promptTag} is the first-frame composition anchor; generate motion from this opening state only.${suffix}`;
    case "last_frame":
      return `${promptTag} is the final-frame target; transition toward it without deforming KOL/product identity.${suffix}`;
    case "motion":
      return `${promptTag} controls motion rhythm and gesture timing only.${suffix}`;
    case "camera":
      return `${promptTag} controls camera path, framing, lens language, and cut rhythm only.${suffix}`;
    case "audio_tempo":
      return `${promptTag} controls tempo/energy only; use new licensed/generated audio and voice.${suffix}`;
    case "style":
      return `${promptTag} controls visual mood after identity/product anchors are preserved.${suffix}`;
    case "voice":
      return `${promptTag} controls approved voice character only.${suffix}`;
    case "source_video_structure":
      return `${promptTag} controls source structure, pacing, acting beats, camera grammar, and retention timing only after rights review.${suffix}`;
  }
}

function mediaDoNotTransfer(role: ShortMediaReferencePlan["promptRole"]): readonly string[] {
  const common = ["watermarks", "private metadata", "unapproved logos", "visible captions or text overlays"];
  switch (role) {
    case "identity":
      return [...common, "source-video performer identity", "unapproved voice likeness"];
    case "product":
      return [...common, "unsupported product claims", "wrong packaging geometry"];
    case "wardrobe":
      return [...common, "unapproved brand marks", "source-video costume if not provided by user"];
    case "environment":
      return [...common, "recognizable private location ownership"];
    case "first_frame":
    case "last_frame":
      return [...common, "new identity not present in approved anchors", "product deformation"];
    case "motion":
    case "camera":
    case "source_video_structure":
      return [...common, "source transcript wording", "source music", "source creator identity", "source brand marks", "exact protected edit expression"];
    case "audio_tempo":
    case "voice":
      return [...common, "protected song", "protected voice identity", "unlicensed melody"];
    case "style":
      return [...common, "protected style imitation beyond broad production mood"];
  }
}

function preferredSeedanceTier(
  targetDurationSeconds: number,
  providerMode: ShortSeedanceRoutingPlan["recommendedProviderMode"],
  providerReadyReferenceCount: number,
  referenceRemakeBlueprint: ShortReferenceRemakeBlueprint | undefined,
  visualBiblePlan: ShortVisualBiblePlan
): ShortSeedanceRoutingPlan["preferredTier"] {
  if (referenceRemakeBlueprint || visualBiblePlan.status !== "not_needed" || providerMode === "reference_to_video" || providerReadyReferenceCount >= 2 || targetDurationSeconds >= 28) {
    return "standard";
  }
  if (targetDurationSeconds <= 15 && providerReadyReferenceCount === 0) {
    return "mini";
  }
  return "fast";
}

function seedancePromptRecipe(
  name: ShortSeedanceRoutingPlan["promptRecipe"]["name"],
  referenceTags: readonly ShortSeedanceRoutingPlan["referenceTags"][number][],
  referenceRemakeBlueprint: ShortReferenceRemakeBlueprint | undefined,
  visualBiblePlan: ShortVisualBiblePlan
): ShortSeedanceRoutingPlan["promptRecipe"] {
  const referenceInstruction = referenceTags.length
    ? referenceTags.map((reference) =>
        `${reference.tag} (${reference.role}) => ${reference.transferScope}`
      ).join(" ")
    : "No provider media references are attached; write a concrete text-to-video prompt with subject, action, camera, lighting, motion, audio intent, and constraints.";
  const remakeInstruction = referenceRemakeBlueprint
    ? ` Use Video Remake blueprint ${referenceRemakeBlueprint.blueprintId}: lock edit rhythm, source beat map, acting beats, camera grammar, retention mechanics, and payoff shape while replacing KOL, product, setting, audio, claims, and CTA with user-approved inputs. Follow adherence targets: ${referenceRemakeBlueprint.adherenceTargets.slice(0, 4).join(" | ")}.`
    : "";
  const visualBibleInstruction = visualBiblePlan.status !== "not_needed"
    ? ` Use Visual Bible ${visualBiblePlan.planId}: pipe=${visualBiblePlan.recommendedPipe}; execution=${visualBiblePlan.executionBlueprint.mode}; clipStrategy=${visualBiblePlan.executionBlueprint.clipExecutionStrategy}; durationBand=${visualBiblePlan.durationBand}; boards=${visualBiblePlan.sequencePlan.boardCount}; clips=${visualBiblePlan.sequencePlan.targetClipCount}; continuity=${visualBiblePlan.sequencePlan.continuityStrategy}. Required assets: ${visualBiblePlan.assetPlans.filter((asset) => asset.requiredBeforeRender).map((asset) => asset.role).join(", ") || "none"}. Bind order: ${visualBiblePlan.executionBlueprint.referenceTagBindingOrder.join(" > ") || "identity/product/storyboard before style/motion"}. Coverage rule: ${visualBiblePlan.executionBlueprint.durationCoverage.coverageRule}`
    : "";
  return {
    name,
    modeInstruction: modeInstructionForRecipe(name),
    referenceInstruction: `${referenceInstruction}${remakeInstruction}${visualBibleInstruction}`.trim(),
    shotPromptRules: [
      "Use one visible beat per shot: subject, action, camera move, lighting, timeline, audio intent, continuity, and physical endpoint.",
      "Bind references before prose; never let style or motion references override KOL identity or product geometry.",
      "For product/KOL shorts, show the asset early, then show proof/demo/payoff without unsupported claims.",
      ...(visualBiblePlan.status !== "not_needed"
        ? [
            "When a reference board or storyboard board exists, use it as a scoped production bible: preserve identity/product/style anchors while still writing concrete motion for each Seedance clip.",
            "For board-driven sequences, map each board/panel to exact seconds and ensure every clip has a readable first frame, action/proof middle, and controlled endpoint."
          ]
        : []),
      "Make humans feel observed, not posed: natural blink timing, imperfect hand speed, real micro-pauses, believable eye-line, skin texture, and physical contact with product.",
      "Prompt Seedance with dense cinematic specifics: subject continuity, lens distance, camera motion, light source, gesture, material texture, background depth, ending frame, and audio bed.",
      "For multishot shorts, keep each provider clip within 4-15 seconds and request last-frame continuity when scenes chain."
    ],
    negativeRules: [
      "No visible captions, subtitles, CTA cards, fake UI text, random letters, watermark, or typography.",
      "No copied source-video faces, script wording, brand marks, music, or protected edit expression.",
      "No unsupported medical, financial, weight-loss, before/after, or absolute claims.",
      "No product deformation, logo drift, inconsistent packaging, face drift, broken hands, or mismatched wardrobe continuity."
    ]
  };
}

function modeInstructionForRecipe(name: ShortSeedanceRoutingPlan["promptRecipe"]["name"]): string {
  switch (name) {
    case "text_to_video_niche_short":
      return "Use Seedance text-to-video: write concrete original shots from niche, product, audience, camera, light, and audio evidence.";
    case "image_to_video_product_or_kol":
      return "Use Seedance image-to-video: preserve the single product/KOL/first-frame reference while adding controlled motion, light, and camera.";
    case "reference_to_video_multi_reference":
      return "Use Seedance reference-to-video: separate each reference role, preserve identity/product anchors, and transfer only the scoped motion/style/camera/audio signals.";
    case "reference_to_video_remake_blueprint":
      return "Use Seedance reference-to-video with Video Remake blueprint: match source beat-map structure, camera/performance rhythm, and payoff timing with user-approved replacements and originality guardrails.";
    case "reference_board_to_video_sequence":
      return "Use Seedance reference-to-video from a visual bible: bind character/product/storyboard-board references, then animate each timed board as a concrete clip with continuity and drift checks.";
  }
}

function template(
  templateId: string,
  label: string,
  category: WorkflowTemplateDefinition["category"],
  platforms: readonly ShortPipelinePlatform[],
  durationRangeSeconds: readonly [number, number],
  hints: readonly (readonly [WorkflowTemplateDefinition["planningHints"][number]["kind"], string])[]
): WorkflowTemplateDefinition {
  return {
    templateId,
    label,
    category,
    platforms,
    durationRangeSeconds,
    planningHints: hints.map(([kind, text]) => ({ kind, text })),
    approvalSurfaces: ["scene", "audio", "caption", "claim"],
    sourcePatternOrigins: internalSourcePatternOrigins([
      "calesthio_openmontage",
      "hkuds_vimax",
      "hkuds_videoagent"
    ])
  };
}

function scene(
  role: ShortPipelineScenePlan["role"],
  order: number,
  goal: string,
  narration: string,
  caption: string,
  claimIds: readonly string[]
): ShortPipelineScenePlan {
  return {
    sceneId: createStableId("short_scene", `${order}:${role}:${goal}:${narration}`),
    order,
    role,
    goal,
    visualDirection: visualDirectionFor(role),
    narration,
    caption,
    claimIds
  };
}

function uniqueConcepts(values: readonly ShortPipelineConcept[], limit: number): readonly ShortPipelineConcept[] {
  const seen = new Set<string>();
  const output: ShortPipelineConcept[] = [];
  for (const value of values) {
    const key = value.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function sceneRolesFor(
  prompt: string,
  intent: ShortPipelineIntent,
  templateSuggestion: WorkflowTemplateSuggestion | undefined
): readonly ShortPipelineScenePlan["role"][] {
  const lower = `${prompt} ${templateSuggestion?.category ?? ""}`.toLowerCase();
  if (intent.targetDurationSeconds <= 15) {
    return ["hook", "demo", "payoff"];
  }
  if (intent.targetDurationSeconds <= 25) {
    return /compare|versus|vs|before|after/.test(lower)
      ? ["hook", "problem", "proof", "payoff"]
      : ["hook", "problem", "demo", "payoff"];
  }
  if (intent.targetDurationSeconds >= 46) {
    return /story|founder|education|explain|training/.test(lower)
      ? ["hook", "problem", "demo", "proof", "offer", "payoff"]
      : ["hook", "problem", "proof", "demo", "offer", "payoff"];
  }
  if (/ugc|review|creator|testimonial|native/.test(lower)) {
    return ["hook", "problem", "demo", "proof", "payoff"];
  }
  if (/cinematic|premium|luxury|reveal/.test(lower)) {
    return ["hook", "proof", "demo", "payoff"];
  }
  if (/demo|tutorial|how it works|show how/.test(lower)) {
    return ["hook", "demo", "proof", "payoff"];
  }
  return ["hook", "problem", "proof", "demo", "payoff"];
}

function sceneGoalFor(
  role: ShortPipelineScenePlan["role"],
  productName: string,
  benefit: string,
  templateCue: string
): string {
  switch (role) {
    case "hook":
      return `Stop the scroll with a specific buyer tension for ${productName}.`;
    case "problem":
      return `Make the viewer recognize the problem before the product solution appears.`;
    case "proof":
      return `Show one product fact or visual proof for ${benefit} without overstating claims.${templateCue}`;
    case "demo":
      return `Demonstrate how ${productName} fits the buyer's workflow or routine.`;
    case "offer":
      return `Introduce the offer as a continuation of the proof, not a separate ad card.`;
    case "payoff":
      return `Close the story with a clear visual payoff and no new unsupported claims.`;
  }
}

function sceneNarrationFor(
  role: ShortPipelineScenePlan["role"],
  productName: string,
  benefit: string,
  concept: ShortPipelineConcept | undefined
): string {
  switch (role) {
    case "hook":
      return concept?.hook ?? `${productName} solves one clear buyer problem: ${benefit}.`;
    case "problem":
      return `The problem is not wanting another complicated fix; it is wanting ${benefit}.`;
    case "proof":
      return benefit;
    case "demo":
      return `Use ${productName} in one clear, visual step.`;
    case "offer":
      return `If this fits your routine, this is the simple next step.`;
    case "payoff":
      return `End with the visible result so the viewer understands the next step without any on-screen CTA.`;
  }
}

function sceneCaptionFor(_role: ShortPipelineScenePlan["role"]): string {
  return NO_VISIBLE_TEXT_CAPTION;
}

function normalizeCandidateSceneRoles(
  candidateRoles: readonly ShortPipelineScenePlan["role"][],
  prompt: string,
  intent: ShortPipelineIntent,
  templateSuggestion: WorkflowTemplateSuggestion | undefined
): readonly ShortPipelineScenePlan["role"][] {
  const fallback = sceneRolesFor(prompt, intent, templateSuggestion);
  const roles = candidateRoles.filter((role, index) => index === 0 || role !== candidateRoles[index - 1]);
  const withHook: ShortPipelineScenePlan["role"][] = roles[0] === "hook"
    ? [...roles]
    : ["hook", ...roles.filter((role) => role !== "hook")];
  const withPayoff: ShortPipelineScenePlan["role"][] = withHook[withHook.length - 1] === "payoff"
    ? withHook
    : [...withHook.filter((role) => role !== "payoff"), "payoff"];
  const maxScenes = intent.targetDurationSeconds <= 15 ? 3 : intent.targetDurationSeconds <= 25 ? 4 : intent.targetDurationSeconds >= 46 ? 6 : 5;
  const minScenes = intent.targetDurationSeconds <= 15 ? 3 : 4;
  const trimmed: ShortPipelineScenePlan["role"][] = withPayoff.length > maxScenes
    ? [...withPayoff.slice(0, Math.max(1, maxScenes - 1)).filter((role) => role !== "payoff"), "payoff"]
    : withPayoff;
  const finalRoles = trimmed.length >= minScenes ? trimmed : fallback;
  if (!finalRoles.includes("demo") && !finalRoles.includes("proof") && finalRoles.length >= 3) {
    return finalRoles.map((role, index) => index === Math.min(2, finalRoles.length - 2) ? "demo" : role);
  }
  return finalRoles;
}

function candidateSceneGoalFor(
  role: ShortPipelineScenePlan["role"],
  productName: string,
  benefit: string,
  storyArc: string,
  templateCue: string
): string {
  const base = sceneGoalFor(role, productName, benefit, templateCue);
  return `${base} Candidate arc: ${storyArc}`;
}

function candidateSceneNarrationFor(
  role: ShortPipelineScenePlan["role"],
  productName: string,
  benefit: string,
  concept: ShortPipelineConcept,
  storyArc: string
): string {
  switch (role) {
    case "hook":
      return concept.hook;
    case "problem":
      return `Here is the friction: the buyer wants ${benefit}, but needs proof before trusting ${productName}.`;
    case "proof":
      return `Proof beat for ${productName}: ${benefit}. Keep the claim review-bound.`;
    case "demo":
      return `Show ${productName} in one visible step that supports the arc: ${storyArc}`;
    case "offer":
      return `If this proof fits the viewer's routine, make the next step feel simple.`;
    case "payoff":
      return `Resolve the arc with the result in view; avoid any spoken or visual hard-sell CTA.`;
  }
}

function candidateSceneCaptionFor(_role: ShortPipelineScenePlan["role"]): string {
  return NO_VISIBLE_TEXT_CAPTION;
}

function visualDirectionFor(role: ShortPipelineScenePlan["role"]): string {
  switch (role) {
    case "hook":
      return "Fast first frame, product visible early, no text overlay or typography.";
    case "problem":
      return "Show the buyer pain point with one simple visual contrast.";
    case "proof":
      return "Use product close-up, feature demonstration, or evidence insert.";
    case "demo":
      return "Show hands-on use or workflow context without clutter.";
    case "offer":
      return "Use product/result staging with conservative claim language, not an offer text card.";
    case "payoff":
      return "End on product/result, logo-safe reference asset only, no CTA card, no captions, no text overlays.";
  }
}

function audioPolicyFor(
  input: ShortPipelineAudioPolicyInput | undefined,
  brandKitEvaluation: BrandKitEvaluation | undefined
): ShortPipelineAudioPolicy {
  const mode = shortAudioModeFor(input?.mode);
  const language = mode === "off"
    ? undefined
    : isShortAudioLanguage(input?.language) ? input.language : languageFromBrandKit(brandKitEvaluation?.language);
  const voiceStyle = cleanText(input?.voiceStyle, 120) ?? brandKitEvaluation?.tone;
  const renderAudioMode = renderAudioModeForShortMode(mode);
  return {
    schemaVersion: "cinejelly.short-audio-policy.v1",
    mode,
    ...(language ? { language } : {}),
    ...(language ? { languageLabel: languageLabelFor(language) } : {}),
    ...(voiceStyle && mode !== "off" ? { voiceStyle } : {}),
    renderAudioMode,
    generatedAudioIntentEnabled: mode !== "off",
    nativeProviderAudioEnabled: renderAudioMode === "native" || renderAudioMode === "hybrid",
    providerAudioPromptEnabled: renderAudioMode === "native" || renderAudioMode === "guided" || renderAudioMode === "hybrid",
    externalAudioScriptEnabled: mode !== "off",
    reviewRequired: true
  };
}

function shortAudioModeFor(value: unknown): ShortPipelineAudioPolicy["mode"] {
  if (value === "off" || value === "native" || value === "hybrid" || value === "voiceover") {
    return value;
  }
  // Common ways a user disables audio must NOT silently default to voiceover (audio ON = extra spend).
  if (value === "none" || value === "mute" || value === "muted" || value === "silent" || value === "silence") {
    return "off";
  }
  return "voiceover";
}

function renderAudioModeForShortMode(mode: ShortPipelineAudioPolicy["mode"]): ShortPipelineAudioPolicy["renderAudioMode"] {
  switch (mode) {
    case "off":
      return "none";
    case "native":
      return "native";
    case "hybrid":
    case "voiceover":
      return "hybrid";
  }
}

function noVisibleTextPolicy(): ShortPipelineVisualTextPolicy {
  return {
    schemaVersion: "cinejelly.short-visual-text-policy.v1",
    mode: "no_visible_text",
    allowOnScreenText: false,
    allowCaptions: false,
    allowCtaCards: false,
    allowTextOverlays: false,
    allowLogoText: "reference_asset_only",
    promptConstraint: "No visible text in the generated video: no captions, subtitles, CTA cards, typography, labels, lower thirds, or fake UI text. Logos may appear only as approved/reference product assets."
  };
}

function languageFromBrandKit(value: string | undefined): NonNullable<ShortPipelineAudioPolicy["language"]> {
  const normalized = value?.toLowerCase() ?? "";
  if (/\bvi\b|vietnam|tieng viet/.test(normalized)) return "vi";
  if (/\bzh\b|chinese|mandarin|tieng trung/.test(normalized)) return "zh";
  return "en";
}

function isShortAudioLanguage(value: unknown): value is NonNullable<ShortPipelineAudioPolicy["language"]> {
  return value === "en" || value === "vi" || value === "zh";
}

function languageLabelFor(language: NonNullable<ShortPipelineAudioPolicy["language"]>): NonNullable<ShortPipelineAudioPolicy["languageLabel"]> {
  switch (language) {
    case "vi":
      return "Vietnamese";
    case "zh":
      return "Chinese";
    case "en":
      return "English";
  }
}

function issue(
  code: ProductUrlBriefIssue["code"],
  severity: ProductUrlBriefIssue["severity"],
  message: string,
  repair: string
): ProductUrlBriefIssue {
  return { code, severity, message, repair };
}

function brandIssue(
  code: BrandKitIssue["code"],
  severity: BrandKitIssue["severity"],
  message: string,
  repair: string,
  subject?: string
): BrandKitIssue {
  return {
    code,
    severity,
    message,
    repair,
    ...(subject ? { subject } : {})
  };
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

function splitBenefitText(value: string | undefined): readonly string[] {
  const normalized = cleanText(value, 1200);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/[.;!?]\s+|(?:\s+-\s+)/)
    .map((part) => cleanText(part, 180))
    .filter((part): part is string => Boolean(part && part.split(/\s+/).length >= 3));
}

function claimLikeFragments(value: string): readonly string[] {
  return splitBenefitText(value).filter((part) => HIGH_RISK_CLAIM_PATTERN.test(part) || MEDIUM_RISK_CLAIM_PATTERN.test(part));
}

function firstQuotedText(value: string): string | undefined {
  const match = value.match(/"([^"]{3,120})"/);
  return cleanText(match?.[1], 120);
}

function claimRisk(value: string): ProductClaimRisk {
  if (HIGH_RISK_CLAIM_PATTERN.test(value)) {
    return "high";
  }
  if (MEDIUM_RISK_CLAIM_PATTERN.test(value)) {
    return "medium";
  }
  return "low";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isLocalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    lower === "localhost" ||
    lower === "::" ||
    lower === "::1" ||
    lower === "0.0.0.0" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }
  const ipVersion = isIP(lower);
  if (ipVersion === 4) {
    const [first = 0, second = 0] = lower.split(".").map((part) => Number(part));
    return first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168);
  }
  if (ipVersion === 6) {
    return lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:");
  }
  return false;
}

function isCleanHttps(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || isLocalHost(parsed.hostname) || parsed.username || parsed.password) {
    return false;
  }
  return [...parsed.searchParams.entries()].every(([key, item]) => !UNSAFE_QUERY_PATTERN.test(key) && !UNSAFE_QUERY_PATTERN.test(item));
}

function inferPlatform(prompt: string): ShortPipelinePlatform {
  const lower = prompt.toLowerCase();
  if (/douyin|\u6296\u97f3/.test(lower)) return "douyin";
  if (/tiktok/.test(lower)) return "tiktok";
  if (/reels|instagram|ig\b/.test(lower)) return "instagram_reels";
  if (/shorts|youtube/.test(lower)) return "youtube_shorts";
  if (/facebook|meta ad/.test(lower)) return "facebook";
  if (/linkedin|b2b/.test(lower)) return "linkedin";
  if (/website|landing page/.test(lower)) return "website";
  if (/amazon|shopify|marketplace/.test(lower)) return "marketplace";
  return "unknown";
}

// Word-number vocabulary for spelled-out durations ("eight minute", "ninety second"). Excludes bare
// "a"/"an" (too idiomatic — "wait a second"); fractional phrases are normalized separately below.
const DURATION_WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100
};
// Duration unit tokens across the major languages CineJelly serves. Digit+unit is the universal way
// people write a duration ("2 phút", "2 minutos", "2分", "2분", "2 นาที"), so BROAD UNIT coverage (not
// per-language word-numbers) is what makes non-English intake correct. Full words are preferred over
// risky abbreviations, and the scanner adds a Latin-letter negative lookahead so a unit never matches
// a partial word ("min" in "minimum", "s" in "shoes"). Longer units are tried first (see scanner sort)
// so e.g. Thai วินาที (second) is matched before นาที (minute) which it contains.
const DURATION_MINUTE_UNITS = [
  "minutes", "minute", "mins", "min", // EN / FR (minute[s] shared)
  "minutos", "minuto", "minuti",      // ES / PT / IT
  "minuten",                          // DE
  "menit",                            // ID / MS
  "phút", "phut",                     // VI (with + without diacritics)
  "минут",                            // RU (stem covers минута/минуты/минуту)
  "นาที",                             // TH
  "分钟", "分間", "分", "분"           // ZH / JA / KO
];
const DURATION_SECOND_UNITS = [
  "seconds", "second", "secs", "sec", // EN
  "secondes", "seconde",              // FR
  "segundos", "segundo",              // ES / PT
  "secondi", "secondo",               // IT
  "sekunden", "sekunde",              // DE
  "detik",                            // ID / MS
  "giây", "giay",                     // VI (with + without diacritics)
  "секунд",                           // RU (stem covers секунда/секунды/секунд)
  "วินาที",                           // TH
  "秒", "초",                          // ZH / JA / KO
  "s"                                 // trailing ASCII abbrev (guarded by the negative lookahead)
];

/**
 * Parse a duration from free-text intake robustly. Handles digits, decimals ("1.5 min"), spelled-out
 * numbers ("eight minute"), Vietnamese/Chinese units ("2 phút", "90 giây", "3分钟", "60秒"), compound
 * clock forms ("1m30s", "1 minute 30 seconds"), and fractional phrases ("half a minute", "a minute and
 * a half"). When a prompt carries several durations (a user self-correction), the LAST one wins.
 * Returns undefined when no duration is present so the caller can apply the 30s default. Callers clamp
 * the result to the supported [15, 480] range separately.
 */
function parseDurationSeconds(prompt: string): number | undefined {
  // Normalize fractional English phrases to explicit seconds so the numeric scan is uniform.
  const text = prompt
    .toLowerCase()
    .replace(/\b(?:a|one|1)\s+minute\s+and\s+(?:a\s+)?half\b/g, " 90 seconds ")
    .replace(/\bminute\s+and\s+(?:a\s+)?half\b/g, " 90 seconds ")
    .replace(/\bhalf\s+(?:a\s+|an\s+)?minute\b/g, " 30 seconds ")
    .replace(/\bhalf\s+(?:a\s+|an\s+)?second\b/g, " 1 second ");

  // Compact clock form: "1m30s" / "1 m 30 s".
  const clock = text.match(/\b(\d{1,3})\s*m\s*(\d{1,2})\s*s\b/);
  if (clock?.[1] && clock[2] !== undefined) {
    return Number(clock[1]) * 60 + Number(clock[2]);
  }

  const numbers = ["\\d+(?:\\.\\d+)?", ...Object.keys(DURATION_WORD_NUMBERS).sort((a, b) => b.length - a.length)];
  const units = [...DURATION_MINUTE_UNITS, ...DURATION_SECOND_UNITS].sort((a, b) => b.length - a.length);
  // Negative lookahead (?![a-zà-ÿ]) blocks partial-word matches on Latin units ("min" in "minimum",
  // "s" in "shoes") while still allowing CJK/Thai/Cyrillic/space/digit to follow a unit.
  const scanner = new RegExp(`(${numbers.join("|")})\\s*[-–—]?\\s*(${units.join("|")})(?![a-zà-ÿ])`, "gi");
  const minuteUnitSet = new Set(DURATION_MINUTE_UNITS);
  const hits: { start: number; end: number; seconds: number; unit: "min" | "sec" }[] = [];
  for (const match of text.matchAll(scanner)) {
    const rawNumber = (match[1] ?? "").toLowerCase();
    const value = /^\d/.test(rawNumber) ? Number(rawNumber) : DURATION_WORD_NUMBERS[rawNumber];
    if (value === undefined || !Number.isFinite(value)) {
      continue;
    }
    const isMinute = minuteUnitSet.has((match[2] ?? "").toLowerCase());
    const start = match.index ?? 0;
    hits.push({ start, end: start + match[0].length, seconds: isMinute ? value * 60 : value, unit: isMinute ? "min" : "sec" });
  }
  if (hits.length === 0) {
    return undefined;
  }

  // Combine a "<n> minute <n> second" compound (e.g. "1 minute 30 seconds") into one value, but only
  // when the two are directly adjacent (separator is whitespace/comma/"and"), so a self-correcting
  // "2 minute ad ... no 30 seconds" is NOT merged — its later value simply wins as the final intent.
  const values: number[] = [];
  for (let index = 0; index < hits.length; index += 1) {
    const current = hits[index];
    const next = hits[index + 1];
    if (!current) {
      continue;
    }
    if (current.unit === "min" && next && next.unit === "sec" && /^[\s,]*(?:and\s+)?$/.test(text.slice(current.end, next.start))) {
      values.push(current.seconds + next.seconds);
      index += 1;
    } else {
      values.push(current.seconds);
    }
  }
  return values[values.length - 1];
}

function inferDuration(prompt: string): number {
  const parsed = parseDurationSeconds(prompt);
  return parsed !== undefined && parsed > 0 ? Math.round(parsed) : 30;
}

function clampDuration(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : 30;
}

function inferEmotion(prompt: string): ShortPipelineEmotion {
  const lower = prompt.toLowerCase();
  if (/premium|luxury|cinematic|high[-\s]?end/.test(lower)) return "premium";
  if (/urgent|limited|now|today|sale/.test(lower)) return "urgent";
  if (/fun|playful|viral|meme/.test(lower)) return "playful";
  if (/trust|proof|review|testimonial|credible/.test(lower)) return "trustworthy";
  if (/teach|explain|learn|educat/.test(lower)) return "educational";
  if (/problem|solve|pain|before|after/.test(lower)) return "problem_solution";
  if (/dream|aspire|transform/.test(lower)) return "aspirational";
  return "unknown";
}

function inferGoal(prompt: string, productBrief: ProductUrlBrief | undefined): string {
  const lower = prompt.toLowerCase();
  if (/lead|booking|demo|call/.test(lower)) return "generate qualified leads";
  if (/sale|purchase|buy|shop|conversion/.test(lower)) return "drive product conversion";
  if (/awareness|launch|announce/.test(lower)) return "build launch awareness";
  if (/educat|explain|teach/.test(lower)) return "explain product value";
  return productBrief ? "turn product facts into a reviewable short video ad" : "create a short video concept from the brief";
}

function inferAudience(prompt: string): string {
  // Prefer an explicit audience cue; otherwise take the LAST "for <clause>" that is not a format word
  // (video/ad/reel/…), so "a video for gen z gamers" -> "gen z gamers" not "a video ..." (gap [10]).
  const cue = prompt.match(/\b(?:targeting|aimed at|audience[:\s]+)([^,.!?]{3,80})/i);
  if (cue?.[1]) {
    return cleanText(cue[1], 120) ?? "target buyer";
  }
  const formatWord = /^(?:a|an|the)?\s*(?:video|ad|advert|advertisement|reel|reels|clip|short|shorts|tiktok|youtube|post|content|campaign|story)\b/i;
  let audience: string | undefined;
  for (const clauseMatch of prompt.matchAll(/\bfor\s+((?:(?!\bfor\b)[^,.!?]){3,80})/gi)) {
    const clause = (clauseMatch[1] ?? "").trim();
    if (clause && !formatWord.test(clause)) {
      audience = clause;
    }
  }
  return cleanText(audience, 120) ?? "target buyer";
}

function inferOffer(prompt: string, productBrief: ProductUrlBrief | undefined): string | undefined {
  const offerMatch = prompt.match(/\b(?:offer|deal|discount|sale)\s*:?\s*([^,.!?]{3,100})/i);
  return cleanText(offerMatch?.[1], 120) ?? productBrief?.priceText;
}

function hookFor(
  intent: ShortPipelineIntent,
  productName: string,
  benefit: string,
  templateSuggestion: WorkflowTemplateSuggestion | undefined
): string {
  if (templateSuggestion?.category === "ugc_ad") {
    return `I tried ${productName} for one problem: ${benefit}.`;
  }
  if (templateSuggestion?.category === "cinematic_reveal") {
    return `${productName}, revealed through one premium detail.`;
  }
  if (intent.emotion === "urgent") {
    return `Before you buy another option, check what ${productName} actually solves.`;
  }
  return `${productName} solves one clear buyer problem: ${benefit}.`;
}

function riskNotes(
  productBrief: ProductUrlBrief | undefined,
  brandKitEvaluation: BrandKitEvaluation | undefined
): readonly string[] {
  return [
    ...(productBrief?.claimInventory.some((claim) => claim.substantiationRequired)
      ? ["Product claims need substantiation before render."]
      : []),
    ...(productBrief?.images.some((image) => image.rightsStatus !== "operator_approved")
      ? ["Product image rights need operator approval."]
      : []),
    ...(brandKitEvaluation?.issues.length ? ["Brand kit has policy or asset review issues."] : [])
  ];
}
