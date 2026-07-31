/**
 * Shared deterministic audience/niche intelligence for Short and Long.
 * It turns loose natural-language briefs into typed creative strategy without network, provider, or LLM calls.
 */

import type {
  AudienceNicheFormat,
  AudienceNicheFunnelStage,
  AudienceNicheIntelligence,
  AudienceNicheIntelligenceInput,
  AudienceNichePresentationStyle,
  AudienceNicheTrendPosture
} from "../types/audience-niche-intelligence.js";
import { hasCopyRiskIntent } from "../utils/copy-risk-intent.js";
import { createStableId } from "../utils/ids.js";
import { internalSourcePatternOrigins } from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins([
  "video_db_director",
  "hkuds_videoagent",
  "hkuds_vimax",
  "calesthio_openmontage",
  "vericontext_vibeframe",
  "youmind_awesome_seedance_2_prompts"
]);

const HIGH_RISK_CLAIM_PATTERN =
  /100%|guarantee|guaranteed|cure|heal|doctor|clinical|medical|overnight|income|profit|#1|best\b|weight loss/i;
const PRODUCT_SIGNAL_PATTERN = /\b(product|shop|store|ecommerce|sku|buy|order|checkout|sale|ad|ads?|landing|offer|cta)\b/i;
const TREND_SIGNAL_PATTERN = /\b(tiktok|tik\s*tok|douyin|reels?|shorts?|viral|trend|xu huong|native|creator|ugc)\b/i;
const CONVERSION_SIGNAL_PATTERN = /\b(buy|shop|order|checkout|sale|discount|coupon|lead|book|demo|signup|sign up|cta|try|purchase)\b/i;
const CONSIDERATION_SIGNAL_PATTERN = /\b(proof|review|demo|compare|comparison|versus|vs|testimonial|case study|why|objection|before|after)\b/i;
const RETENTION_SIGNAL_PATTERN = /\b(retention|loyal|repeat|community|membership|post-purchase|returning|upsell)\b/i;
const EDUCATION_INTENT_PATTERN =
  /\b(course|training|education|lesson|tutorial|teacher|teach|school|bootcamp|curriculum|cohort|how to|learn\s+(?:how|to|about|the\s+(?:skill|method|framework)))\b/i;

