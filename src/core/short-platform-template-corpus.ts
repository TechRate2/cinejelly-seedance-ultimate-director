/**
 * Platform template training corpus for short-form candidates.
 *
 * This layer stores transformed structure learned from public docs, licensed
 * prompt skills, and platform-style marketing workflows. It does not copy raw
 * third-party templates or prompt wording into runtime prompts.
 */

import type {
  ShortCreativePatternKind,
  ShortCreativePatternSource,
  ShortViralCreativeMode,
  ShortViralPlatformFocus
} from "../types/short-viral-intelligence.js";
import {
  internalSourcePatternOrigins,
  SHORT_PLATFORM_TEMPLATE_CORPUS_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

export const SHORT_PLATFORM_TEMPLATE_CORPUS_ORIGINS = internalSourcePatternOrigins(
  SHORT_PLATFORM_TEMPLATE_CORPUS_SOURCE_PATTERN_IDS
);

type PlatformTemplateSource = Extract<ShortCreativePatternSource, "platform_template_corpus">;

export interface ShortPlatformTemplateCorpusRetrievalInput {
  readonly prompt: string;
  readonly niche: string;
  readonly creativeMode: ShortViralCreativeMode;
  readonly platformFocus: ShortViralPlatformFocus;
  readonly audience: string;
  readonly buyerIntent: string;
  readonly targetDurationSeconds: number;
  readonly ideaSeeds: readonly string[];
  readonly hasReferenceVideo: boolean;
  readonly hasProductEvidence: boolean;
}

export interface ShortPlatformTemplatePatternSpec {
  readonly kind: ShortCreativePatternKind;
  readonly label: string;
  readonly source: PlatformTemplateSource;
  readonly nicheTags: readonly string[];
  readonly hookMechanic: string;
  readonly retentionMechanic: string;
  readonly proofDevice: string;
  readonly payoffMechanic: string;
  readonly creatorOrKolRole: string;
  readonly adaptationRule: string;
  readonly riskControls: readonly string[];
  readonly fitReasons: readonly string[];
  readonly keywordSignals: readonly string[];
  readonly modeSignals: readonly ShortViralCreativeMode[];
  readonly platformSignals: readonly ShortViralPlatformFocus[];
  readonly sourceRepository: string;
  readonly license: "MIT" | "public-docs-observation" | "operator-approved";
  readonly sourceTransform: "distilled_template_structure_no_verbatim_copy";
  readonly commercialUseAllowed: boolean;
}

export interface ShortPlatformTemplateCorpusCoverage {
  readonly schemaVersion: "cinejelly.short-platform-template-corpus-coverage.v1";
  readonly sourceCount: number;
  readonly templateArchetypeCount: number;
  readonly nicheFamilyCount: number;
  readonly declaredPatternMatrixCount: number;
  readonly retrievalTopK: number;
  readonly promptTextBundlingPolicy: "no_raw_third_party_template_text_runtime_uses_distilled_structure";
  readonly trendVideoIntakeSupported: true;
  readonly commercialGuardrail: "license_and_public_docs_lineage_no_proprietary_ui_scrape";
}

interface PlatformTemplateEntry {
  readonly kind: ShortCreativePatternKind;
  readonly label: string;
  readonly nicheTags: readonly string[];
  readonly keywordSignals: readonly string[];
  readonly modeSignals: readonly ShortViralCreativeMode[];
  readonly platformSignals?: readonly ShortViralPlatformFocus[];
  readonly hookMechanic: string;
  readonly retentionMechanic: string;
  readonly proofDevice: string;
  readonly payoffMechanic: string;
  readonly creatorOrKolRole: string;
  readonly adaptationRule: string;
  readonly riskControls?: readonly string[];
  readonly sourceRepository: string;
  readonly license: "MIT" | "public-docs-observation" | "operator-approved";
}

const PLATFORM_NICHE_FAMILIES = [
  "beauty_skincare",
  "fashion_apparel",
  "food_beverage",
  "restaurant",
  "travel_hospitality",
  "real_estate",
  "local_service",
  "home_repair",
  "auto_service",
  "fitness_wellness",
  "health_wellness",
  "finance_education",
  "legal_education",
  "education_course",
  "saas_b2b",
  "mobile_app",
  "creator_tools",
  "workspace_accessory",
  "tech_gadget",
  "gaming_entertainment",
  "event_venue",
  "livestream_commerce",
  "affiliate_review",
  "koc_kol",
  "news_commentary",
  "podcast_clip",
  "faceless",
  "ecommerce",
  "jewelry_accessory",
  "luxury",
  "family_lifestyle",
  "sports",
  "pet",
  "venue",
  "agency",
  "productivity",
  "insurance",
  "tax",
  "salon",
  "furniture",
  "decor",
  "footwear",
  "wellness",
  "founder_story",
  "creator_commentary",
  "software",
  "app",
  "home_lifestyle"
] as const;

const PLATFORM_TEMPLATE_ARCHETYPES: readonly PlatformTemplateEntry[] = [
  entry("problem_demo_payoff", "Product URL to UGC proof sprint", ["all", "ecommerce", "beauty_skincare", "fashion_apparel", "tech_gadget"], ["product url", "ugc", "ad", "review", "shop", "landing page"], ["ugc_review", "product_ad", "demo"], "open on the buyer pain inferred from product facts before the brand appears", "pain, product handling, proof detail, human payoff, soft CTA", "product URL facts plus visible product handling", "viewer understands why the product fits their situation", "KOL behaves like a buyer translating product facts into a lived moment", "derive structure from product facts, never from a fixed platform template", "Topview AI public API/docs", "public-docs-observation"),
  entry("creator_confession", "Avatar spokesperson plus product cutaway", ["all", "saas_b2b", "education_course", "finance_education", "local_service"], ["avatar", "spokesperson", "talking head", "voiceover", "explainer"], ["education", "product_ad", "problem_solution"], "open with one spoken objection the audience already has", "talking head objection, product cutaway, proof example, return to human payoff", "speaker script plus product or workflow visual proof", "viewer trusts the explanation because visuals prove the claim", "avatar/KOL speaks plainly while B-roll carries evidence", "use original script and approved voice; do not imitate a third-party avatar identity", "Topview AI public API/docs", "public-docs-observation"),
  entry("cinematic_reveal", "Higgsfield product insertion hero frame", ["all", "luxury", "jewelry_accessory", "fashion_apparel", "food_beverage"], ["product to video", "insert product", "hero frame", "cinematic", "commercial"], ["cinematic", "product_ad"], "open with the product already physically present in a compelling scene", "hero frame, camera move, material detail, human scale, restrained CTA", "product geometry, material, packaging, and environment fit", "viewer feels the product belongs in the scene", "KOL or hands interact with the product as a real object, not a sticker", "preserve user product geometry; generate a new scene and camera path", "Higgsfield official product-to-video guide", "public-docs-observation"),
  entry("sensory_closeup", "Higgsfield micro-camera product motion", ["all", "beauty_skincare", "food_beverage", "tech_gadget", "workspace_accessory"], ["macro", "camera movement", "close up", "texture", "motion"], ["demo", "product_ad", "cinematic"], "start with a tactile macro detail that makes the product inspectable", "macro detail, controlled motion, use context, endpoint proof", "texture, mechanism, material, or packaging continuity", "viewer remembers the visual feel of the product", "KOL uses hands and micro-pauses to make the object feel real", "use platform-style camera specificity without copying prompt phrasing", "Higgsfield official cinematic prompt guide", "public-docs-observation"),
  entry("workflow_before_after", "SaaS screenless workflow ad", ["saas_b2b", "mobile_app", "creator_tools", "productivity", "agency"], ["workflow", "dashboard", "automation", "app", "tool", "before after"], ["problem_solution", "demo", "product_ad"], "open on the offline mess or manual work before showing software", "mess, one feature action, human result, calm after-state", "reviewed workflow fact or approved UI asset", "viewer sees the job-to-be-done, not a feature list", "operator/KOL narrates like a practitioner fixing a real workflow", "avoid fake UI text, invented metrics, and unapproved customer logos", "Topview AI public API/docs", "public-docs-observation"),
  entry("micro_story_twist", "Native TikTok skit ad rewrite", ["all", "beauty_skincare", "fashion_apparel", "local_service", "food_beverage"], ["pov", "skit", "meme", "funny", "trend", "awkward"], ["story", "ugc_review", "product_ad"], "start with a recognizable niche situation before the product is named", "setup, awkward beat, product entrance, reaction, payoff", "relatable scene plus visible product/service proof", "viewer shares because the situation feels familiar", "KOL acts natural and slightly imperfect, not like a presenter", "rewrite characters, action, script, and props for the user product", "CineJelly operator-approved source-video remake patterns", "operator-approved"),
  entry("community_reaction", "Comment-to-answer UGC ad", ["all", "livestream_commerce", "beauty_skincare", "food_beverage", "education_course"], ["comment", "question", "answer", "reply", "live"], ["ugc_review", "education", "product_ad"], "open with a generalized viewer question or objection", "question, quick answer, proof close-up, human reaction, next step", "approved answer proof and product facts", "viewer feels the ad responds to a real doubt", "host/KOL answers quickly with useful specificity", "do not fabricate named comments or fake live metrics", "Topview AI public API/docs", "public-docs-observation"),
  entry("comparison_test", "Honest affiliate decision matrix", ["affiliate_review", "koc_kol", "ecommerce", "tech_gadget", "beauty_skincare", "fashion_apparel"], ["affiliate", "worth it", "ranking", "haul", "comparison"], ["ugc_review", "comparison", "product_ad"], "open with the personal criterion before the product verdict", "criterion, product test, honest drawback, recommendation boundary, CTA", "observable criterion proof and one limitation", "viewer trusts because the recommendation has a boundary", "KOC/KOL behaves like a careful buyer, not a hard seller", "disclose commercial relationship per policy and avoid absolute claims", "Topview AI public API/docs", "public-docs-observation"),
  entry("first_try_reaction", "First-use reaction with proof delay", ["beauty_skincare", "food_beverage", "tech_gadget", "workspace_accessory", "ecommerce"], ["first try", "reaction", "test", "unbox", "does it work"], ["ugc_review", "demo", "testimonial"], "show the reaction setup before explaining the product", "first touch, test rule, proof attempt, reaction, verdict", "visible product interaction and bounded claim", "viewer stays for the verdict", "KOL tests with natural hesitation and real timing", "do not fake impossible transformations or objective superiority", "OSideMedia/higgsfield-ai-prompt-skill", "MIT"),
  entry("before_after_guarded", "Before-after without miracle claim", ["beauty_skincare", "fitness_wellness", "home_lifestyle", "workspace_accessory", "local_service"], ["before", "after", "transformation", "glow up", "reset"], ["comparison", "ugc_review", "product_ad"], "open on the before-state as an everyday friction, not a miracle promise", "baseline, method, proof condition, after-state, cautious payoff", "same-condition visual proof or reviewed process proof", "viewer believes because the boundary is clear", "KOL states the limit of what is shown and avoids overclaiming", "route transformation claims through review before render", "Higgsfield official product-to-video guide", "public-docs-observation", ["manual claim review required"]),
  entry("hidden_detail_reveal", "Topview-style hidden value reveal", ["all", "saas_b2b", "real_estate", "travel_hospitality", "luxury", "workspace_accessory"], ["hidden", "detail", "value", "why it matters", "missed"], ["education", "demo", "product_ad"], "open with the overlooked detail viewers usually miss", "detail, why it matters, proof context, payoff, save/inquire cue", "specific detail proof instead of broad hype", "viewer saves or asks because the detail is useful", "creator behaves like a practical guide noticing what others miss", "do not invent facts, prices, locations, metrics, or availability", "Topview AI public API/docs", "public-docs-observation"),
  entry("mistake_fix", "Niche mistake to product-safe fix", ["all", "education_course", "finance_education", "legal_education", "fitness_wellness", "beauty_skincare"], ["mistake", "avoid", "fix", "tips", "wrong"], ["education", "problem_solution", "product_ad"], "open with the mistake that creates the strongest viewer self-recognition", "mistake, consequence, safer fix, product/helper moment, save cue", "example-based proof with category boundaries", "viewer saves because the advice feels immediately useful", "creator teaches as a helper, not as a scold", "regulated niches require source/fact review and no personal advice", "OSideMedia/higgsfield-ai-prompt-skill", "MIT", ["regulated category review required"]),
  entry("proof_diary", "Multi-day diary proof arc", ["beauty_skincare", "fitness_wellness", "wellness", "education_course", "creator_tools"], ["day", "diary", "journey", "challenge", "routine"], ["ugc_review", "testimonial", "demo"], "open with a day-one baseline and a reason to follow the arc", "repeatable moments, micro proof, honest reaction, guarded payoff", "time-based proof with same-condition framing", "viewer follows because the arc has continuity", "KOL records consistent moments and avoids acting overly polished", "only use repeated-result claims when evidence is approved", "CineJelly operator-approved source-video remake patterns", "operator-approved"),
  entry("routine_rescue", "GRWM routine product insertion", ["beauty_skincare", "fashion_apparel", "jewelry_accessory", "footwear", "home_lifestyle"], ["grwm", "routine", "get ready", "morning", "outfit"], ["ugc_review", "demo", "product_ad"], "open inside the routine before any sales line", "routine pressure, product detail, movement/mirror check, payoff", "routine integration proof and product fit", "viewer imagines using it in their own routine", "KOL behaves like a friend solving a small routine problem", "avoid stock template phrases and adapt to user wardrobe/product facts", "Higgsfield official cinematic prompt guide", "public-docs-observation"),
  entry("challenge_progress", "Challenge with a visible rule", ["all", "food_beverage", "tech_gadget", "fitness_wellness", "creator_tools"], ["challenge", "test", "experiment", "try", "rule"], ["demo", "ugc_review", "problem_solution"], "state a simple test rule before the product pitch", "rule, attempt, obstacle, result, next step", "observable test, not a vague testimonial", "viewer stays to see if the test works", "creator becomes the tester and keeps reactions bounded", "keep tests safe, honest, and review-bound", "OSideMedia/higgsfield-ai-prompt-skill", "MIT"),
  entry("cinematic_reveal", "Luxury object inspection loop", ["luxury", "jewelry_accessory", "fashion_apparel", "tech_gadget", "real_estate"], ["luxury", "premium", "watch", "jewelry", "detail", "cinematic"], ["cinematic", "product_ad"], "open on a tiny material detail catching real light", "micro detail, human scale, slow handling, full reveal, restrained CTA", "material finish, scale, packaging, or space detail proof", "viewer wants to inspect rather than skip", "KOL handles the product slowly and confidently", "do not add unsupported premium claims or fake heritage", "Higgsfield official cinematic prompt guide", "public-docs-observation"),
  entry("myth_bust", "Hot-topic myth to product-safe angle", ["news_commentary", "education_course", "finance_education", "legal_education", "health_wellness"], ["news", "hot", "latest", "myth", "truth", "commentary"], ["education", "problem_solution", "product_ad"], "open with the hot misconception, then immediately narrow scope", "myth, context, safe interpretation, product-relevant example, review cue", "source-bound fact or user-provided summary", "viewer feels updated without being manipulated", "KOL reacts like an informed guide, not a news copier", "current facts require verification; avoid exploiting tragedy or sensitive events", "CineJelly operator-approved source-video remake patterns", "operator-approved", ["live/current news requires source verification"]),
  entry("community_reaction", "Street/social reaction proof", ["fashion_apparel", "food_beverage", "event_venue", "local_service", "restaurant"], ["street", "vox pop", "reaction", "friends", "crowd"], ["story", "testimonial", "ugc_review"], "open on a respectful public-style reaction or social cue", "question, product/place proof, reaction, social payoff", "approved participant or generalized social proof", "viewer watches for the next reaction", "host keeps interaction fast, respectful, and specific", "use approved people/location rights and avoid fake testimonials", "Topview AI public API/docs", "public-docs-observation"),
  entry("sensory_closeup", "Faceless hands-only proof loop", ["faceless", "beauty_skincare", "food_beverage", "workspace_accessory", "home_lifestyle"], ["faceless", "hands", "asmr", "b-roll", "product hands"], ["demo", "ugc_review", "product_ad"], "open with hands doing the most inspectable action", "hands, close-up proof, context, endpoint, replayable payoff", "hands-on product proof without face identity", "viewer understands even on mute", "creator presence is implied through timing and touch", "make hand physics believable and product geometry stable", "Higgsfield official cinematic prompt guide", "public-docs-observation"),
  entry("workflow_before_after", "Creator tool pipeline rescue", ["creator_tools", "saas_b2b", "productivity", "agency", "mobile_app"], ["creator", "calendar", "content", "workflow", "pipeline"], ["problem_solution", "demo", "product_ad"], "open on content/work chaos before naming the tool", "chaos, one tool step, output proof, calmer routine, CTA", "workflow example proof without growth guarantees", "viewer sees how the tool fits their actual work", "creator narrates from workflow pain", "avoid revenue, follower, or platform performance guarantees", "Topview AI public API/docs", "public-docs-observation"),
  entry("problem_demo_payoff", "Local-service rescue mini-story", ["local_service", "home_repair", "auto_service", "salon", "restaurant"], ["repair", "booking", "service", "emergency", "salon"], ["problem_solution", "story", "product_ad"], "open at the awkward service problem moment", "problem, service action, proof detail, relieved payoff, booking cue", "service/process proof and reviewed offer facts", "viewer remembers who to call when the pain happens", "technician/host is helpful and concrete", "avoid unsafe staged emergencies and fake testimonials", "Topview AI public API/docs", "public-docs-observation"),
  entry("comparison_test", "Old-way new-way split proof", ["all", "saas_b2b", "workspace_accessory", "local_service", "education_course"], ["old way", "new way", "versus", "split", "compare"], ["comparison", "problem_solution", "demo"], "open with the old way visibly failing", "old way, new way, proof contrast, human payoff, save/demo cue", "observable comparison proof", "viewer understands the better path quickly", "KOL compares without attacking competitors", "compare only reviewed facts and avoid fake UI text", "OSideMedia/higgsfield-ai-prompt-skill", "MIT"),
  entry("workflow_before_after", "Marketing-studio mode router", ["all", "ecommerce", "beauty_skincare", "fashion_apparel", "food_beverage", "tech_gadget", "saas_b2b", "mobile_app"], ["ugc", "unboxing", "review", "showcase", "try-on", "marketing studio", "mode"], ["ugc_review", "product_ad", "demo", "cinematic"], "open with the strongest inferred mode for the buyer job instead of asking the user to choose a template", "mode match, product/KOL proof, native platform rhythm, bounded CTA", "input assets, product facts, and audience intent decide the mode", "viewer gets a format that feels native to the niche", "KOL acts inside the selected mode: unboxing, review, showcase, try-on, or proof demo", "route by product, KOL, reference media, and niche signals; never expose a rigid template picker as the creative brain", "higgsfield-ai/skills", "MIT"),
  entry("problem_demo_payoff", "Virality predictor iteration loop", ["all", "affiliate_review", "koc_kol", "creator_tools", "ecommerce", "news_commentary", "podcast_clip"], ["viral", "score", "hook", "retention", "iteration", "candidate", "predict"], ["ugc_review", "product_ad", "education", "story"], "open with the candidate's most testable retention promise", "hook variant, retention risk, proof repair, revised payoff, candidate score reason", "candidate score factors: hook clarity, proof density, visual novelty, share/save cue", "viewer sees a sharper version after weak spots are repaired", "agent behaves like a creative director choosing the strongest candidate, not a random template generator", "score multiple candidates with explainable reasons and use scores only as guidance before human/output review", "higgsfield-ai/skills", "MIT")
] as const;

export const SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE: ShortPlatformTemplateCorpusCoverage = {
  schemaVersion: "cinejelly.short-platform-template-corpus-coverage.v1",
  sourceCount: SHORT_PLATFORM_TEMPLATE_CORPUS_ORIGINS.length,
  templateArchetypeCount: PLATFORM_TEMPLATE_ARCHETYPES.length,
  nicheFamilyCount: PLATFORM_NICHE_FAMILIES.length,
  declaredPatternMatrixCount: PLATFORM_TEMPLATE_ARCHETYPES.length * PLATFORM_NICHE_FAMILIES.length,
  retrievalTopK: 48,
  promptTextBundlingPolicy: "no_raw_third_party_template_text_runtime_uses_distilled_structure",
  trendVideoIntakeSupported: true,
  commercialGuardrail: "license_and_public_docs_lineage_no_proprietary_ui_scrape"
};

export function retrieveShortPlatformTemplatePatterns(
  input: ShortPlatformTemplateCorpusRetrievalInput
): readonly ShortPlatformTemplatePatternSpec[] {
  const haystack = normalizedText([
    input.prompt,
    input.niche,
    input.creativeMode,
    input.platformFocus,
    input.audience,
    input.buyerIntent,
    ...input.ideaSeeds
  ]);
  return PLATFORM_TEMPLATE_ARCHETYPES
    .map((entryItem, index) => ({
      entry: entryItem,
      index,
      score: platformFitScore(entryItem, input, haystack)
    }))
    .filter((item) => item.score >= 0.24)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.retrievalTopK)
    .flatMap((item) => toSpecs(item.entry, item.score, input))
    .slice(0, SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.retrievalTopK);
}

