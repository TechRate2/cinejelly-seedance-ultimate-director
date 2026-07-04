/**
 * Short prompt pattern corpus.
 *
 * This module does not bundle verbatim upstream prompt text. It stores
 * rights-aware structural prompt DNA distilled from the local attributed
 * Seedance prompt snapshots so short planning can retrieve many niche-specific
 * creative patterns before render spend.
 */

import type {
  ShortCreativePatternKind,
  ShortCreativePatternSource,
  ShortViralCreativeMode,
  ShortViralPlatformFocus
} from "../types/short-viral-intelligence.js";
import {
  internalSourcePatternOrigin,
  internalSourcePatternOrigins,
  SHORT_PROMPT_CORPUS_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

export const SHORT_PROMPT_CORPUS_ORIGINS = internalSourcePatternOrigins(SHORT_PROMPT_CORPUS_SOURCE_PATTERN_IDS);
const PRIMARY_PROMPT_CORPUS_SOURCE_REPOSITORY = internalSourcePatternOrigin("youmind_awesome_seedance_2_prompts");

type CorpusSource = Extract<ShortCreativePatternSource, "seedance_prompt_corpus">;

export interface ShortPromptCorpusRetrievalInput {
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

export interface ShortPromptCorpusPatternSpec {
  readonly kind: ShortCreativePatternKind;
  readonly label: string;
  readonly source: CorpusSource;
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
  readonly license: "CC-BY-4.0" | "MIT" | "attribution-required";
  readonly sourceTransform: "distilled_pattern_no_verbatim_prompt";
  readonly commercialUseAllowed: boolean;
}

export interface ShortPromptCorpusCoverage {
  readonly schemaVersion: "cinejelly.short-prompt-pattern-corpus-coverage.v1";
  readonly sourceRepository: string;
  readonly declaredPromptCount: 3817;
  readonly localVideoUrlIndexCount: 1000;
  readonly readmePromptSectionCount: 106;
  readonly localizedReadmeCount: 15;
  readonly runtimePatternCount: number;
  readonly taxonomyFamilyCount: number;
  readonly retrievalTopKWithoutReference: 36;
  readonly retrievalTopKWithReference: 40;
  readonly promptTextBundlingPolicy: "external_snapshot_only_runtime_uses_distilled_pattern_dna";
  readonly attributionPolicy: "preserve_cc_by_4_0_lineage_no_verbatim_render_prompt";
  readonly trendVideoIntakeSupported: true;
}

interface CorpusEntry {
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
  readonly fitReasons?: readonly string[];
  readonly sourceRepository?: string;
  readonly license?: "CC-BY-4.0" | "MIT" | "attribution-required";
}

const SOURCE: CorpusSource = "seedance_prompt_corpus";

const CORE_CORPUS: readonly CorpusEntry[] = [
  entry("creator_confession", "UGC skeptical-to-convinced review", ["all", "ugc", "ecommerce"], ["ugc", "kol", "creator", "review", "honest", "skeptic"], ["ugc_review", "testimonial", "product_ad"], "open with a candid doubt or tiny complaint before the product appears", "doubt, visible proof, changed-mind beat, soft payoff", "creator experience plus one reviewed product fact", "trust is earned because the creator keeps one honest boundary", "KOL behaves like a real buyer testing the product, not a presenter reading copy", "rewrite all lines and actions around the user's KOL, product, setting, and proof evidence"),
  entry("proof_diary", "Repeated proof diary pattern", ["beauty_skincare", "fitness_wellness", "education_course", "wellness"], ["day", "journey", "progress", "before", "after", "routine", "serum"], ["ugc_review", "testimonial", "demo"], "start on a realistic baseline moment with a clear time marker", "repeat the same framing with small visual changes so progress feels trackable", "review-bound repeated-use proof, not a guaranteed transformation", "payoff feels believable because conditions stay consistent", "KOL documents a routine with restrained emotion and real pauses", "use only reviewed claims and replace every timeline/detail with user evidence", ["manual claim review for before/after or progress framing"]),
  entry("sensory_closeup", "Macro texture stop-scroll proof", ["beauty_skincare", "food_beverage", "fashion_apparel", "home_lifestyle", "all"], ["texture", "macro", "asmr", "cream", "fabric", "steam", "closeup", "satisfying"], ["product_ad", "demo", "ugc_review"], "begin on the most tactile product detail before explanation", "macro detail, human reaction, use context, payoff", "observable texture, material, motion, or interface proof", "viewer remembers the physical sensation of the product", "KOL lets hands, texture, and small reactions carry the proof", "make the macro detail specific to the supplied product asset"),
  entry("comparison_test", "Two-choice decision test", ["all", "ecommerce", "saas_b2b", "fashion_apparel", "home_lifestyle"], ["compare", "vs", "versus", "choice", "which", "better", "decision"], ["comparison", "demo", "product_ad"], "open with two choices and one criterion the viewer already cares about", "show criterion, compare observable result, resolve without attacking competitors", "side-by-side proof based on reviewed facts", "viewer can decide quickly and feels helped, not sold", "creator acts as a fair evaluator", "compare only approved facts and avoid competitor disparagement"),
  entry("micro_story_twist", "Relatable micro-story twist", ["all", "workspace_accessory", "home_lifestyle", "fashion_apparel", "local_service"], ["funny", "meme", "bua", "relatable", "story", "twist", "weird"], ["story", "ugc_review", "product_ad"], "open as a tiny real-life situation before it feels like an ad", "setup, friction, product entrance, small twist, payoff", "story action plus visible product evidence", "viewer shares because the scene maps to their own life", "KOL acts naturally with imperfect timing and a small reaction", "keep the situation original and brand-safe"),
  entry("routine_rescue", "Rushed routine rescue", ["beauty_skincare", "fashion_apparel", "wellness", "home_lifestyle"], ["morning", "routine", "busy", "fast", "five minutes", "get ready"], ["ugc_review", "demo", "product_ad"], "show the rushed moment first instead of the product", "problem, product step, immediate proof, routine payoff", "fast-use proof with a visible before-state", "viewer sees the product as a practical shortcut", "KOL moves like they are actually late or busy", "adapt timing and setting to the user's product and buyer context"),
  entry("before_after_guarded", "Claim-safe before/after framing", ["beauty_skincare", "home_lifestyle", "workspace_accessory", "local_service", "fashion_apparel"], ["before", "after", "transformation", "reset", "makeover"], ["demo", "testimonial", "product_ad"], "open with a conservative before-state that does not overpromise", "method, proof condition, after-state, claim boundary", "same-condition before/after proof with review guard", "payoff is clear but not miraculous", "KOL explains what is actually shown and what is not claimed", "only use before/after when product evidence and rights are approved", ["block medical, guaranteed, or overnight claims"]),
  entry("hidden_detail_reveal", "Hidden detail reveal", ["all", "real_estate_property", "travel_hospitality", "workspace_accessory", "saas_b2b"], ["hidden", "secret", "detail", "miss", "overlook", "insider"], ["education", "demo", "product_ad", "cinematic"], "start on a detail most viewers miss until the creator points it out", "detail, why it matters, proof context, payoff", "specific hidden-detail proof grounded in product/place facts", "viewer feels they discovered something worth saving", "KOL or host behaves like an insider sharing a useful observation", "replace generic secrets with reviewed facts and available visuals"),
  entry("mistake_fix", "Mistake-to-fix saveable short", ["all", "education_course", "fitness_wellness", "saas_b2b", "beauty_skincare"], ["mistake", "wrong", "fix", "avoid", "do not", "beginner"], ["education", "demo", "problem_solution"], "call out the mistake in the first second", "mistake, correction, example, payoff, save cue", "specific correction proof or demonstration", "viewer wants to save because the fix is immediately useful", "creator teaches with one concrete action, not a lecture", "avoid unsupported expert claims and keep the fix evidence-bound"),
  entry("challenge_progress", "Creator test challenge", ["all", "fitness_wellness", "food_beverage", "beauty_skincare", "ecommerce"], ["challenge", "test", "try", "experiment", "does it work"], ["demo", "ugc_review", "testimonial"], "state the test before any pitch", "test setup, proof attempt, result, honest limitation, next action", "observable test or constrained experiment proof", "viewer stays to see whether it works", "KOL becomes the tester and reacts naturally", "document the test honestly with reviewed claims"),
  entry("first_try_reaction", "First try reaction loop", ["food_beverage", "fashion_apparel", "beauty_skincare", "ecommerce"], ["first sip", "first bite", "first try", "reaction", "taste", "try on"], ["ugc_review", "product_ad", "testimonial"], "open on the reaction before explaining the product", "reaction, sensory proof, second confirmation, share trigger", "human reaction plus visible product context", "viewer wants to try the moment too", "KOL reacts with restraint first, then specificity", "do not imply universal taste or outcome claims beyond the shown experience"),
  entry("workflow_before_after", "Workflow chaos to clean outcome", ["saas_b2b", "productivity", "agency", "software"], ["saas", "dashboard", "workflow", "automation", "agency", "software", "handoff"], ["demo", "problem_solution", "product_ad"], "open on visible work chaos or too many tabs/handoffs", "chaos, mechanism, dashboard/process proof, clean outcome", "process proof with reviewed feature facts", "viewer sees one clear next action", "founder/operator narrates as someone who has lived the workflow", "replace all metrics and screens with approved product facts"),
  entry("problem_demo_payoff", "Product problem-demo-payoff sprint", ["all", "ecommerce", "home_lifestyle", "tech_gadget"], ["problem", "solution", "demo", "payoff", "how it works"], ["problem_solution", "demo", "product_ad"], "begin with a problem the buyer can recognize instantly", "problem, product action, proof, payoff, CTA", "visible use-case proof", "viewer understands why the product exists", "creator shows instead of explains", "adapt every beat to the user's product geometry and evidence"),
  entry("cinematic_reveal", "Premium cinematic reveal", ["luxury", "fashion_apparel", "jewelry_accessory", "real_estate_property", "travel_hospitality", "tech_gadget"], ["cinematic", "premium", "luxury", "reveal", "hero", "film"], ["cinematic", "product_ad"], "open with a visual contradiction or silhouette before the product reveal", "slow reveal, detail proof, human scale, restrained payoff", "environment/product detail proof", "premium feeling without unsupported superlatives", "KOL/host stays minimal and lets visuals sell", "keep product color, shape, and reference continuity accurate"),
  entry("community_reaction", "Comment-to-proof loop", ["all", "food_beverage", "fashion_apparel", "beauty_skincare", "local_service"], ["comment", "everyone", "friend", "asked", "reaction", "tag"], ["ugc_review", "testimonial", "story"], "open with a social cue or comment-style curiosity", "social cue, proof, reaction, share trigger", "approved reaction or generalized social proof", "viewer wants to tag someone or ask about it", "creator treats the reaction as casual, not staged", "avoid fake testimonials and use generalized reactions unless approved"),
  entry("sensory_closeup", "Mechanism ASMR loop", ["workspace_accessory", "tech_gadget", "home_lifestyle", "ecommerce"], ["snap", "click", "slide", "magnet", "mechanism", "setup", "organizer"], ["demo", "product_ad", "ugc_review"], "start with a satisfying product movement or sound cue", "mechanism close-up, wider context, human reaction, payoff", "observable motion/mechanism proof", "viewer remembers the product action", "KOL lets the mechanism do the selling", "do not fake impossible physics or product behavior"),
  entry("comparison_test", "Fit-check try-on ladder", ["fashion_apparel", "jewelry_accessory", "beauty_skincare"], ["clothes", "outfit", "fit", "try on", "style", "dress", "shirt", "jewelry"], ["demo", "ugc_review", "product_ad"], "open with a fit problem or mirror hesitation", "try-on beat, detail close-up, movement test, confident payoff", "fit, material, movement, or styling proof", "viewer imagines themselves using the item", "KOL moves naturally and checks the product like a real buyer", "adapt wardrobe, body framing, and claims to approved assets"),
  entry("hidden_detail_reveal", "App hidden time-saver reveal", ["saas_b2b", "productivity", "app", "software"], ["app", "feature", "time saver", "shortcut", "tool"], ["demo", "education", "problem_solution"], "show the small workflow leak before naming the feature", "leak, shortcut, proof, clean next step", "feature proof without fake metrics", "viewer saves the tip or books a demo", "operator/KOL narrates like a practitioner", "do not invent dashboards or numbers"),
  entry("proof_diary", "Habit streak proof arc", ["fitness_wellness", "education_course", "wellness", "productivity"], ["habit", "streak", "daily", "progress", "coach"], ["testimonial", "demo", "education"], "open with a simple daily baseline", "repeatable action, small proof, habit payoff", "habit proof with realistic constraint", "viewer believes the action is achievable", "KOL acts as accountable participant, not miracle case", "avoid medical/body/income guarantees"),
  entry("myth_bust", "Myth-bust micro lesson", ["education_course", "saas_b2b", "beauty_skincare", "fitness_wellness", "finance_education"], ["myth", "truth", "wrong idea", "nobody tells you", "learn"], ["education", "problem_solution"], "challenge a belief the viewer likely has", "myth, counterexample, proof, replacement behavior", "specific example proof", "viewer feels smarter quickly", "creator teaches with calm authority and one example", "avoid regulated advice and unsupported claims"),
  entry("first_try_reaction", "Food and drink craving proof", ["food_beverage", "restaurant", "coffee", "drink"], ["food", "drink", "coffee", "restaurant", "taste", "sip", "bite"], ["ugc_review", "product_ad"], "start on the craveable moment before context", "sensory detail, pause, reaction, social cue", "texture, steam, pour, crunch, or taste context", "viewer wants the same moment", "creator reacts naturally and names one sensory detail", "do not overstate taste claims as universal"),
  entry("hidden_detail_reveal", "Property/place insider walkthrough", ["real_estate_property", "travel_hospitality", "venue", "local_service"], ["property", "apartment", "hotel", "travel", "venue", "tour"], ["cinematic", "demo", "product_ad"], "open on one surprising detail in the space", "detail, movement path, value context, lifestyle payoff", "walkthrough proof with approved location footage", "viewer wants to save or inquire", "host reveals the detail with restrained confidence", "keep location rights and factual claims approved"),
  entry("creator_confession", "Founder/operator proof story", ["saas_b2b", "local_service", "ecommerce", "education_course"], ["founder", "operator", "business", "behind the scenes", "why we made"], ["story", "testimonial", "product_ad"], "open with why the product/service had to exist", "origin tension, proof, customer-use context, next step", "operator proof grounded in real product facts", "viewer trusts the reason behind the offer", "founder/KOL speaks plainly without hype", "avoid unverifiable revenue, ranking, or guaranteed outcome claims"),
  entry("problem_demo_payoff", "Home reset transformation", ["home_lifestyle", "furniture", "decor", "cleaning", "organizer"], ["home", "room", "kitchen", "decor", "clean", "reset"], ["demo", "product_ad", "ugc_review"], "open with the specific home friction before product reveal", "friction, use step, reset, calm payoff", "before/after environment proof", "viewer imagines a cleaner or easier routine", "creator behaves like they are solving their own space", "avoid fake impossible transformations"),
  entry("comparison_test", "Bundle value decision", ["ecommerce", "fashion_apparel", "beauty_skincare", "tech_gadget"], ["bundle", "price", "value", "deal", "worth it"], ["comparison", "product_ad"], "open with the value question, not the discount", "what is included, proof of use, value resolution, CTA", "bundle/use-case proof based on product facts", "viewer understands why the offer fits them", "creator evaluates value with visible items", "avoid false scarcity or unsupported savings"),
  entry("sensory_closeup", "Jewelry/accessory micro-luxury detail", ["jewelry_accessory", "fashion_apparel", "luxury"], ["jewelry", "watch", "ring", "bag", "accessory"], ["cinematic", "product_ad", "ugc_review"], "open on one tiny detail catching light or motion", "detail, wear context, movement, payoff", "material/detail proof and styling context", "viewer feels the object is desirable and inspectable", "KOL wears or handles the item naturally", "preserve product geometry, color, and finish from references"),
  entry("challenge_progress", "Skill/course quick-win challenge", ["education_course", "coaching", "training"], ["course", "class", "lesson", "training", "learn", "skill"], ["education", "demo"], "start with a tiny challenge the learner can finish", "challenge, hint, example, result, next lesson", "micro skill proof", "viewer wants the next lesson", "teacher/KOL keeps instruction concrete and fast", "avoid guaranteed career, income, or exam outcomes"),
  entry("workflow_before_after", "Agency/client handoff cleanup", ["saas_b2b", "agency", "service_business"], ["client", "agency", "handoff", "brief", "approval"], ["problem_solution", "demo"], "open on client handoff confusion", "mess, organizing mechanism, proof, clean approval moment", "workflow proof with reviewed product facts", "viewer sees reduced operational friction", "operator narrates from real process pain", "do not invent client names, logos, or metrics"),
  entry("micro_story_twist", "Local service awkward problem rescue", ["local_service", "home_lifestyle", "auto_service"], ["service", "repair", "booking", "appointment", "local"], ["story", "problem_solution"], "open with the awkward problem moment before the service appears", "problem, fast rescue, proof detail, satisfied payoff", "visible service/process proof", "viewer remembers when they need the service", "technician/host behaves helpful and specific", "avoid unsafe stunts or claims beyond shown service"),
  entry("cinematic_reveal", "Tech product hero loop", ["tech_gadget", "ecommerce", "workspace_accessory"], ["gadget", "device", "tech", "unbox", "setup"], ["cinematic", "product_ad", "demo"], "open with an extreme close-up or silhouette of the product action", "reveal, mechanism, hand interaction, payoff", "product function and design proof", "viewer understands the feature before text would be needed", "KOL hands interact slowly enough for product clarity", "preserve product shape, ports, labels, and allowed marks"),
  entry("community_reaction", "Group/social proof without fake testimonials", ["food_beverage", "fashion_apparel", "local_service", "event_venue"], ["party", "friends", "group", "event", "reaction"], ["story", "testimonial", "product_ad"], "start with people noticing the product/place/service naturally", "social cue, proof moment, reaction, save/share payoff", "general reaction proof without fabricated quotes", "viewer wants to bring someone into the moment", "KOL captures authentic-looking social energy", "use only approved testimonial or generalized reaction framing"),
  entry("creator_confession", "Voice-of-customer pain confession", ["all", "beauty_skincare", "saas_b2b", "fashion_apparel"], ["i used to", "problem", "struggle", "hate", "finally"], ["ugc_review", "testimonial"], "begin with a precise pain confession in the buyer's words", "confession, proof, relief, next step", "buyer-pain proof tied to reviewed product benefits", "viewer feels seen before they are sold", "KOL speaks like one person, not a brand", "rewrite the confession from user context and avoid copying source lines"),
  entry("mistake_fix", "Do-this-not-that visual lesson", ["education_course", "beauty_skincare", "fitness_wellness", "fashion_apparel"], ["do this", "not that", "wrong", "tip"], ["education", "demo"], "open with the wrong action visually, then fix it fast", "wrong example, corrected action, proof, save cue", "side-by-side correction proof", "viewer saves the practical fix", "creator demonstrates the fix physically", "avoid shaming language and unsupported expert certainty"),
  entry("hidden_detail_reveal", "Retail shelf/product pick reveal", ["ecommerce", "beauty_skincare", "food_beverage", "fashion_apparel"], ["pick", "choose", "shopping", "shelf", "haul"], ["ugc_review", "product_ad", "comparison"], "start with a choice moment among options", "selection criterion, product proof, payoff", "observable product-selection reason", "viewer feels guided through a choice", "KOL shops or selects like a real buyer", "avoid implying competitor defects without evidence"),
  entry("proof_diary", "Transformation without miracle claims", ["beauty_skincare", "fitness_wellness", "home_lifestyle"], ["transformation", "glow up", "reset", "journey"], ["testimonial", "demo"], "open with a real baseline and one narrow goal", "method, repeated proof, bounded payoff", "narrow transformation proof with review guard", "viewer believes because the claim stays specific", "KOL documents a bounded change and calls out limits", "never promise medical, body, or guaranteed results", ["manual claim review required"]),
  entry("problem_demo_payoff", "Product-as-helper story", ["all", "workspace_accessory", "home_lifestyle", "fashion_apparel", "tech_gadget"], ["helper", "makes easier", "daily", "routine"], ["story", "product_ad"], "open on the human task, not the product", "task, friction, product helper, relief", "product role in a real task", "viewer sees usefulness without a hard sell", "KOL remains the protagonist and product is the helper", "do not make the product solve unrelated problems"),
  entry("cinematic_reveal", "Travel/hospitality mood-to-booking arc", ["travel_hospitality", "venue", "real_estate_property"], ["travel", "hotel", "stay", "booking", "vacation"], ["cinematic", "product_ad"], "open on a sensory place detail rather than a brochure view", "detail, movement, guest perspective, quiet CTA", "place experience proof", "viewer imagines themselves there", "host or guest moves naturally through the space", "keep amenities and availability claims reviewed"),
  entry("workflow_before_after", "Creator content workflow proof", ["creator_tools", "saas_b2b", "productivity"], ["creator", "content", "calendar", "edit", "post"], ["demo", "problem_solution"], "open on content chaos or missed posting friction", "chaos, tool step, workflow proof, calm output", "workflow improvement proof without fake metrics", "viewer sees how it fits their content routine", "creator/operator narrates from workflow pain", "avoid platform performance guarantees"),
  entry("sensory_closeup", "Packaging unboxing retention loop", ["ecommerce", "beauty_skincare", "fashion_apparel", "tech_gadget"], ["unboxing", "package", "box", "delivery", "haul"], ["ugc_review", "product_ad"], "open on the most satisfying packaging motion", "unbox, product reveal, detail proof, reaction", "packaging/product detail proof", "viewer stays for the reveal and inspectable detail", "KOL handles packaging like a real customer", "do not over-index on packaging if product proof is missing"),
  entry("myth_bust", "Regulated-category safe education", ["finance_education", "health_wellness", "legal_education"], ["finance", "health", "legal", "investment", "doctor", "medical"], ["education"], "open with a misconception but keep it educational", "misconception, context, safe general lesson, consult/proof boundary", "educational explanation without personalized advice", "viewer learns the boundary and next safe step", "creator uses careful language and avoids guarantees", "route regulated claims to review and avoid advice-like CTA", ["regulated category review required"]),
  entry("community_reaction", "B2B team reaction proof", ["saas_b2b", "productivity", "agency"], ["team", "manager", "approval", "client", "meeting"], ["testimonial", "problem_solution"], "open with a team pain or reaction moment", "pain, workflow proof, reaction, next action", "team/process proof with approved facts", "viewer recognizes the organizational friction", "operator/KOL shows the team dynamic without fake quotes", "use generalized reactions unless testimonial approval exists"),
  entry("hidden_detail_reveal", "Fashion styling hidden detail", ["fashion_apparel", "jewelry_accessory"], ["style", "outfit", "detail", "fit", "accessory"], ["ugc_review", "demo"], "open on the tiny styling detail that changes the look", "detail, full outfit, movement check, payoff", "fit/material/accessory proof", "viewer saves the styling idea", "KOL behaves like a stylist friend, not a catalog model", "adapt to the real garment/accessory and approved KOL"),
  entry("first_try_reaction", "Skincare first-use texture reaction", ["beauty_skincare"], ["serum", "cream", "skin", "texture", "first use"], ["ugc_review", "demo"], "open on the product texture touching skin or hand before claims", "texture, application, mirror check, bounded payoff", "texture and routine proof", "viewer trusts the feel before the benefit", "KOL reacts softly and avoids exaggerated transformation", "keep claims reviewed and avoid medical language"),
  entry("problem_demo_payoff", "Physical product use-case loop", ["ecommerce", "tech_gadget", "home_lifestyle", "workspace_accessory"], ["product", "use", "daily", "portable", "tool"], ["demo", "product_ad"], "open with the object solving one concrete moment", "use case, close-up, proof, final state", "visible product function proof", "viewer sees exactly when they would use it", "KOL uses the object in one natural setting", "choose one use case instead of listing features"),
  entry("creator_confession", "Ad-that-does-not-feel-like-ad pattern", ["all", "ugc"], ["not an ad", "native", "tiktok", "douyin", "reels"], ["ugc_review", "story"], "open as native creator content with a human line before product framing", "human moment, product proof, earned CTA", "creator-specific experience plus approved fact", "viewer accepts the ad because the first beat feels native", "KOL keeps delivery imperfect, fast, and specific", "do not imitate another creator's script or voice")
] as const;

const ENTERTAINMENT_EXPANSION: readonly CorpusEntry[] = [
  entry("cinematic_reveal", "Anime power-up loop", ["anime", "animation", "gaming_entertainment", "all"], ["anime", "manga", "chibi", "power up", "transform", "2d"], ["story", "cinematic"], "super close-up on the character's eyes then an ultra-fast zoom out as motion explodes", "8-12 rhythm-driven cuts of 1-2s: power stance, rapid action chain, elegant aftermath frame that invites a loop", "kinetic 2D action with impact frames and beat-synced cuts", "punch-the-camera or transformation loop-bait keeps replays high", "character stays perfectly on-model via turnaround-sheet identity", "use the character sheet as the only identity source; never render storyboard panels or annotations"),
  entry("micro_story_twist", "Deadpan static-camera absurdity", ["meme", "comedy", "all", "local_service"], ["meme", "funny", "hài", "hai", "prank", "deadpan", "absurd"], ["story", "ugc_review"], "locked static camera on a mundane setup that is about to flip absurd", "two-beat reversal: 0-7s straight-faced setup, 7-15s escalated absurd payoff, freeze on the reaction", "absurd reversal played with believable physics and reactions", "viewer shares the anticlimax or told-you-so look to camera", "performer stays deadpan; the camera never moves so the joke does", "keep stunts safe and brand-appropriate; one whip-pan maximum, reserved for the reveal"),
  entry("cinematic_reveal", "Mythic scale spectacle", ["action", "fantasy", "gaming_entertainment", "cinematic_story"], ["action", "vfx", "kaiju", "dragon", "epic", "battle", "monster"], ["cinematic", "story"], "mid-action entry: the strike or breach is already happening on frame one", "labeled 3-5s shots escalating to a cataclysm then a calm reveal; optionally one true unbroken continuous shot", "colossal scale against a real landmark with physical debris and weight", "scale shock and destruction spectacle demand a rewatch", "hero identity locked with an explicit no-drift clause; opposition actively contests", "keep physics grounded and proportions accurate; no gore, no toy-like miniature feel"),
  entry("first_try_reaction", "Beat-synced performance flex", ["music_video", "dance", "all"], ["music", "mv", "rap", "dance", "nhảy", "beat", "choreo"], ["story", "cinematic"], "beat-drop freeze then explode into choreography, or lips opening on the first bar", "4 beats over 15s: intro attitude, verse with lip-sync, choreography escalation, abrupt music-stop freeze", "every cut lands on the count; lyrics carry attitude with accurate lip-sync", "quotable bar plus dance loop-bait; subversion casting multiplies shares", "performer owns the frame; identity locked across outfit or set changes", "cuts must follow the beat grid; no anatomy distortion mid-dance"),
  entry("before_after_guarded", "Seamless transformation morph", ["transformation", "fashion_apparel", "beauty_skincare", "all"], ["transformation", "biến hình", "bien hinh", "glow up", "makeover", "morph"], ["cinematic", "product_ad", "story"], "hold the ordinary state just long enough to register before the first crack of change", "before-state 2-3s, continuous transformation 5-8s where the subject never decomposes, after-state strut, loopable final frame matching the opening angle", "one continuous angle through the change so it reads as real", "identity or outfit metamorphosis with a hidden loop seam", "start and end states each anchored to a reference with an explicit no-dissolve clause", "never cut away at the transformation peak; claims stay within approved evidence", ["manual claim review for appearance-change framing"]),
  entry("sensory_closeup", "Beat-cut world tour flex", ["travel_hospitality", "travel", "all"], ["travel", "du lịch", "du lich", "hyperlapse", "tour", "landmark"], ["cinematic", "ugc_review", "story"], "extreme close-up selfie smile with an ASMR whisper before the music explodes into location one", "hard cuts every 0.5s synced to the beat, one look per location, grand pull-back finale", "rapid location variety with strict identity consistency across every cut", "location-count flex and outfit-per-location evolution invite rewatch and saves", "the traveler never drifts: same face, accessories on the same side, every location", "locations must feel distinct; no duplicate-feeling backdrops or bystander swaps"),
  entry("community_reaction", "Wholesome family payoff arc", ["family_lifestyle", "kids_family", "all"], ["family", "gia đình", "gia dinh", "bố", "mẹ", "con", "kids", "wholesome"], ["story", "testimonial"], "cozy sunlit intro on a small telling detail (tiny jersey, drawing) before faces", "5 gentle beats: warm setup, shared activity, small stumble, encouragement, emotional payoff held long", "parent-child emotional beat with natural family sounds", "generational or kindness payoff makes viewers tag family", "family identities locked with natural skin and safety-first framing", "no saccharine over-acting or unsafe activity; earn the emotion slowly"),
  entry("sensory_closeup", "Process ASMR craft loop", ["food_beverage", "asmr", "all", "home_lifestyle"], ["asmr", "satisfying", "process", "craft", "sizzle", "pour"], ["demo", "product_ad", "cinematic"], "extreme macro on the most tactile moment with hands only, no face", "up to 12 numbered process beats of 1-1.5s in strict order, closing orbit on the finished result plus one human reaction", "explicit SFX list (chop, sizzle, clink) carries the appetite over a soft BGM", "the satisfying process itself is the share; sound is half the video", "same hands across every beat; packaging accurate when branded", "never break process order; music must not drown the SFX")
] as const;

const TAXONOMY_EXPANSION: readonly CorpusEntry[] = [
  entry("hidden_detail_reveal", "Uploaded trend beat-map remake", ["all", "trend_remake", "source_video", "tiktok_douyin"], ["upload", "reference video", "trend video", "remake", "viral video", "bám", "bam", "hoc", "learn", "source"], ["ugc_review", "product_ad", "story", "demo"], "open with the same viewer job as the uploaded trend: why this beat stops the scroll", "map source beat order, cut density, acting beats, camera grammar, and payoff timing into a new KOL/product story", "reference structure plus user-owned KOL/product/background proof", "viewer gets the familiar rhythm with a new product-native payoff", "KOL performs the learned rhythm with new gestures, script, product, setting, and claim evidence", "use the source video as a beat map; replace all expression and assets unless rights-cleared review approves closer similarity", ["trend video intake review required when source similarity is high"], ["taxonomy_family=trend_video_remake"]),
  entry("micro_story_twist", "POV trend skit remake", ["all", "trend_remake", "meme_sketch", "local_service", "fashion_apparel"], ["pov", "skit", "meme", "trend", "funny", "bua", "awkward", "scenario"], ["story", "ugc_review", "product_ad"], "start with a POV situation the niche instantly recognizes", "setup, awkward beat, product/context turn, reaction, payoff", "story proof tied to a visible product or service action", "viewer shares because the situation feels native to the niche", "KOL acts like a real person caught in a relatable moment", "transfer only the comedic structure and timing; rewrite characters, lines, props, and action"),
  entry("challenge_progress", "Motion-matched product action transfer", ["all", "trend_remake", "motion_reference", "tech_gadget", "workspace_accessory"], ["motion", "gesture", "transition", "snap", "spin", "hand", "match cut", "remake"], ["demo", "product_ad", "cinematic"], "open on the motion cue that makes the product action satisfying", "source motion rhythm, product close-up, human reaction, endpoint proof", "observable motion or mechanism proof", "viewer remembers the kinetic action rather than a slogan", "KOL repeats the timing with new product-safe gestures", "preserve motion timing, not source performer identity or exact edit expression"),
  entry("sensory_closeup", "Douyin transformation edit structure", ["all", "trend_remake", "beauty_skincare", "fashion_apparel", "home_lifestyle", "workspace_accessory"], ["douyin", "transition", "transformation", "glow up", "change", "before", "after"], ["product_ad", "ugc_review", "cinematic"], "open on the before-state with an immediate visual reason to stay", "before-state, transition trigger, tactile proof, after-state, restrained payoff", "review-bound transformation proof", "viewer replays the transition because the state change is clear", "KOL anchors the transition with physical continuity and natural reaction", "keep transformation bounded to reviewed evidence and user-owned visuals", ["manual claim review for before/after framing"]),
  entry("community_reaction", "Green-screen/commentary trend transfer", ["news_commentary", "creator_commentary", "education_course", "finance_education", "legal_education"], ["green screen", "commentary", "react", "reaction", "news", "duet", "stitch"], ["education", "story", "problem_solution"], "start with the most surprising claim or moment being reacted to", "context, reaction, simple explanation, practical takeaway", "commentary proof or source-neutral context", "viewer feels updated quickly and knows why it matters", "creator reacts as an informed guide, not a copier of the source", "do not reproduce source clips, captions, or voices; summarize structure and make original commentary", ["regulated/news claims need review when factual accuracy matters"]),
  entry("myth_bust", "Breaking-news explainer hook", ["news_commentary", "education_course", "finance_education", "legal_education", "health_wellness"], ["news", "breaking", "update", "today", "latest", "what happened", "explainer"], ["education", "problem_solution"], "open with one concrete update and why the viewer should care", "what happened, why it matters, one implication, safe next step", "fact-bound explanation with uncertainty boundaries", "viewer saves or shares because the event is clear", "host explains calmly with timestamps/source caveat in narration", "avoid inventing facts; require current source verification for live news", ["live/current news requires external verification before publish"]),
  entry("hidden_detail_reveal", "One-fact why-it-matters short", ["news_commentary", "education_course", "saas_b2b", "finance_education"], ["one thing", "why it matters", "important", "missed", "explained"], ["education", "problem_solution"], "start with the single overlooked fact", "fact, implication, example, next action", "specific fact or example proof", "viewer feels smarter in under 30 seconds", "creator behaves like a concise analyst", "keep claims source-bound and avoid broad unsupported conclusions"),
  entry("creator_confession", "Podcast quote to B-roll bridge", ["podcast_clip", "founder_story", "education_course", "saas_b2b", "creator_tools"], ["podcast", "clip", "interview", "quote", "guest", "host", "b-roll"], ["story", "education", "testimonial"], "open on a provocative spoken idea or objection", "quote, visual proof bridge, example, payoff", "spoken insight plus visual B-roll evidence", "viewer stays because the idea gets visualized", "host/guest voice feels thoughtful while visuals carry proof", "use original/licensed audio only; create new supporting visuals and do not clone another podcast's identity"),
  entry("workflow_before_after", "Founder hot-take clip", ["podcast_clip", "founder_story", "saas_b2b", "agency", "creator_tools"], ["hot take", "founder", "operator", "podcast", "clip", "opinion"], ["story", "education", "problem_solution"], "start with the contrarian take before credentials", "take, proof, operational example, next step", "founder/operator example proof", "viewer shares because the take clarifies a pain", "founder/KOL speaks plainly and specifically", "rewrite the take around the user's product facts and risk boundaries"),
  entry("sensory_closeup", "Faceless hands-only proof", ["all", "faceless", "ecommerce", "beauty_skincare", "food_beverage", "workspace_accessory"], ["faceless", "hands only", "no face", "b-roll", "asmr", "product hands"], ["demo", "product_ad", "ugc_review"], "open with hands performing the most inspectable product action", "hands, close-up, context, endpoint proof", "hands-on product proof without relying on face identity", "viewer understands the product even with audio muted", "creator presence is implied through natural hands and timing", "bind product geometry first and keep hands physically believable"),
  entry("problem_demo_payoff", "Faceless B-roll narration stack", ["faceless", "education_course", "saas_b2b", "local_service", "home_lifestyle"], ["faceless", "voiceover", "broll", "b-roll", "narration"], ["education", "problem_solution", "product_ad"], "open with the outcome while B-roll shows the problem", "outcome, step proof, context B-roll, payoff", "visual example proof plus guided narration", "viewer can follow without a presenter", "creator voice guides while original visuals do the work", "do not use generic stock montage; every B-roll beat must map to the user niche"),
  entry("mistake_fix", "Screenless app value story", ["app", "mobile_app", "saas_b2b", "productivity", "creator_tools"], ["app", "mobile", "feature", "software", "dashboard", "screenless", "workflow"], ["demo", "problem_solution", "education"], "open on the offline pain before the app appears", "pain, app step, human result, clean payoff", "feature proof without fake UI text or invented screens", "viewer understands the job-to-be-done rather than a list of features", "operator/KOL uses the app as a helper in a real situation", "only show approved UI or abstract interaction; avoid fake text-heavy dashboards"),
  entry("workflow_before_after", "SaaS aha workflow sprint", ["saas_b2b", "app", "productivity", "agency"], ["saas", "workflow", "automation", "aha", "dashboard", "tool"], ["demo", "problem_solution", "product_ad"], "open with the exact workflow leak", "leak, one feature action, proof, calm after-state", "reviewed feature or workflow proof", "viewer sees the aha moment fast", "operator narrates like a practitioner solving a real job", "do not invent metrics or customer logos"),
  entry("community_reaction", "Livestream comment-to-answer cutdown", ["livestream_commerce", "ecommerce", "education_course", "food_beverage", "beauty_skincare"], ["livestream", "live", "comment", "question", "answer", "cutdown"], ["ugc_review", "education", "product_ad"], "open with a viewer question or live objection", "question, proof answer, reaction, soft CTA", "answer proof using reviewed product facts", "viewer feels the clip came from a real live moment", "host answers quickly and naturally", "never fabricate named viewer comments; use generalized prompts unless approved"),
  entry("problem_demo_payoff", "Live-shop replay proof cut", ["livestream_commerce", "ecommerce", "fashion_apparel", "beauty_skincare", "food_beverage"], ["live shop", "livestream", "deal", "flash", "replay", "shop"], ["product_ad", "demo", "ugc_review"], "open on the product being handled, not the discount", "handle, proof, objection answer, conversion payoff", "visible product handling and reviewed offer facts", "viewer sees what they would buy before CTA", "host behaves energetic but specific", "avoid false scarcity, fake viewer counts, or unsupported discount claims"),
  entry("comparison_test", "Affiliate honest pick", ["affiliate_review", "koc_kol", "ecommerce", "tech_gadget", "beauty_skincare"], ["affiliate", "koc", "kol", "commission", "worth it", "pick", "recommend"], ["ugc_review", "comparison", "product_ad"], "open with the honest selection criterion", "criterion, product proof, drawback boundary, recommendation", "reviewed product proof plus one honest limitation", "viewer trusts the recommendation because it has a boundary", "KOC/KOL evaluates like a buyer, not a hard seller", "disclose or route affiliate/commercial relationship per policy"),
  entry("creator_confession", "KOC low-polish native review", ["affiliate_review", "koc_kol", "ecommerce", "beauty_skincare", "fashion_apparel"], ["koc", "ugc", "native", "unpolished", "review", "phone"], ["ugc_review", "testimonial"], "open with an unpolished buyer problem or doubt", "buyer doubt, use proof, honest reaction, next step", "creator experience plus observable product evidence", "viewer feels a real person tested it", "KOC delivery keeps small pauses and natural imperfection", "avoid template phrases and rewrite for the user's KOL voice"),
  entry("sensory_closeup", "Unboxing plus one drawback", ["ecommerce", "affiliate_review", "tech_gadget", "fashion_apparel", "beauty_skincare"], ["unbox", "unboxing", "drawback", "honest", "haul", "package"], ["ugc_review", "product_ad"], "open on the package motion or first reveal", "unbox, inspect, useful detail, honest drawback, payoff", "packaging/product detail proof with a limitation", "viewer trusts because the review is not all praise", "KOL handles the product like a new buyer", "only mention drawbacks the operator approves or that are visible"),
  entry("comparison_test", "Haul ranking decision short", ["fashion_apparel", "beauty_skincare", "food_beverage", "ecommerce", "affiliate_review"], ["haul", "ranking", "top", "best of", "try-on", "favorites"], ["comparison", "ugc_review", "product_ad"], "open with a ranking criterion viewers care about", "quick entries, proof criterion, winner, why", "observable criterion proof", "viewer stays to see which item wins", "KOL ranks with clear taste and one proof per item", "avoid unsupported best-in-market claims; frame as creator preference"),
  entry("sensory_closeup", "GRWM product insertion", ["fashion_apparel", "beauty_skincare", "jewelry_accessory"], ["grwm", "get ready", "outfit", "makeup", "routine"], ["ugc_review", "demo", "product_ad"], "open in the middle of getting ready, before the brand appears", "routine step, product detail, mirror/movement check, payoff", "routine integration proof", "viewer imagines using it in their own routine", "KOL behaves like a friend getting ready, not a presenter", "adapt wardrobe/body framing and claims to approved assets"),
  entry("before_after_guarded", "Try-on transition stack", ["fashion_apparel", "jewelry_accessory", "footwear"], ["try on", "transition", "outfit", "fit check", "mirror"], ["demo", "ugc_review", "product_ad"], "open with fit hesitation or occasion need", "transition, fit detail, movement test, final look", "fit/material/movement proof", "viewer saves the styling idea", "KOL checks fit naturally with movement and mirror", "do not alter body shape or overpromise fit"),
  entry("hidden_detail_reveal", "Street-style product vox pop", ["fashion_apparel", "local_service", "food_beverage", "event_venue"], ["street interview", "vox pop", "asking strangers", "street style"], ["story", "testimonial", "ugc_review"], "open on a quick public reaction or question", "question, product/style proof, reaction, payoff", "generalized social proof or approved testimonial", "viewer watches for the next reaction", "host keeps the interaction respectful and brief", "use only approved participants or staged original interactions"),
  entry("hidden_detail_reveal", "Property POV tour", ["real_estate", "real_estate_property", "travel_hospitality", "venue"], ["real estate", "property", "apartment", "condo", "tour", "pov"], ["cinematic", "demo", "product_ad"], "open as if the viewer just walked into the most compelling detail", "entry, path, hidden detail, lifestyle proof, inquiry payoff", "location walkthrough proof", "viewer saves or asks about the space", "host/POV camera moves like a real tour", "keep property facts, location, and availability reviewed"),
  entry("comparison_test", "Price-to-detail reveal", ["real_estate", "travel_hospitality", "venue", "local_service"], ["price", "worth it", "details", "tour", "value"], ["comparison", "demo", "product_ad"], "open with the value question before the space/product reveal", "value question, detail proof, lifestyle context, resolution", "detail proof tied to reviewed value facts", "viewer understands why it is worth considering", "host explains one detail at a time", "avoid unreviewed pricing, availability, or ROI claims"),
  entry("mistake_fix", "Renter/buyer mistake fix", ["real_estate", "finance_education", "local_service"], ["renter", "buyer", "mistake", "apartment", "home", "mortgage"], ["education", "problem_solution"], "open with the mistake buyers/renters make", "mistake, detail to check, example, safe next step", "practical inspection or education proof", "viewer saves before touring or buying", "host gives general education, not regulated advice", "route legal/finance claims to review"),
  entry("first_try_reaction", "Street food first-bite story", ["food_beverage", "restaurant", "travel_hospitality"], ["street food", "first bite", "restaurant", "queue", "taste"], ["ugc_review", "story", "product_ad"], "open on the bite/reaction before naming the place", "sensory proof, context, social energy, payoff", "taste/texture/atmosphere proof", "viewer wants the same moment", "KOL reacts with one specific sensory note", "do not invent universal taste claims or fake crowds"),
  entry("sensory_closeup", "Recipe B-roll micro tutorial", ["food_beverage", "home_lifestyle", "education_course"], ["recipe", "cook", "meal prep", "ingredients", "tutorial"], ["education", "demo"], "open with the final texture or sound first", "result, key step, tactile proof, serving payoff", "ingredient/process proof", "viewer saves the method", "hands and timing carry the instruction", "keep steps truthful and safe; avoid text labels unless policy changes"),
  entry("challenge_progress", "Taste-test split decision", ["food_beverage", "restaurant", "ecommerce"], ["taste test", "which one", "blind test", "flavor", "drink"], ["comparison", "ugc_review"], "open with the test rule before tasting", "test, reaction, sensory criterion, winner", "taste-context proof", "viewer stays for the verdict", "KOL tests with restraint and specificity", "frame as personal experience, not objective superiority"),
  entry("hidden_detail_reveal", "Hotel room reveal path", ["travel_hospitality", "real_estate_property", "venue"], ["hotel", "resort", "room tour", "stay", "booking"], ["cinematic", "product_ad", "demo"], "open with the one detail that feels bookable", "detail, room path, guest use, quiet CTA", "amenity/place proof", "viewer imagines the stay", "guest/host moves naturally through the room", "keep amenities and availability claims reviewed"),
  entry("mistake_fix", "Itinerary mistake/fix", ["travel_hospitality", "education_course", "local_service"], ["itinerary", "travel mistake", "avoid", "hidden spot", "guide"], ["education", "problem_solution"], "open with the avoid-this travel mistake", "mistake, better route, proof/context, save cue", "place or itinerary proof", "viewer saves for planning", "host acts as a helpful local/guide", "do not imply access, safety, or pricing unless reviewed"),
  entry("challenge_progress", "Fitness form-check micro lesson", ["fitness_wellness", "education_course", "sports"], ["form check", "exercise", "workout", "gym", "trainer"], ["education", "demo"], "open with the common form mistake", "wrong form, correction, repeat, payoff", "form demonstration proof", "viewer saves to try safely", "coach/KOL demonstrates slowly and clearly", "avoid medical/body outcome guarantees"),
  entry("proof_diary", "Meal-prep habit challenge", ["fitness_wellness", "food_beverage", "wellness"], ["meal prep", "habit", "challenge", "daily", "routine"], ["demo", "education", "testimonial"], "open with the busy baseline", "prep step, repeatable system, small proof, payoff", "habit/process proof", "viewer feels it is achievable", "KOL behaves like a participant, not a miracle case", "avoid weight-loss or medical promises"),
  entry("myth_bust", "Finance/legal safe micro explainer", ["finance_education", "legal_education", "insurance", "tax"], ["finance", "legal", "tax", "insurance", "investment", "mortgage"], ["education", "problem_solution"], "open with a misconception but keep it general", "misconception, context, example, consult-safe next step", "education-only proof", "viewer understands the boundary", "creator uses careful language and avoids personal advice", "regulated category review required", ["regulated category review required"]),
  entry("problem_demo_payoff", "Local service emergency rescue", ["local_service", "auto_service", "home_repair", "salon"], ["repair", "plumber", "cleaning", "salon", "booking", "service"], ["problem_solution", "story", "product_ad"], "open at the urgent awkward moment", "problem, service action, proof detail, relieved payoff", "service/process proof", "viewer remembers who to call", "technician/host is helpful and specific", "avoid unsafe staged emergencies or fake testimonials"),
  entry("community_reaction", "Event/venue crowd-energy proof", ["event_venue", "restaurant", "travel_hospitality", "local_service"], ["event", "venue", "party", "crowd", "wedding", "concert"], ["story", "product_ad", "testimonial"], "open on the peak energy moment", "energy, detail, guest perspective, booking payoff", "venue/experience proof", "viewer imagines bringing people there", "host captures real-looking energy without fake claims", "use approved participant/location rights"),
  entry("cinematic_reveal", "Gaming cinematic highlight", ["gaming_entertainment", "esport", "creator_tools"], ["gaming", "esport", "streamer", "gameplay", "highlight"], ["cinematic", "story"], "open on the near-fail moment before the highlight", "tension, mechanic, reaction, payoff", "gameplay/creator proof if rights-cleared", "viewer replays the highlight", "creator/KOL reacts naturally and keeps timing sharp", "do not use unlicensed game footage or copyrighted audio without rights"),
  entry("micro_story_twist", "Pet/family safe comedy moment", ["pet", "family_lifestyle", "home_lifestyle", "ecommerce"], ["pet", "dog", "cat", "baby", "family", "cute", "funny"], ["story", "product_ad", "ugc_review"], "open with a cute or inconvenient everyday moment", "setup, product/helper action, reaction, payoff", "safe everyday proof", "viewer shares because it is relatable", "creator keeps the moment gentle and brand-safe", "avoid unsafe animal/child staging and unsupported claims"),
  entry("hidden_detail_reveal", "Luxury object inspection loop", ["luxury", "jewelry_accessory", "fashion_apparel", "tech_gadget"], ["luxury", "watch", "jewelry", "bag", "premium", "detail"], ["cinematic", "product_ad"], "open on a microscopic detail catching light", "detail, handling, human scale, final reveal", "material/finish proof", "viewer wants to inspect the object", "KOL handles the object slowly and confidently", "preserve product geometry and avoid unsupported luxury claims"),
  entry("workflow_before_after", "Creator tool content pipeline", ["creator_tools", "saas_b2b", "productivity", "app"], ["creator tool", "content", "edit", "calendar", "post", "pipeline"], ["demo", "problem_solution"], "open on creator workflow chaos", "chaos, tool step, output proof, calm routine", "workflow proof without performance guarantees", "viewer sees how it fits their work", "creator/operator narrates from real pain", "avoid platform growth or revenue promises"),
  entry("comparison_test", "Old way/new way split screen", ["all", "saas_b2b", "workspace_accessory", "local_service", "education_course"], ["old way", "new way", "before", "after", "split", "versus"], ["comparison", "problem_solution", "demo"], "open with the old way failing visibly", "old way, new way, proof contrast, payoff", "observable comparison proof", "viewer understands the better path quickly", "KOL shows contrast without attacking others", "compare only reviewed facts and avoid fake UI text"),
  entry("mistake_fix", "Three mistakes countdown", ["all", "education_course", "finance_education", "beauty_skincare", "fitness_wellness"], ["3 mistakes", "three mistakes", "countdown", "list", "tips"], ["education", "problem_solution"], "open with the most painful mistake, not a generic list intro", "mistake one, quick fix, proof, next mistake/payoff", "one concrete example per mistake", "viewer saves because it is structured", "creator teaches quickly without sounding scripted", "avoid overloading text; use visual chapter changes instead"),
  entry("hidden_detail_reveal", "Checklist/saveable teardown", ["all", "education_course", "saas_b2b", "real_estate", "finance_education"], ["checklist", "teardown", "audit", "review", "save this"], ["education", "demo"], "open with the checklist item most viewers miss", "item, example, why it matters, save cue", "example-based proof", "viewer saves for later", "creator behaves like a practical reviewer", "keep advice general in regulated categories"),
  entry("creator_confession", "I wish I knew sooner hook", ["all", "education_course", "beauty_skincare", "saas_b2b", "fashion_apparel"], ["wish i knew", "before i bought", "sooner", "lesson"], ["ugc_review", "education", "story"], "open with the hindsight confession", "confession, missed detail, product/lesson proof, payoff", "hindsight proof or learned detail", "viewer feels helped before being sold", "KOL speaks like one buyer/person", "rewrite confession from user context, not source wording")
] as const;

const CORPUS: readonly CorpusEntry[] = [...CORE_CORPUS, ...ENTERTAINMENT_EXPANSION, ...TAXONOMY_EXPANSION] as const;

export const SHORT_PROMPT_CORPUS_COVERAGE: ShortPromptCorpusCoverage = {
  schemaVersion: "cinejelly.short-prompt-pattern-corpus-coverage.v1",
  sourceRepository: PRIMARY_PROMPT_CORPUS_SOURCE_REPOSITORY,
  declaredPromptCount: 3817,
  localVideoUrlIndexCount: 1000,
  readmePromptSectionCount: 106,
  localizedReadmeCount: 15,
  runtimePatternCount: CORPUS.length,
  taxonomyFamilyCount: 42,
  retrievalTopKWithoutReference: 36,
  retrievalTopKWithReference: 40,
  promptTextBundlingPolicy: "external_snapshot_only_runtime_uses_distilled_pattern_dna",
  attributionPolicy: "preserve_cc_by_4_0_lineage_no_verbatim_render_prompt",
  trendVideoIntakeSupported: true
};

export function retrieveShortPromptCorpusPatterns(input: ShortPromptCorpusRetrievalInput): readonly ShortPromptCorpusPatternSpec[] {
  const haystack = normalizedText([
    input.prompt,
    input.niche,
    input.creativeMode,
    input.platformFocus,
    input.audience,
    input.buyerIntent,
    ...input.ideaSeeds
  ].join(" "));
  return CORPUS
    .map((entryItem, index) => ({
      entry: entryItem,
      index,
      score: corpusFitScore(entryItem, input, haystack)
    }))
    .filter((item) => item.score >= 0.24)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, input.hasReferenceVideo ? SHORT_PROMPT_CORPUS_COVERAGE.retrievalTopKWithReference : SHORT_PROMPT_CORPUS_COVERAGE.retrievalTopKWithoutReference)
    .map((item) => toSpec(item.entry, item.score));
}

function toSpec(entryItem: CorpusEntry, score: number): ShortPromptCorpusPatternSpec {
  const sourceRepository = entryItem.sourceRepository ?? PRIMARY_PROMPT_CORPUS_SOURCE_REPOSITORY;
  const license = entryItem.license ?? "CC-BY-4.0";
  return {
    kind: entryItem.kind,
    label: entryItem.label,
    source: SOURCE,
    nicheTags: entryItem.nicheTags,
    hookMechanic: entryItem.hookMechanic,
    retentionMechanic: entryItem.retentionMechanic,
    proofDevice: entryItem.proofDevice,
    payoffMechanic: entryItem.payoffMechanic,
    creatorOrKolRole: entryItem.creatorOrKolRole,
    adaptationRule: entryItem.adaptationRule,
    riskControls: [
      ...(entryItem.riskControls ?? []),
      "distilled prompt-corpus pattern only; do not reproduce upstream prompt wording",
      "preserve attribution lineage and transform into user-owned KOL/product scenes"
    ],
    fitReasons: [
      ...(entryItem.fitReasons ?? []),
      `prompt_corpus_score=${round(score)}`,
      `corpus_declared_prompts=${SHORT_PROMPT_CORPUS_COVERAGE.declaredPromptCount}`,
      `runtime_patterns=${SHORT_PROMPT_CORPUS_COVERAGE.runtimePatternCount}`,
      `source=${sourceRepository}`,
      `license=${license}`,
      "commercial_use_allowed=true"
    ],
    keywordSignals: entryItem.keywordSignals,
    modeSignals: entryItem.modeSignals,
    platformSignals: entryItem.platformSignals ?? ["tiktok_douyin", "reels", "youtube_shorts", "paid_social", "cross_platform_social"],
    sourceRepository,
    license,
    sourceTransform: "distilled_pattern_no_verbatim_prompt",
    commercialUseAllowed: true
  };
}

function corpusFitScore(entryItem: CorpusEntry, input: ShortPromptCorpusRetrievalInput, haystack: string): number {
  let score = 0.18;
  const niche = normalizedText(input.niche);
  const tags = entryItem.nicheTags.map(normalizedText);
  if (tags.includes("all")) score += 0.05;
  if (tags.includes(niche)) score += 0.28;
  if (tags.some((tag) => tag !== "all" && (niche.includes(tag) || tag.includes(niche)))) score += 0.12;
  if (entryItem.modeSignals.includes(input.creativeMode)) score += 0.16;
  if ((entryItem.platformSignals ?? []).includes(input.platformFocus)) score += 0.05;
  const keywordHits = entryItem.keywordSignals.filter((signal) => haystack.includes(normalizedText(signal))).length;
  score += Math.min(0.24, keywordHits * 0.06);
  if (input.hasReferenceVideo && /reference|trend|native|copy|remake|structure|source|upload|video/.test(haystack)) score += 0.09;
  if (input.hasProductEvidence) score += 0.04;
  if (input.targetDurationSeconds <= 20 && ["sensory_closeup", "first_try_reaction", "problem_demo_payoff"].includes(entryItem.kind)) score += 0.04;
  if (input.targetDurationSeconds >= 28 && ["proof_diary", "workflow_before_after", "challenge_progress"].includes(entryItem.kind)) score += 0.04;
  if (!entryItem.riskControls?.some((risk) => /regulated|claim|review/i.test(risk))) score += 0.02;
  return Math.min(1, score);
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
  riskControls: readonly string[] = [],
  fitReasons: readonly string[] = []
): CorpusEntry {
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
    riskControls,
    fitReasons
  };
}

function normalizedText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