export class AudienceNicheIntelligencePlanner {
  public build(input: AudienceNicheIntelligenceInput): AudienceNicheIntelligence {
    if (!input.projectId.trim()) {
      throw new Error("projectId is required for audience niche intelligence.");
    }

    const prompt = cleanText(input.prompt, 4000) ?? "";
    const productTitle = cleanText(input.productTitle, 160);
    const productCategory = cleanText(input.productCategory, 120);
    const productBenefits = uniqueClean(input.productBenefits ?? [], 6, 180);
    const productClaims = uniqueClean(input.productClaims ?? [], 6, 180);
    const ctaCandidates = uniqueClean(input.ctaCandidates ?? [], 4, 80);
    const explicitAudience = cleanText(input.explicitAudience, 140);
    const brandTone = cleanText(input.brandTone, 100);
    const platform = cleanText(input.platform, 60);
    const combined = [
      prompt,
      productTitle,
      productCategory,
      productBenefits.join(" "),
      productClaims.join(" "),
      ctaCandidates.join(" "),
      explicitAudience,
      brandTone,
      platform
    ].filter(Boolean).join(" ");
    const lower = combined.toLowerCase();

    const userPresentationStyle = presentationStyleFrom(input, prompt, lower);
    const format = formatFrom(lower, input);
    const niche = nicheFrom(input, lower);
    const audience = audienceFrom(input, lower, niche);
    const funnelStage = funnelStageFrom(lower, ctaCandidates, format);
    const trendPosture = trendPostureFrom(lower, input, format, funnelStage);
    const viewerDesire = viewerDesireFrom(input, lower, niche, funnelStage);
    const viewerObjection = viewerObjectionFrom(input, lower, productClaims, funnelStage);
    const hookAngle = hookAngleFrom(trendPosture, format, niche, audience, viewerDesire);
    const retentionPattern = retentionPatternFrom(trendPosture, format, input.durationSeconds);
    const proofStrategy = proofStrategyFrom(format, productClaims, productBenefits, trendPosture);
    const shareTrigger = shareTriggerFrom(trendPosture, niche, audience);
    const ctaStrategy = ctaStrategyFrom(funnelStage, ctaCandidates);
    const localizationSignals = localizationSignalsFrom(lower);
    const riskSignals = riskSignalsFrom(lower, productClaims);
    const missingSignals = missingSignalsFrom({
      niche,
      audience,
      productBenefits,
      productClaims,
      ctaCandidates,
      ...(explicitAudience ? { explicitAudience } : {}),
      ...(platform ? { platform } : {})
    });
    const ideaSeeds = ideaSeedsFrom({
      hookAngle,
      retentionPattern,
      proofStrategy,
      shareTrigger,
      ctaStrategy,
      viewerDesire,
      viewerObjection,
      format,
      trendPosture
    });
    const intelligenceId = createStableId(
      "audience_niche",
      [
        input.projectId,
        prompt,
        productTitle ?? "",
        productCategory ?? "",
        audience,
        niche,
        funnelStage,
        format,
        trendPosture
      ].join(":")
    );

    return {
      schemaVersion: "cinejelly.audience-niche-intelligence.v1",
      intelligenceId,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      userPresentationStyle,
      niche,
      audience,
      funnelStage,
      format,
      trendPosture,
      viewerDesire,
      viewerObjection,
      hookAngle,
      retentionPattern,
      proofStrategy,
      shareTrigger,
      ctaStrategy,
      localizationSignals,
      riskSignals,
      missingSignals,
      ideaSeeds,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS
    };
  }
}

function presentationStyleFrom(
  input: AudienceNicheIntelligenceInput,
  prompt: string,
  lower: string
): AudienceNichePresentationStyle {
  if (/\b(approve|approved|ok|launch|publish|go live|final|ship|ready)\b/i.test(prompt)) {
    return "approval_or_launch";
  }
  if (/\b(change|revise|revision|remove|avoid|less|more|instead|fix|khong|dung|bo|sua)\b/i.test(prompt)) {
    return "revision_or_constraints";
  }
  if (input.productTitle || input.productCategory || input.productBenefits?.length || /https?:\/\/|www\.|sku|price|product facts?/i.test(prompt)) {
    return "product_url_or_facts";
  }
  if (/\b(cinematic|style|vibe|mood|reference|visual|camera|lighting|premium|luxury|tone|look)\b/i.test(prompt)) {
    return "creative_direction";
  }
  const sentenceLikeCount = (prompt.match(/[.!?;\n]/g) ?? []).length;
  if (prompt.length > 700 || sentenceLikeCount >= 8 || lower.split(/\s+/).length > 140) {
    return "rambling";
  }
  return "brief";
}

function formatFrom(lower: string, input: AudienceNicheIntelligenceInput): AudienceNicheFormat {
  if (/\bugc\b|creator|influencer|native|review/.test(lower)) return "ugc_review";
  if (/testimonial|customer story|customer proof/.test(lower)) return "testimonial";
  if (/compare|comparison|versus|vs|before after|before\/after/.test(lower)) return "comparison";
  if (/demo|how it works|show how|tutorial|walkthrough/.test(lower)) return "product_demo";
  if (EDUCATION_INTENT_PATTERN.test(lower) || /\b(explain|explainer)\b/.test(lower)) return "education";
  if (/case study|case-study|results breakdown/.test(lower)) return "case_study";
  if (/founder|brand story|documentary|journey|origin/.test(lower)) return "brand_story";
  if (/cinematic|film|trailer|short film|scene|movie|premium reveal|luxury/.test(lower)) return "cinematic_story";
  if (/community|challenge|duet|stitch|share with|membership/.test(lower)) return "community";
  if (/problem|pain|solution|fix|mistake/.test(lower)) return "problem_solution";
  if (PRODUCT_SIGNAL_PATTERN.test(lower) || input.productTitle || input.productBenefits?.length) return "product_ad";
  return "unknown";
}