function toSpecs(
  entryItem: PlatformTemplateEntry,
  score: number,
  input: ShortPlatformTemplateCorpusRetrievalInput
): readonly ShortPlatformTemplatePatternSpec[] {
  const nicheVariant = input.niche && !entryItem.nicheTags.includes(input.niche)
    ? `${entryItem.label} for ${input.niche.replace(/_/g, " ")}`
    : entryItem.label;
  const platformVariant = input.platformFocus === "tiktok_douyin"
    ? `${entryItem.label} vertical trend cut`
    : `${entryItem.label} ${input.platformFocus.replace(/_/g, " ")} cut`;
  const labels = unique([nicheVariant, platformVariant], 2);
  return labels.map((label) => ({
    kind: entryItem.kind,
    label,
    source: "platform_template_corpus",
    nicheTags: unique([...entryItem.nicheTags, input.niche], 10),
    hookMechanic: entryItem.hookMechanic,
    retentionMechanic: entryItem.retentionMechanic,
    proofDevice: entryItem.proofDevice,
    payoffMechanic: entryItem.payoffMechanic,
    creatorOrKolRole: entryItem.creatorOrKolRole,
    adaptationRule: entryItem.adaptationRule,
    riskControls: [
      ...(entryItem.riskControls ?? []),
      "distilled platform-template structure only; do not reproduce third-party template wording",
      "adapt to user-owned KOL, product, proof, setting, voice, and reviewed claims"
    ],
    fitReasons: [
      `platform_template_score=${round(score)}`,
      `template_archetypes=${SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.templateArchetypeCount}`,
      `pattern_matrix=${SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.declaredPatternMatrixCount}`,
      `source=${entryItem.sourceRepository}`,
      `license=${entryItem.license}`,
      "commercial_use_guarded=true"
    ],
    keywordSignals: entryItem.keywordSignals,
    modeSignals: entryItem.modeSignals,
    platformSignals: entryItem.platformSignals ?? ["tiktok_douyin", "reels", "youtube_shorts", "paid_social"],
    sourceRepository: entryItem.sourceRepository,
    license: entryItem.license,
    sourceTransform: "distilled_template_structure_no_verbatim_copy",
    commercialUseAllowed: true
  }));
}

