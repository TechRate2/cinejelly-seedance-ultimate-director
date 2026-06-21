/**
 * Agentic short-pipeline foundation.
 * It converts natural-language briefs, safe product URL evidence, optional templates,
 * and brand policy into a reviewable no-spend plan before provider work.
 */

import { createHash } from "node:crypto";
import { ReviewApprovalSystem } from "./review-approval-system.js";
import { ShortViralIntelligencePlanner } from "./short-viral-intelligence-planner.js";
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
  ShortPipelineConcept,
  ShortPipelineEmotion,
  ShortPipelineIntent,
  ShortPipelinePlan,
  ShortPipelinePlanInput,
  ShortPipelinePlatform,
  ShortPipelineScenePlan,
  WorkflowTemplateDefinition,
  WorkflowTemplateSuggestion
} from "../types/short-pipeline.js";
import type { ReviewApprovalCheckpointInput } from "../types/review-approval.js";
import type { AspectRatio } from "../types/settings.js";
import { createStableId } from "../utils/ids.js";

const SOURCE_PATTERN_ORIGINS = [
  "calesthio/OpenMontage",
  "HKUDS/ViMax",
  "HKUDS/VideoAgent",
  "video-db/Director",
  "vericontext/vibeframe"
] as const;

const PRODUCT_SOURCE_PATTERN_ORIGINS = [
  "calesthio/OpenMontage",
  "HKUDS/VideoAgent",
  "vericontext/vibeframe"
] as const;

const BRAND_SOURCE_PATTERN_ORIGINS = [
  "calesthio/OpenMontage",
  "vericontext/vibeframe"
] as const;

const UNSAFE_TEXT_PATTERN =
  /[A-Za-z]:\\|\\\\|(^|\s)\/(?:Users|home|tmp|var|mnt|opt|work|workspace|private|etc)\/|https?:\/\/|data:|bearer\s+|api[_-]?key|secret|token|password|authorization/i;

const UNSAFE_QUERY_PATTERN = /token|signature|sig|key|apikey|api_key|secret|password|auth|credential|expires|policy/i;

const HIGH_RISK_CLAIM_PATTERN =
  /cure|heal|medical|doctor|clinical|guarantee|guaranteed|100%|risk[-\s]?free|earn|income|profit|investment|weight loss|before and after|overnight|best|#1/i;