function nicheFrom(input: AudienceNicheIntelligenceInput, lower: string): string {
  const categoryTitle = `${input.productCategory ?? ""} ${input.productTitle ?? ""}`;
  const productWeighted = normalizedSearchText(`${categoryTitle} ${lower}`);
  if (hasAnyTerm(productWeighted, ["news", "breaking news", "current event", "latest update", "commentary", "reaction commentary"])) return "news_commentary";
  if (hasAnyTerm(productWeighted, ["podcast", "interview clip", "guest clip", "host clip", "talk show"])) return "podcast_clip";
  if (hasAnyTerm(productWeighted, ["livestream", "live shop", "live shopping", "live commerce", "stream sale"])) return "livestream_commerce";
  if (hasAnyTerm(productWeighted, ["affiliate", "koc", "kol review", "creator review", "commission", "haul"])) return "affiliate_review";
  if (hasAnyTerm(productWeighted, ["beauty", "skincare", "skin care", "cosmetic", "serum", "makeup", "spa", "haircare"])) return "beauty_skincare";
  if (hasAnyTerm(productWeighted, ["fitness", "gym", "workout", "yoga", "wellness", "supplement", "nutrition"])) return "fitness_wellness";
  if (hasAnyTerm(productWeighted, ["desk", "workspace", "office", "remote worker", "remote workers", "desk setup", "cable organizer", "magnetic cable", "productivity accessory", "office accessory", "organizer"])) return "workspace_accessory";
  if (hasAnyTerm(productWeighted, ["fashion", "apparel", "clothing", "shoe", "sneaker", "jewelry", "watch", "handbag", "fashion accessory"])) return "fashion_apparel";
  if (hasAnyTerm(productWeighted, ["food", "restaurant", "drink", "beverage", "coffee", "meal", "recipe", "snack", "tea", "soda", "sparkling coffee"])) return "food_beverage";
  if (hasAnyTerm(productWeighted, ["real estate", "property", "home buyer", "apartment", "villa", "condo"])) return "real_estate";
  if (hasAnyTerm(productWeighted, ["finance", "investing", "investment", "trading", "crypto", "insurance", "loan", "tax", "accounting"])) return "finance_investing";
  if (hasAnyTerm(productWeighted, ["health", "clinic", "dentist", "doctor", "therapy", "medical"])) return "healthcare_services";
  if (hasAnyTerm(productWeighted, ["game", "gaming", "esport", "streamer"])) return "gaming_entertainment";
  if (hasAnyTerm(productWeighted, ["travel", "hotel", "resort", "tour", "destination", "airbnb", "hospitality"])) return "travel_hospitality";
  if (hasAnyTerm(productWeighted, ["mobile app", "app demo", "ios app", "android app", "consumer app"])) return "mobile_app";
  if (hasAnyTerm(productWeighted, ["saas", "software", "b2b", "crm", "automation", "agency", "client dashboard", "workflow", "dashboard"])) return "saas_b2b";
  if (EDUCATION_INTENT_PATTERN.test(productWeighted)) return "education_course";
  if (hasAnyTerm(productWeighted, ["event", "venue", "wedding", "concert", "party booking"])) return "event_venue";
  if (hasAnyTerm(productWeighted, ["auto service", "car repair", "mechanic", "detailing"])) return "auto_service";
  if (hasAnyTerm(productWeighted, ["home repair", "plumber", "cleaning", "electrician", "pest control"])) return "home_repair";
  if (hasAnyTerm(productWeighted, ["local service", "salon", "repair", "cleaning", "lawyer", "plumber"])) return "local_service";
  if (hasAnyTerm(productWeighted, ["pet", "dog", "cat", "pet care", "family lifestyle", "baby"])) return "family_lifestyle";
  if (hasAnyTerm(productWeighted, ["sports", "basketball", "football", "soccer", "tennis", "running"])) return "sports";
  if (hasAnyTerm(productWeighted, ["creator tool", "content tool", "editing tool", "content calendar"])) return "creator_tools";
  if (hasAnyTerm(productWeighted, ["founder", "brand story", "documentary", "journey", "case study"])) return "brand_story_documentary";
  if (hasAnyTerm(productWeighted, ["cinematic", "film", "trailer", "short film", "movie"])) return "cinematic_story";
  if (input.productCategory) return safeSlug(input.productCategory, "product_category");
  if (PRODUCT_SIGNAL_PATTERN.test(lower) || input.productTitle) return "ecommerce_product_video";
  const explicitNiche = extractExplicitNiche(lower);
  if (explicitNiche) return safeSlug(explicitNiche, "custom_niche");
  return "general_video";
}