function platformFitScore(
  entryItem: PlatformTemplateEntry,
  input: ShortPlatformTemplateCorpusRetrievalInput,
  haystack: string
): number {
  let score = 0.18;
  const nicheTags = entryItem.nicheTags.map((item) => item.toLowerCase());
  if (nicheTags.includes(input.niche.toLowerCase())) score += 0.22;
  if (nicheTags.includes("all")) score += 0.06;
  if (entryItem.modeSignals.includes(input.creativeMode)) score += 0.16;
  if ((entryItem.platformSignals ?? ["tiktok_douyin", "reels", "youtube_shorts", "paid_social"]).includes(input.platformFocus)) score += 0.08;
  if (input.hasReferenceVideo && /remake|trend|pov|skit|camera|motion|product to video|cinematic/.test(entryItem.keywordSignals.join(" "))) score += 0.14;
  if (input.hasProductEvidence && /product|proof|url|shop|demo|handling/.test(entryItem.keywordSignals.join(" "))) score += 0.12;
  if (input.buyerIntent === "conversion" && (entryItem.modeSignals.includes("product_ad") || entryItem.modeSignals.includes("ugc_review"))) score += 0.08;
  if (input.targetDurationSeconds <= 35 && /ugc|tiktok|trend|first try|comment|skit/.test(`${entryItem.label} ${entryItem.keywordSignals.join(" ")}`.toLowerCase())) score += 0.06;
  score += Math.min(0.18, entryItem.keywordSignals.filter((signal) => haystack.includes(signal.toLowerCase())).length * 0.045);
  return round(score);
}

function entry(
  kind: ShortCreativePatternKind,
  label: string,
  nicheTags: readonly string[],
  keywordSignals: readonly string[],
  modeSignals: readonly ShortViralCreativeMode[],
  hookMechanic: string,
  retentionMechanic: string,
  proofDevice: string,
  payoffMechanic: string,
  creatorOrKolRole: string,
  adaptationRule: string,
  sourceRepository: string,
  license: "MIT" | "public-docs-observation" | "operator-approved",
  riskControls: readonly string[] = []
): PlatformTemplateEntry {
  return {
    kind,
    label,
    nicheTags,
    keywordSignals,
    modeSignals,
    hookMechanic,
    retentionMechanic,
    proofDevice,
    payoffMechanic,
    creatorOrKolRole,
    adaptationRule,
    sourceRepository,
    license,
    riskControls
  };
}

function normalizedText(values: readonly (string | undefined)[]): string {
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_/#\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: readonly string[], limit: number): readonly string[] {
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

function round(value: number): number {
  return Number(value.toFixed(2));
}