const MEDIUM_RISK_CLAIM_PATTERN =
  /improve|increase|reduce|boost|faster|stronger|premium|proven|safe|certified|limited time|save|discount/i;

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
    const raw = [
      snapshot.cta,
      /shop now/i.test(userPrompt) ? "Shop now" : undefined,
      /book|demo|call/i.test(userPrompt) ? "Book a demo" : undefined,
      /learn/i.test(userPrompt) ? "Learn more" : undefined,
      "Learn more",
      "Shop now"
    ];
    return uniqueClean(raw, 4, 80);
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
      ...(snapshot.targetBuyer ? [] : ["target_buyer"]),
      ...(snapshot.cta ? [] : ["preferred_cta"])
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
  public evaluate(input: BrandKitInput | undefined, claims: readonly ProductClaimInventoryItem[]): BrandKitEvaluation | undefined {
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
      issues.push(brandIssue("missing_tone", "warn", "Brand tone is missing.", "Define tone before finalizing narration and captions."));
    }
    if (!input.allowedClaims?.length && !input.forbiddenClaims?.length) {
      issues.push(brandIssue("missing_claim_policy", "warn", "Brand claim policy is missing.", "Add allowed or forbidden claims so the claim reviewer has policy evidence."));
    }
    if (!input.ctaRules?.length) {
      issues.push(brandIssue("missing_cta_rule", "warn", "CTA rules are missing.", "Add CTA rules before final ad export."));
    }
    for (const forbidden of input.forbiddenClaims ?? []) {
      const normalizedForbidden = cleanText(forbidden, 120);
      if (!normalizedForbidden) continue;
      const matchingClaim = claims.find((claim) => claim.text.toLowerCase().includes(normalizedForbidden.toLowerCase()));
      if (matchingClaim) {
        issues.push(brandIssue(
          "forbidden_claim_present",
          "block",
          "A product claim conflicts with the brand kit forbidden-claim policy.",
          "Remove or rewrite the forbidden claim before render.",
          matchingClaim.claimId
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
    template("tiktok_product_ad", "TikTok Product Ad", "product_ad", ["tiktok"], [15, 35], [
      ["hook", "Open with a concrete product problem or surprising use case."],
      ["proof", "Show one visible product proof point before the offer."],
      ["cta", "End with one short CTA."]
    ]),
    template("ugc_ad", "UGC Ad", "ugc_ad", ["tiktok", "instagram_reels"], [20, 45], [
      ["hook", "Use a first-person problem statement."],
      ["scene", "Cut between face-to-camera, product handling, and proof inserts."],
      ["audio", "Keep narration conversational and believable."]
    ]),
    template("explainer", "Explainer", "explainer", ["youtube_shorts", "linkedin", "website"], [30, 60], [
      ["hook", "Start with the outcome and why it matters."],
      ["scene", "Use step-by-step visual proof."],
      ["caption", "Prioritize readable captions and chapter-like beats."]
    ]),
    template("cinematic_product_reveal", "Cinematic Product Reveal", "cinematic_reveal", ["instagram_reels", "website"], [12, 30], [
      ["hook", "Lead with atmosphere and product silhouette."],
      ["scene", "Use macro, texture, light, and motion cues."],
      ["claim", "Keep claims minimal and visual."]
    ]),
    template("founder_story", "Founder Story", "founder_story", ["linkedin", "youtube_shorts"], [35, 60], [
      ["hook", "Introduce the founder's tension or mission."],
      ["proof", "Bind the product to real user pain."],
      ["cta", "Invite a conversation rather than hard-selling."]
    ]),
    template("comparison", "Comparison", "comparison", ["tiktok", "youtube_shorts", "website"], [20, 45], [
      ["hook", "Frame the before/after or old-way/new-way contrast."],
      ["claim", "Require proof for comparative claims."],
      ["caption", "Make comparison labels short and legible."]
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
  private readonly templateRegistry = new WorkflowTemplateRegistry();
  private readonly approvalSystem = new ReviewApprovalSystem();
  private readonly viralIntelligencePlanner = new ShortViralIntelligencePlanner();

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
    const brandKitEvaluation = this.brandKitEvaluator.evaluate(input.brandKit, productBrief?.claimInventory ?? []);
    const intent = this.intent(input, prompt, productBrief, brandKitEvaluation);
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
    const activeTemplate = selectedTemplate ?? templateSuggestions[0];
    const concepts = this.concepts(prompt, intent, productBrief, brandKitEvaluation, activeTemplate);
    const scenes = this.scenes(intent, productBrief, concepts[0], activeTemplate);
    const viralIntelligence = this.viralIntelligencePlanner.build({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      prompt,
      generatedAt,
      intent,
      ...(productBrief ? { productBrief } : {}),
      ...(brandKitEvaluation ? { brandKitEvaluation } : {}),
      ...(activeTemplate ? { selectedTemplate: activeTemplate } : {}),
      concepts,
      scenes,
      ...(input.referenceVideoLearning ? { referenceVideoLearning: input.referenceVideoLearning } : {})
    });
    const checkpoints = this.checkpoints(scenes, productBrief, brandKitEvaluation);
    const reviewApproval = this.approvalSystem.evaluate({
      projectId: input.projectId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      gate: "pre_render",
      generatedAt,
      checkpoints
    });
    const status = productBrief?.status === "blocked" || brandKitEvaluation?.status === "blocked" || viralIntelligence.status === "blocked" || reviewApproval.status === "blocked"
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

    return {
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
      templateSuggestions,
      ...(selectedTemplate ? { selectedTemplate } : {}),
      templatePolicy: selectedTemplate ? "operator_selected_optional" : templateSuggestions.length > 0 ? "suggested_optional" : "none",
      dynamicWorkflowRequired: true,
      concepts,
      scenes,
      viralIntelligence,
      reviewApproval,
      releaseGateSummary: {
        canRenderAfterApproval: reviewApproval.releaseGateSummary.canRenderAfterReview && status !== "blocked" && viralIntelligence.status !== "blocked",
        canUseAsNoSpendPlanningEvidence: status !== "blocked" && viralIntelligence.status !== "blocked",
        canReleaseToCustomerTraffic: false,
        releaseBlocker: status === "blocked" || viralIntelligence.status === "blocked"
          ? "Short-pipeline plan is blocked by unsafe URL, product, or brand-kit evidence."
          : "Short-pipeline plan is planning evidence only; render requires accepted review checkpoints, quota/cost gates, artifact validation, and business-readiness evidence."
      },
      nextActions: this.nextActions(status, productBrief, brandKitEvaluation, reviewApproval.status, viralIntelligence.status)
    };
  }

  private intent(
    input: ShortPipelinePlanInput,
    prompt: string,
    productBrief: ProductUrlBrief | undefined,
    brandKitEvaluation: BrandKitEvaluation | undefined
  ): ShortPipelineIntent {
    const platform = input.targetPlatform ?? inferPlatform(prompt);
    const targetDurationSeconds = clampDuration(input.targetDurationSeconds ?? inferDuration(prompt), 8, 60);
    const businessGoal = inferGoal(prompt, productBrief);
    const audience = cleanText(productBrief?.targetBuyer, 160) ?? inferAudience(prompt);
    const offer = inferOffer(prompt, productBrief);
    return {
      businessGoal,
      audience,
      platform,
      emotion: inferEmotion(`${prompt} ${brandKitEvaluation?.tone ?? ""}`),
      targetDurationSeconds,
      aspectRatio: platform === "website" || platform === "linkedin" ? "16:9" : "9:16",
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
    return [
      {
        conceptId: createStableId("concept", `${productName}:proof:${primaryBenefit}`),
        label: "Proof-led product story",
        angle: `Show ${productName} through one concrete buyer problem, one visible proof beat, and one clear CTA.`,
        hook: hookFor(intent, productName, primaryBenefit, templateSuggestion),
        riskNotes: riskNotes(productBrief, brandKitEvaluation)
      },
      {
        conceptId: createStableId("concept", `${productName}:tone:${tone}:${prompt}`),
        label: "Brand-tone native short",
        angle: `Make the ad feel ${tone} while keeping claims reviewable and captions simple.`,
        hook: `${productName} in ${intent.targetDurationSeconds} seconds: the buyer problem, the proof, and the next step.`,
        riskNotes: riskNotes(productBrief, brandKitEvaluation)
      }
    ];
  }

  private scenes(
    intent: ShortPipelineIntent,
    productBrief: ProductUrlBrief | undefined,
    concept: ShortPipelineConcept | undefined,
    templateSuggestion: WorkflowTemplateSuggestion | undefined
  ): readonly ShortPipelineScenePlan[] {
    const productName = productBrief?.title ?? "the product";
    const benefit = productBrief?.benefits[0] ?? intent.businessGoal;
    const claimIds = productBrief?.claimInventory.slice(0, 2).map((claim) => claim.claimId) ?? [];
    const cta = productBrief?.ctaCandidates[0] ?? "Learn more";
    const templateCue = templateSuggestion ? ` Optional accelerator: ${templateSuggestion.label}.` : "";
    return [
      scene("hook", 1, `Stop the scroll with the buyer problem for ${productName}.`, concept?.hook ?? benefit, `Why ${productName}?`, claimIds.slice(0, 1)),
      scene("proof", 2, `Show one product fact or visual proof without overstating claims.${templateCue}`, benefit, "See the proof", claimIds),
      scene("demo", 3, `Demonstrate how the product fits the buyer's workflow or routine.`, `Use ${productName} in one clear, visual step.`, "How it works", []),
      scene("cta", 4, `Close with one CTA and no new unsupported claims.`, cta, cta, [])
    ];
  }

  private checkpoints(
    scenes: readonly ShortPipelineScenePlan[],
    productBrief: ProductUrlBrief | undefined,
    brandKitEvaluation: BrandKitEvaluation | undefined
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
      label: "Approve narration, voice tone, BGM, ambience, and SFX plan",
      subjectId: "short_audio_plan",
      required: true,
      issueCodes: brandKitEvaluation?.status === "review_required" ? ["brand_voice_review_required"] : [],
      evidence: {
        targetDurationSeconds: scenes.length * 6
      }
    });
    checkpoints.push({
      surface: "caption",
      label: "Approve caption readability, language, platform fit, and accessibility",
      subjectId: "short_caption_plan",
      required: true,
      evidence: {
        sceneCount: scenes.length
      }
    });
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
      ...(brandKitEvaluation?.status === "review_required" ? ["Complete brand-kit tone, CTA, claim policy, and asset approval review."] : []),
      ...(viralStatus === "review_required" ? ["Review short viral strategy, reference-video guardrails, concept score, and scene directives before render."] : []),
      reviewStatus === "approval_required" || reviewStatus === "changes_requested"
        ? "Collect human scene, audio, caption, and claim approval before render."
        : "Proceed only through render cost/quota gates after approval.",
      "Keep templates optional; user natural-language edits can replace or ignore every suggested accelerator."
    ];
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
    sourcePatternOrigins: ["calesthio/OpenMontage", "HKUDS/ViMax", "HKUDS/VideoAgent"]
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

function visualDirectionFor(role: ShortPipelineScenePlan["role"]): string {
  switch (role) {
    case "hook":
      return "Fast first frame, product visible early, clean negative space for captions.";
    case "problem":
      return "Show the buyer pain point with one simple visual contrast.";
    case "proof":
      return "Use product close-up, feature demonstration, or evidence insert.";
    case "demo":
      return "Show hands-on use or workflow context without clutter.";
    case "offer":
      return "Use product plus offer card with conservative claim language.";
    case "cta":
      return "End on product, logo-safe frame, and one readable CTA.";
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
  const lower = hostname.toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1" || lower === "::1" || lower.endsWith(".local");
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
  if (/tiktok/.test(lower)) return "tiktok";
  if (/reels|instagram|ig\b/.test(lower)) return "instagram_reels";
  if (/shorts|youtube/.test(lower)) return "youtube_shorts";
  if (/facebook|meta ad/.test(lower)) return "facebook";
  if (/linkedin|b2b/.test(lower)) return "linkedin";
  if (/website|landing page/.test(lower)) return "website";
  if (/amazon|shopify|marketplace/.test(lower)) return "marketplace";
  return "unknown";
}

function inferDuration(prompt: string): number {
  const match = prompt.match(/\b([1-5]?\d)\s*(?:s|sec|secs|second|seconds)\b/i);
  return match?.[1] ? Number(match[1]) : 30;
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
  const match = prompt.match(/\bfor\s+([^,.!?]{3,80})/i);
  return cleanText(match?.[1], 120) ?? "target buyer";
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