function audienceFrom(input: AudienceNicheIntelligenceInput, lower: string, niche: string): string {
  const explicit = cleanText(input.explicitAudience, 140) ?? extractExplicitAudience(lower);
  if (explicit) {
    return explicit;
  }
  switch (niche) {
    case "beauty_skincare":
      return "beauty buyers who need visible proof before trying a product";
    case "fitness_wellness":
      return "wellness buyers who want a practical result without hype";
    case "affiliate_review":
      return "buyers who trust creator recommendations only when the proof and limits are clear";
    case "news_commentary":
      return "viewers who want a fast, accurate explanation of why the update matters";
    case "podcast_clip":
      return "viewers who want one strong idea visualized quickly";
    case "livestream_commerce":
      return "live-shopping viewers who need product proof before acting";
    case "fashion_apparel":
      return "style-conscious buyers comparing fit, use case, and identity";
    case "food_beverage":
      return "taste-driven viewers who respond to sensory proof and occasion";
    case "real_estate":
      return "property buyers or renters comparing trust, location, and lifestyle";
    case "finance_investing":
      return "financial decision makers who need credibility before action";
    case "healthcare_services":
      return "health-conscious viewers who need safe, substantiated guidance";
    case "gaming_entertainment":
      return "fans who want novelty, identity, and a clear payoff";
    case "travel_hospitality":
      return "travelers comparing experience, trust, and a reason to book";
    case "saas_b2b":
      return "business decision makers comparing value, time savings, and proof";
    case "mobile_app":
      return "app users who need to understand the job-to-be-done before installing";
    case "education_course":
      return "learners who need a clear promise, steps, and progress proof";
    case "workspace_accessory":
      return "remote workers and desk-setup viewers who want a cleaner workspace";
    case "brand_story_documentary":
      return "viewers who need trust, context, and emotional proof";
    case "cinematic_story":
      return "viewers who expect strong mood, continuity, and payoff";
    case "ecommerce_product_video":
      return "buyers who need fast proof before purchase";
    case "event_venue":
      return "people planning an event who need atmosphere, trust, and logistics confidence";
    case "auto_service":
    case "home_repair":
    case "local_service":
      return "local buyers who need fast trust, process proof, and low-friction booking";
    case "family_lifestyle":
      return "family and lifestyle viewers who respond to safe, relatable everyday moments";
    case "sports":
      return "sports viewers who want practical improvement, identity, and replayable moments";
    case "creator_tools":
      return "creators who need a faster content workflow with proof";
    default:
      return "general audience";
  }
}

function funnelStageFrom(
  lower: string,
  ctaCandidates: readonly string[],
  format: AudienceNicheFormat
): AudienceNicheFunnelStage {
  if (RETENTION_SIGNAL_PATTERN.test(lower) || format === "community") return "retention";
  if (CONVERSION_SIGNAL_PATTERN.test(lower) || ctaCandidates.length > 0 || format === "product_ad") return "conversion";
  if (CONSIDERATION_SIGNAL_PATTERN.test(lower) || format === "ugc_review" || format === "product_demo" || format === "comparison") {
    return "consideration";
  }
  return "awareness";
}

function trendPostureFrom(
  lower: string,
  input: AudienceNicheIntelligenceInput,
  format: AudienceNicheFormat,
  funnelStage: AudienceNicheFunnelStage
): AudienceNicheTrendPosture {
  const platform = input.platform?.toLowerCase() ?? "";
  if (TREND_SIGNAL_PATTERN.test(`${lower} ${platform}`) || format === "ugc_review") return "trend_native";
  if (format === "cinematic_story") return "cinematic_premium";
  if (format === "education") return "educational_search";
  if (format === "brand_story" || format === "case_study") return "story_authority";
  if (format === "community" || funnelStage === "retention") return "community_social";
  if (format === "product_ad" || format === "product_demo" || format === "comparison" || funnelStage === "conversion") return "proof_led";
  return "evergreen";
}

function viewerDesireFrom(
  input: AudienceNicheIntelligenceInput,
  lower: string,
  niche: string,
  funnelStage: AudienceNicheFunnelStage
): string {
  const firstBenefit = firstClean(input.productBenefits, 180);
  if (firstBenefit) {
    return firstBenefit;
  }
  const explicit = extractAfter(lower, /\b(?:want|need|goal|desire|mong muon|muon|can|dat duoc)\s*[:\-]?\s*([^.!?;]{5,140})/i);
  if (explicit) {
    return explicit;
  }
  if (funnelStage === "conversion") return "confidence to take the next step now";
  switch (niche) {
    case "beauty_skincare":
      return "a visible, believable beauty result in a daily routine";
    case "saas_b2b":
      return "a faster workflow with less manual effort";
    case "education_course":
      return "a clear path from confusion to useful skill";
    case "workspace_accessory":
      return "a cleaner desk setup with less cable friction";
    case "fitness_wellness":
      return "a practical improvement that feels achievable";
    default:
      return "a specific payoff that feels worth watching and acting on";
  }
}

function viewerObjectionFrom(
  input: AudienceNicheIntelligenceInput,
  lower: string,
  productClaims: readonly string[],
  funnelStage: AudienceNicheFunnelStage
): string {
  const explicit = extractAfter(
    lower,
    /\b(?:objection|hesitation|concern|worry|afraid|doubt|viewer may|viewer might|customer may|khach ngai|lo ngai|so rang|nhung lo)\s*[:\-]?\s*([^.!?;]{5,140})/i
  );
  if (explicit) {
    return explicit;
  }
  if (productClaims.some((claim) => HIGH_RISK_CLAIM_PATTERN.test(claim)) || HIGH_RISK_CLAIM_PATTERN.test(input.prompt)) {
    return "viewer may not trust the claim without visible proof or substantiation";
  }
  if (funnelStage === "conversion") return "viewer may think the offer is just another ad unless proof appears fast";
  if (funnelStage === "consideration") return "viewer may compare alternatives unless the proof feels specific";
  return "viewer may scroll if the first beat feels generic";
}

function hookAngleFrom(
  trendPosture: AudienceNicheTrendPosture,
  format: AudienceNicheFormat,
  niche: string,
  audience: string,
  viewerDesire: string
): string {
  if (trendPosture === "trend_native") {
    return `native first-second POV for ${audience}: show the tension before promising ${viewerDesire}`;
  }
  if (trendPosture === "proof_led") {
    return `proof-first hook for ${niche}: show the claim, mechanism, or before-state before the brand pitch`;
  }
  if (trendPosture === "educational_search") {
    return `teach the mistake or missing step first, then reveal the practical path to ${viewerDesire}`;
  }
  if (trendPosture === "story_authority") {
    return "open with the decision, failure, or proof moment that makes the story worth trusting";
  }
  if (trendPosture === "cinematic_premium" || format === "cinematic_story") {
    return "open with a cinematic visual contradiction that makes the payoff feel premium";
  }
  return `start with a specific ${niche} promise that the viewer can understand immediately`;
}

function retentionPatternFrom(
  trendPosture: AudienceNicheTrendPosture,
  format: AudienceNicheFormat,
  durationSeconds: number | undefined
): string {
  const durationClass = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds <= 45
      ? "short"
      : durationSeconds <= 120
        ? "mid"
        : "long"
    : "unknown";
  if (trendPosture === "trend_native") return "hook, proof tease, fast visual change, payoff, then soft CTA without feeling like a template";
  if (format === "product_demo") return "problem, mechanism, usage step, visible result, then objection close";
  if (format === "education") return durationClass === "long"
    ? "curiosity gap, lesson steps, example, recap, and next action"
    : "mistake, quick fix, example, and next action";
  if (trendPosture === "story_authority") return "context, conflict, decision, proof, consequence, and memory hook";
  return "specific promise, escalating evidence, visual payoff, and one clear next action";
}

function proofStrategyFrom(
  format: AudienceNicheFormat,
  productClaims: readonly string[],
  productBenefits: readonly string[],
  trendPosture: AudienceNicheTrendPosture
): string {
  const firstClaim = firstClean(productClaims, 160);
  const firstBenefit = firstClean(productBenefits, 160);
  if (firstClaim) return `turn the claim "${firstClaim}" into visible, review-bound evidence before render`;
  if (firstBenefit) return `prove the benefit "${firstBenefit}" through action, result, or side-by-side context`;
  if (format === "ugc_review") return "use creator-style lived experience, sensory proof, and a visible before-state/payoff";
  if (trendPosture === "story_authority") return "use decision evidence, stakes, and consequence rather than generic claims";
  return "show observable evidence rather than relying on slogans or unreviewed claims";
}

function shareTriggerFrom(trendPosture: AudienceNicheTrendPosture, niche: string, audience: string): string {
  if (trendPosture === "trend_native") return `relatable ${niche} moment that ${audience} would repost or tag someone into`;
  if (trendPosture === "educational_search") return "a mistake, checklist, or shortcut viewers want to save";
  if (trendPosture === "community_social") return "identity signal that lets viewers feel seen by the group";
  if (trendPosture === "cinematic_premium") return "a visually satisfying reveal worth rewatching";
  return "specific proof or payoff that feels useful enough to remember";
}

function ctaStrategyFrom(funnelStage: AudienceNicheFunnelStage, ctaCandidates: readonly string[]): string {
  const firstCta = firstClean(ctaCandidates, 80);
  if (firstCta) return `earn the reviewed CTA "${firstCta}" only after proof and payoff`;
  if (funnelStage === "conversion") return "use one low-friction next step after proof";
  if (funnelStage === "consideration") return "invite comparison, save, or learn more after the proof stack";
  if (funnelStage === "retention") return "ask viewers to return, share, or join after the identity payoff";
  return "close with a memorable payoff instead of forcing a hard sell";
}

function localizationSignalsFrom(lower: string): readonly string[] {
  return uniqueClean([
    /\b(vietnam|vietnamese|viet|vi|tieng viet|vn)\b/.test(lower) ? "vietnamese_or_vn_market" : undefined,
    /\b(us|usa|america|english|en)\b/.test(lower) ? "english_or_us_market" : undefined,
    /\b(thailand|thai|bangkok)\b/.test(lower) ? "thai_market" : undefined,
    /\b(japan|japanese|jp)\b/.test(lower) ? "japanese_market" : undefined,
    /\b(korea|korean|kr)\b/.test(lower) ? "korean_market" : undefined
  ], 5, 80);
}

function riskSignalsFrom(lower: string, productClaims: readonly string[]): readonly string[] {
  return uniqueClean([
    hasCopyRiskIntent(lower) ? "copy_or_clone_request" : undefined,
    HIGH_RISK_CLAIM_PATTERN.test(lower) || productClaims.some((claim) => HIGH_RISK_CLAIM_PATTERN.test(claim))
      ? "claim_substantiation_required"
      : undefined,
    /\bmedical|health|finance|investment|legal|insurance|tax\b/.test(lower) ? "regulated_category_review" : undefined,
    /\bcelebrity|competitor|trademark|logo\b/.test(lower) ? "brand_or_rights_review" : undefined
  ], 6, 100);
}

function missingSignalsFrom(input: {
  readonly niche: string;
  readonly audience: string;
  readonly explicitAudience?: string;
  readonly productBenefits: readonly string[];
  readonly productClaims: readonly string[];
  readonly platform?: string;
  readonly ctaCandidates: readonly string[];
}): readonly string[] {
  return uniqueClean([
    input.niche === "general_video" ? "specific_niche" : undefined,
    !input.explicitAudience && input.audience === "general audience" ? "explicit_audience" : undefined,
    input.productBenefits.length === 0 ? "viewer_benefit" : undefined,
    input.productClaims.length === 0 ? "proof_or_claim_source" : undefined,
    !input.platform ? "platform" : undefined,
    input.ctaCandidates.length === 0 ? "desired_next_action" : undefined
  ], 6, 80);
}

function ideaSeedsFrom(input: {
  readonly hookAngle: string;
  readonly retentionPattern: string;
  readonly proofStrategy: string;
  readonly shareTrigger: string;
  readonly ctaStrategy: string;
  readonly viewerDesire: string;
  readonly viewerObjection: string;
  readonly format: AudienceNicheFormat;
  readonly trendPosture: AudienceNicheTrendPosture;
}): readonly string[] {
  return uniqueClean([
    `Hook: ${input.hookAngle}`,
    `Desire/objecting tension: ${input.viewerDesire} vs ${input.viewerObjection}`,
    `Format/posture: ${input.format} with ${input.trendPosture}`,
    `Retention: ${input.retentionPattern}`,
    `Proof: ${input.proofStrategy}`,
    `Share/CTA: ${input.shareTrigger}; ${input.ctaStrategy}`
  ], 6, 240);
}

function normalizedSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyTerm(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => termBoundaryPattern(term).test(value));
}

function termBoundaryPattern(term: string): RegExp {
  const escaped = term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
}

function extractExplicitNiche(lower: string): string | undefined {
  return extractAfter(lower, /\b(?:niche|ngach|ngach la|industry|market)\s+([a-z0-9][^.,;!?]{3,90})/i);
}

function extractExplicitAudience(lower: string): string | undefined {
  return extractAfter(lower, /\b(?:for|cho|danh cho|target audience|audience|khach hang|khach)\s+([a-z0-9][^.,;!?]{3,120})/i);
}

function extractAfter(value: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(value);
  const candidate = cleanText(match?.[1], 140);
  if (!candidate) return undefined;
  return trimAudienceConnectors(candidate);
}

function trimAudienceConnectors(value: string): string {
  const parts = value.split(/\b(?:with|without|using|use|on tiktok|on reels|on youtube|that|who|and make|make it|de|voi)\b/i);
  return cleanText(parts[0], 120) ?? value;
}

function safeSlug(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function firstClean(values: readonly string[] | undefined, maxLength: number): string | undefined {
  const first = values?.[0];
  return cleanText(first, maxLength);
}

function cleanText(value: string | undefined, maxLength = 240): string | undefined {
  const normalized = redactUnsafeText(value)?.replace(/\s+/g, " ").trim();
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

function redactUnsafeText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value
    .replace(/https?:\/\/[^\s"')]+/gi, "[redacted_url]")
    .replace(/\b[A-Za-z]:\\[^\s"')]+/g, "[redacted_path]")
    .replace(/\\\\[^\s"')]+/g, "[redacted_path]")
    .replace(/\b(?:api[_-]?key|access[_-]?key|token|secret|signature|password|credential|authorization|auth)\s*=\s*[^&\s"')]+/gi, "[redacted_secret]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, "bearer [redacted_secret]");
}
