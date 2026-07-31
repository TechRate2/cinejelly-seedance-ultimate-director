/**
 * Short creative pattern learning.
 * Builds no-spend structural pattern candidates for high-retention shorts without copying source videos.
 */

import type { BrandKitEvaluation, ProductUrlBrief, ShortPipelineConcept, ShortPipelineScenePlan } from "../types/short-pipeline.js";
import type {
  ShortCreativeIdeaCandidate,
  ShortCreativeIdeaScore,
  ShortCreativePattern,
  ShortCreativePatternKind,
  ShortCreativePatternLearningPlan,
  ShortCreativePatternSource,
  ShortReferenceVideoPattern,
  ShortViralNicheStrategy
} from "../types/short-viral-intelligence.js";
import {
  retrieveShortPromptCorpusPatterns,
  SHORT_PROMPT_CORPUS_COVERAGE,
  SHORT_PROMPT_CORPUS_ORIGINS,
  type ShortPromptCorpusPatternSpec
} from "./short-prompt-pattern-corpus.js";
import {
  retrieveShortPlatformTemplatePatterns,
  SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE,
  SHORT_PLATFORM_TEMPLATE_CORPUS_ORIGINS,
  type ShortPlatformTemplatePatternSpec
} from "./short-platform-template-corpus.js";
import {
  internalSourcePatternOrigins,
  SHORT_CORE_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";
import { hasCopyRiskIntent } from "../utils/copy-risk-intent.js";
import { createStableId } from "../utils/ids.js";

const SOURCE_PATTERN_ORIGINS = [
  ...internalSourcePatternOrigins(SHORT_CORE_SOURCE_PATTERN_IDS),
  ...SHORT_PROMPT_CORPUS_ORIGINS,
  ...SHORT_PLATFORM_TEMPLATE_CORPUS_ORIGINS
] as const;

const HIGH_RISK_CLAIM_PATTERN =
  /cure|heal|medical|clinical|guarantee|guaranteed|100%|risk[-\s]?free|earn|income|profit|investment|weight loss|overnight|#1|best/i;

export interface ShortCreativePatternLearningInput {
  readonly projectId: string;
  readonly prompt: string;
  readonly strategy: ShortViralNicheStrategy;
  readonly referenceVideoPattern?: ShortReferenceVideoPattern;
  readonly productBrief?: ProductUrlBrief;
  readonly brandKitEvaluation?: BrandKitEvaluation;
  readonly concepts: readonly ShortPipelineConcept[];
  readonly scenes: readonly ShortPipelineScenePlan[];
  readonly durationSeconds: number;
}

interface LocalPatternSpec {
  readonly kind: ShortCreativePatternKind;
  readonly label: string;
  readonly source: ShortCreativePatternSource;
  readonly nicheTags: readonly string[];
  readonly hookMechanic: string;
  readonly retentionMechanic: string;
  readonly proofDevice: string;
  readonly payoffMechanic: string;
  readonly creatorOrKolRole: string;
  readonly adaptationRule: string;
  readonly riskControls?: readonly string[];
  readonly fitReasons?: readonly string[];
}

type PatternSpec = LocalPatternSpec | ShortPromptCorpusPatternSpec | ShortPlatformTemplatePatternSpec;

export class ShortCreativePatternLearningEngine {
  public build(input: ShortCreativePatternLearningInput): ShortCreativePatternLearningPlan {
    if (!input.projectId.trim()) {
      throw new Error("projectId is required for short creative pattern learning.");
    }
    const prompt = cleanText(input.prompt, 3000) ?? "";
    const patterns = this.patterns(input, prompt);
    const candidates = patterns
      .map((pattern) => this.candidateFor(pattern, input, prompt))
      .sort((left, right) => right.score.totalScore - left.score.totalScore || left.ideaId.localeCompare(right.ideaId));
    const selected = candidates[0];
    const learningId = createStableId(
      "short_pattern_learning",
      [
        input.projectId,
        prompt,
        input.strategy.niche,
        input.strategy.creativeMode,
        input.referenceVideoPattern?.patternId ?? "no_reference",
        selected?.ideaId ?? "no_idea"
      ].join(":")
    );

    return {
      schemaVersion: "cinejelly.short-creative-pattern-learning.v1",
      learningId,
      noSpend: true,
      networkCallsMade: false,
      providerCallsMade: false,
      ...(selected ? { selectedIdeaId: selected.ideaId, selectedPatternId: selected.patternId } : {}),
      patternCount: patterns.length,
      candidateCount: candidates.length,
      patterns,
      candidates,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS
    };
  }

  private patterns(input: ShortCreativePatternLearningInput, prompt: string): readonly ShortCreativePattern[] {
    const specs = [
      ...retrieveShortPromptCorpusPatterns({
        prompt,
        niche: input.strategy.niche,
        creativeMode: input.strategy.creativeMode,
        platformFocus: input.strategy.platformFocus,
        audience: input.strategy.audience,
        buyerIntent: input.strategy.buyerIntent,
        targetDurationSeconds: input.durationSeconds,
        ideaSeeds: input.strategy.audienceNicheIntelligence.ideaSeeds,
        hasReferenceVideo: Boolean(input.referenceVideoPattern),
        hasProductEvidence: Boolean(input.productBrief)
      }),
      ...retrieveShortPlatformTemplatePatterns({
        prompt,
        niche: input.strategy.niche,
        creativeMode: input.strategy.creativeMode,
        platformFocus: input.strategy.platformFocus,
        audience: input.strategy.audience,
        buyerIntent: input.strategy.buyerIntent,
        targetDurationSeconds: input.durationSeconds,
        ideaSeeds: input.strategy.audienceNicheIntelligence.ideaSeeds,
        hasReferenceVideo: Boolean(input.referenceVideoPattern),
        hasProductEvidence: Boolean(input.productBrief)
      }),
      ...nicheSpecs(input.strategy.niche, input.strategy.creativeMode),
      ...promptSignalSpecs(prompt, input.strategy.niche),
      ...referenceSpecs(input.referenceVideoPattern, input.strategy.niche),
      ...ideaSeedSpecs(input.strategy.audienceNicheIntelligence.ideaSeeds, input.strategy.niche),
      ...conceptSignalSpecs(input.concepts, input.strategy.niche),
      ...generalPlatformSpecs(input.strategy.niche)
    ];
    const seen = new Set<string>();
    const patterns: ShortCreativePattern[] = [];
    for (const spec of specs) {
      const key = `${spec.source}:${spec.kind}:${spec.label.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const pattern = this.patternFromSpec(spec, input, prompt);
      patterns.push(pattern);
    }
    const sortedPatterns = patterns
      .sort((left, right) => patternFitScore(right, input) - patternFitScore(left, input))
    return diversifyPatternSources(
      sortedPatterns,
      Math.max(SHORT_PROMPT_CORPUS_COVERAGE.retrievalTopKWithReference, SHORT_PLATFORM_TEMPLATE_CORPUS_COVERAGE.retrievalTopK)
    );
  }

  private patternFromSpec(
    spec: PatternSpec,
    input: ShortCreativePatternLearningInput,
    prompt: string
  ): ShortCreativePattern {
    const product = productLabel(input.productBrief, input.strategy.niche);
    const patternId = createStableId(
      "short_pattern",
      [
        spec.source,
        spec.kind,
        spec.label,
        input.strategy.niche,
        product,
        input.referenceVideoPattern?.patternId ?? "",
        prompt
      ].join(":")
    );
    return {
      patternId,
      kind: spec.kind,
      label: spec.label,
      source: spec.source,
      nicheTags: uniqueClean([...spec.nicheTags, input.strategy.niche], 8, 80),
      hookMechanic: cleanText(spec.hookMechanic, 220) ?? input.strategy.audienceNicheIntelligence.hookAngle,
      retentionMechanic: cleanText(spec.retentionMechanic, 220) ?? input.strategy.audienceNicheIntelligence.retentionPattern,
      proofDevice: cleanText(spec.proofDevice, 220) ?? input.strategy.audienceNicheIntelligence.proofStrategy,
      payoffMechanic: cleanText(spec.payoffMechanic, 220) ?? input.strategy.audienceNicheIntelligence.shareTrigger,
      creatorOrKolRole: cleanText(spec.creatorOrKolRole, 180) ?? "creator or KOL adapts the idea with original delivery",
      adaptationRule: cleanText(spec.adaptationRule, 260) ?? "adapt the structure to the user product, KOL, audience, and reviewed claims",
      originalityGuardrails: originalityGuardrails(spec.source, input.referenceVideoPattern),
      riskControls: uniqueClean([
        ...(spec.riskControls ?? []),
        ...riskControlsFor(input, prompt)
      ], 8, 180),
      fitReasons: uniqueClean([
        ...(spec.fitReasons ?? []),
        `fits ${input.strategy.niche}`,
        `matches ${input.strategy.platformFocus}`,
        `supports ${input.strategy.audienceNicheIntelligence.trendPosture}`
      ], 6, 180)
    };
  }

  private candidateFor(
    pattern: ShortCreativePattern,
    input: ShortCreativePatternLearningInput,
    prompt: string
  ): ShortCreativeIdeaCandidate {
    const product = productLabel(input.productBrief, input.strategy.niche);
    const proofAnchor = proofAnchorFor(input.productBrief, input.strategy);
    const label = `${product}: ${pattern.label}`;
    const sceneArc = sceneArcFor(pattern, input.strategy, proofAnchor, input.scenes.length);
    const score = scoreCandidate(pattern, input, prompt, sceneArc);
    const ideaId = createStableId(
      "short_idea",
      [
        pattern.patternId,
        label,
        input.strategy.audience,
        proofAnchor,
        input.durationSeconds
      ].join(":")
    );
    return {
      ideaId,
      patternId: pattern.patternId,
      label,
      logline: `${pattern.creatorOrKolRole} turns "${input.strategy.viewerObjection}" into ${pattern.proofDevice} for ${input.strategy.audience}.`,
      hook: hookFor(pattern, input.strategy, product),
      sceneArc,
      proofPlan: `${pattern.proofDevice}. Use reviewed evidence only: ${proofAnchor}.`,
      creatorOrKolDirection: creatorDirectionFor(pattern, input, product),
      productionNotes: productionNotesFor(pattern, input),
      riskControls: pattern.riskControls,
      score,
      reasons: scoreReasons(pattern, input, score)
    };
  }
}

function diversifyPatternSources(patterns: readonly ShortCreativePattern[], limit: number): readonly ShortCreativePattern[] {
  const requiredSources: readonly ShortCreativePatternSource[] = [
    "seedance_prompt_corpus",
    "platform_template_corpus",
    "audience_niche",
    "prompt_signal",
    "niche_playbook",
    "reference_video"
  ];
  const output: ShortCreativePattern[] = [];
  const seen = new Set<string>();
  for (const source of requiredSources) {
    const pattern = patterns.find((item) => item.source === source);
    if (pattern && !seen.has(pattern.patternId)) {
      output.push(pattern);
      seen.add(pattern.patternId);
    }
  }
  for (const pattern of patterns) {
    if (seen.has(pattern.patternId)) {
      continue;
    }
    output.push(pattern);
    seen.add(pattern.patternId);
    if (output.length >= limit) {
      break;
    }
  }
  return output.slice(0, limit);
}

function nicheSpecs(niche: string, mode: string): readonly LocalPatternSpec[] {
  const base: LocalPatternSpec[] = [];
  if (/beauty|skincare|cosmetic|hair/.test(niche)) {
    base.push(
      spec("proof_diary", "KOL proof diary across repeated moments", "niche_playbook", [niche, "beauty_skincare"], "open with a skeptical day-one or first-use tension", "repeat the same creator/product setup with micro-progress beats", "routine diary proof with review-bound before/after framing", "visible confidence or routine payoff after proof", "KOL or creator documents the product honestly across moments", "replace the source person/product/timing with the user's KOL, product, and reviewed claim evidence", ["avoid unsubstantiated medical or overnight transformation claims"]),
      spec("routine_rescue", "Morning routine rescue", "niche_playbook", [niche, "beauty_skincare"], "show the rushed or dull-looking moment before the product appears", "move from problem to texture to quick application to payoff", "macro texture, usage step, and visible routine context", "the routine feels easier or more polished", "creator feels native, lightly imperfect, and product-literate", "adapt the routine to the real buyer scenario instead of copying a reference script"),
      spec("sensory_closeup", "Texture macro satisfaction", "niche_playbook", [niche, "beauty_skincare"], "begin with a tactile close-up that makes viewers stop", "alternate macro texture, face/result context, and creator reaction", "sensory product evidence plus approved benefit", "viewer remembers the texture and payoff", "KOL uses hands, mirror, and close camera as proof tools", "make product texture and usage original to supplied assets"),
      spec("before_after_guarded", "Guarded before/after proof", "niche_playbook", [niche, "beauty_skincare"], "show a conservative before-state without exaggerated claims", "hold attention through a clear method and reviewed proof boundary", "side-by-side or repeated-condition proof with claim review", "payoff is believable instead of miraculous", "creator explains the boundary of what is shown", "only use before/after if evidence and claims are approved", ["manual claim review required for transformation framing"])
    );
  }
  if (/fitness|wellness|health/.test(niche)) {
    base.push(
      spec("challenge_progress", "Progress challenge arc", "niche_playbook", [niche, "fitness_wellness"], "start with the challenge or baseline tension", "show repeated action and small proof beats", "measurable progress or habit proof", "viewer sees progress as achievable", "creator acts as accountable participant", "adapt timeline and measurements to real evidence", ["avoid guaranteed body or medical outcomes"]),
      spec("mistake_fix", "Form or habit mistake fix", "niche_playbook", [niche, "fitness_wellness"], "call out the common mistake first", "fix, example, result, then next step", "specific correction proof", "viewer wants to save or try it", "coach/KOL demonstrates without overclaiming", "use the user's product as helper only where evidence supports it")
    );
  }
  if (/saas|b2b|agency|software|workflow/.test(niche)) {
    base.push(
      spec("workflow_before_after", "Chaos to clean workflow", "niche_playbook", [niche, "saas_b2b"], "open on visible workflow chaos or too many handoffs", "compress before, mechanism, proof, after-state", "dashboard or process proof", "one clean next action feels obvious", "founder/operator narrates the workflow from experience", "replace generic dashboard claims with actual reviewed product facts"),
      spec("hidden_detail_reveal", "Hidden cost reveal", "niche_playbook", [niche, "saas_b2b"], "reveal the invisible time or money leak first", "show the leak, the fix, and one concrete proof point", "time saved or task removed proof", "viewer recognizes the cost and wants the fix", "operator/KOL plays the expert who noticed the pattern", "avoid fake metrics unless supplied and reviewed")
    );
  }
  if (/workspace|desk|office|remote|productivity|organizer|cable/.test(niche)) {
    base.push(
      spec("hidden_detail_reveal", "Desk chaos hidden detail reveal", "niche_playbook", [niche, "workspace_accessory"], "open on the tiny workspace irritation viewers ignore until it looks obvious", "show clutter, reveal the hidden friction, fix one detail, then land a clean-desk payoff", "before/after desk state and one visible cable or accessory action", "the workspace looks calmer and easier to use", "creator/KOL behaves like a desk-setup insider, not a scripted salesperson", "replace any source setup with the user's desk, product, KOL, and reviewed proof"),
      spec("sensory_closeup", "Satisfying desk reset close-up", "niche_playbook", [niche, "workspace_accessory"], "start with a satisfying snap, slide, coil, click, or clean alignment", "alternate close-up action, wider desk context, and human reaction", "observable organizer movement, cable control, or workspace before/after proof", "viewer wants to save or copy the setup idea, not the source video", "KOL lets the product movement and desk state carry the proof", "adapt the reset to real product geometry and avoid fake impossible desk transformations"),
      spec("micro_story_twist", "Workday cable rescue twist", "niche_playbook", [niche, "workspace_accessory"], "open with a small funny workday failure caused by clutter", "relatable setup, product rescue, tiny twist, payoff", "one practical rescue beat with visible desk evidence", "viewer tags someone with the same desk problem", "KOL plays the problem naturally and keeps humor brand-safe", "make the story original to the user's product and workspace")
    );
  }
  if (/food|beverage|restaurant|coffee|drink/.test(niche)) {
    base.push(
      spec("first_try_reaction", "First sip or first bite reaction", "niche_playbook", [niche, "food_beverage"], "open with the reaction before explaining the product", "sensory close-up, pause, reaction, share trigger", "texture, sound, steam, or taste context", "friends want to try it too", "creator reacts naturally rather than acting like an ad", "adapt reaction and setting to actual product"),
      spec("sensory_closeup", "Texture ASMR proof", "niche_playbook", [niche, "food_beverage"], "start with the most satisfying visual or sound", "alternate sensory detail and social proof", "observable texture or preparation proof", "payoff feels craveable", "KOL frames the product as a moment worth sharing", "do not imply taste claims beyond experience")
    );
  }
  if (/education|course|training|learn/.test(niche)) {
    base.push(
      spec("mistake_fix", "Beginner mistake fix", "niche_playbook", [niche, "education_course"], "open with the mistake that blocks progress", "mistake, quick fix, tiny example, next step", "micro lesson proof", "viewer saves or continues", "teacher/KOL simplifies without sounding generic", "adapt lesson to the user's actual curriculum"),
      spec("myth_bust", "Myth bust mini lesson", "niche_playbook", [niche, "education_course"], "challenge a belief the audience already has", "myth, example, correction, payoff", "specific example proof", "viewer feels smarter quickly", "creator teaches with calm authority", "avoid unverifiable guarantees about outcomes")
    );
  }
  if (/real_estate|property|travel|hospitality/.test(niche)) {
    base.push(
      spec("hidden_detail_reveal", "Hidden detail tour", "niche_playbook", [niche], "open with the detail most viewers would miss", "detail, context, value, lifestyle payoff", "visual walkthrough proof", "viewer wants to save or inquire", "host/KOL reveals details like an insider", "adapt to real property/place footage and rights"),
      spec("cinematic_reveal", "Premium reveal path", "niche_playbook", [niche], "begin with a cinematic contradiction or reveal", "slow reveal, proof detail, payoff", "environment and product/place evidence", "premium feeling without overclaiming", "KOL/host stays minimal and lets visuals sell", "keep all location and rights evidence approved")
    );
  }
  if (mode === "comparison") {
    base.push(spec("comparison_test", "Side-by-side decision test", "niche_playbook", [niche], "open with two choices and one clear criterion", "compare, prove, resolve, next action", "observable comparison proof", "viewer understands why this option wins", "creator acts as honest evaluator", "only compare reviewed facts and avoid competitor disparagement"));
  }
  return base;
}

function promptSignalSpecs(prompt: string, niche: string): readonly LocalPatternSpec[] {
  const specs: LocalPatternSpec[] = [];
  if (/\b(kol|creator|influencer|reviewer|ugc)\b/i.test(prompt)) {
    specs.push(spec("creator_confession", "Creator confession hook", "prompt_signal", [niche], "open with a personal admission or skeptical line", "confession, product proof, changed mind, payoff", "creator experience plus reviewed product proof", "viewer trusts the turn because it feels lived-in", "KOL starts honest, not polished", "adapt to the selected KOL voice and original script"));
  }
  if (/\b(fun|funny|meme|bua|weird|chaotic|joke|humor)\b/i.test(prompt)) {
    specs.push(spec("micro_story_twist", "Funny micro-story twist", "prompt_signal", [niche], "open with a strange or funny situation tied to the product problem", "joke setup, product proof, twist payoff", "humor plus visible product evidence", "viewer shares because the moment is relatable", "KOL plays the situation naturally", "keep humor original and brand-safe", ["avoid humiliation, protected traits, or unsafe challenges"]));
  }
  if (/\b(day|ngay|7\s*day|week|before|after|progress|journey)\b/i.test(prompt)) {
    specs.push(spec("proof_diary", "Repeated proof diary", "prompt_signal", [niche], "open on day-one tension or baseline proof", "repeat framing, show progression, land payoff", "time-based proof with review boundary", "viewer follows to see the result", "KOL records consistent moments across the arc", "use actual reviewed evidence and avoid fake transformations"));
  }
  if (/\b(challenge|test|try|tested|experiment)\b/i.test(prompt)) {
    specs.push(spec("challenge_progress", "Creator test challenge", "prompt_signal", [niche], "state the test before the product pitch", "test setup, proof beats, result, CTA", "test or experiment proof", "viewer stays to see whether it works", "KOL becomes the tester", "document the test honestly with reviewed claims"));
  }
  return specs;
}

function ideaSeedSpecs(ideaSeeds: readonly string[], niche: string): readonly LocalPatternSpec[] {
  return ideaSeeds.slice(0, 4).map((seed, index) => {
    const kind = kindForCreativeSeed(seed);
    const seedLabel = cleanText(seed.replace(/^(Hook|Retention|Proof|Share\/CTA|Format\/posture|Desire\/objecting tension):\s*/i, ""), 80) ??
      `Audience-derived angle ${index + 1}`;
    return spec(
      kind,
      `Audience seed: ${seedLabel}`,
      "audience_niche",
      [niche],
      seed.includes("Hook:") ? seed : "turn the audience seed into a first-second visual promise",
      seed.includes("Retention:") ? seed : "advance the exact audience tension through visible beat changes",
      seed.includes("Proof:") ? seed : "prove the seed with reviewed product evidence or observable behavior",
      seed.includes("Share/CTA:") ? seed : "pay off the seed with a saveable or shareable result",
      "creator or KOL adapts the audience seed into original delivery",
      "use the audience/niche seed as strategy, not as fixed wording or a copied script"
    );
  });
}

function conceptSignalSpecs(concepts: readonly ShortPipelineConcept[], niche: string): readonly LocalPatternSpec[] {
  return concepts.slice(0, 3).map((concept, index) => {
    const combined = `${concept.label} ${concept.angle} ${concept.hook}`;
    const kind = kindForCreativeSeed(combined);
    const label = cleanText(concept.label, 80) ?? `Concept-derived angle ${index + 1}`;
    return spec(
      kind,
      `Concept signal: ${label}`,
      "audience_niche",
      [niche],
      cleanText(concept.hook, 180) ?? "open with the strongest concept promise",
      cleanText(concept.angle, 180) ?? "turn the concept angle into quick visual proof beats",
      "connect concept proof to reviewed claims, product facts, or observable use",
      "close the concept with a visual payoff that earns the next action",
      "creator/KOL performs the concept in their own voice and setting",
      "preserve the concept intent while rewriting scenes around user-approved product evidence"
    );
  });
}

function referenceSpecs(reference: ShortReferenceVideoPattern | undefined, niche: string): readonly LocalPatternSpec[] {
  if (!reference) {
    return [];
  }
  return [
    spec(
      referenceKind(reference),
      "Reference-derived structural pattern",
      "reference_video",
      [niche],
      reference.hookPattern,
      `${reference.pacingPattern}; ${reference.retentionMechanics.slice(0, 3).join("; ")}`,
      "reference proof logic adapted to reviewed product evidence",
      reference.ctaPattern,
      "new KOL or creator uses only the learned timing and structural rhythm",
      `learn structure from ${reference.patternId}; replace script, product, KOL, captions, audio, brand marks, claims, and assets`,
      reference.originalityGuardrails
    )
  ];
}

function generalPlatformSpecs(niche: string): readonly LocalPatternSpec[] {
  return [
    spec("problem_demo_payoff", "Problem-demo-payoff sprint", "audience_niche", [niche, "all"], "start with one concrete viewer problem", "problem, product action, proof, payoff", "visible use-case proof", "viewer sees the next step as natural", "creator shows instead of explains", "adapt every beat to the user's product facts"),
    spec("skeptical_review", "Skeptical review turn", "audience_niche", [niche, "all"], "begin skeptical or surprised before proof", "skepticism, proof, changed mind, CTA", "proof that changes the creator's mind", "viewer feels the proof earned trust", "KOL starts with restraint and earns enthusiasm", "keep the review original and evidence-bound"),
    spec("mistake_fix", "Mistake-to-fix saveable short", "audience_niche", [niche, "all"], "name the mistake the viewer recognizes", "mistake, fix, proof, next action", "specific correction proof", "viewer wants to save or share", "creator teaches or demonstrates in one concrete beat", "do not make unsupported expert claims"),
    spec("hidden_detail_reveal", "Hidden detail reveal", "audience_niche", [niche, "all"], "open on the detail most viewers overlook", "detail, context, proof, payoff", "observable hidden-detail proof", "viewer feels they discovered something worth saving", "KOL acts like an insider who noticed the pattern", "adapt the reveal to real product facts, not invented secrets"),
    spec("challenge_progress", "Try-it-live challenge", "audience_niche", [niche, "all"], "state the test or challenge before selling", "test setup, proof attempt, result, next step", "live test or constrained experiment proof", "viewer stays to see whether the result lands", "creator becomes the tester, not a scripted spokesperson", "keep the challenge safe, honest, and review-bound"),
    spec("comparison_test", "Decision test comparison", "audience_niche", [niche, "all"], "open with two possible choices and one clear criterion", "compare, prove, resolve, next action", "observable decision proof", "viewer understands why this route fits them", "creator frames the comparison as helpful, not attacking", "compare only reviewed facts and avoid competitor disparagement"),
    spec("creator_confession", "Honest creator turn", "audience_niche", [niche, "all"], "start with a real hesitation, mistake, or changed-mind line", "confession, proof, turn, payoff", "creator experience plus reviewed proof", "viewer trusts the turn because it has a boundary", "KOL feels candid and specific", "rewrite the confession for the user's KOL and product context"),
    spec("community_reaction", "Community reaction loop", "audience_niche", [niche, "all"], "begin with a social moment, comment, or crowd curiosity", "social cue, product proof, reaction, share trigger", "reaction or social-proof evidence", "viewer wants to tag, share, or ask about it", "creator captures natural reactions without staged claims", "use only approved testimonials or generalized reactions"),
    spec("sensory_closeup", "Satisfying proof close-up", "audience_niche", [niche, "all"], "open with the most satisfying observable product detail", "macro detail, use step, reaction, payoff", "texture, motion, sound, interface, or process proof", "viewer remembers the proof device", "KOL lets the product evidence carry the beat", "make the close-up specific to available product assets"),
    spec("micro_story_twist", "Relatable micro-story twist", "audience_niche", [niche, "all"], "start with a small relatable situation that looks like content, not an ad", "setup, product proof, twist, payoff", "story action plus visible product evidence", "viewer shares because the twist maps to their life", "creator acts the situation naturally", "keep the story original, brand-safe, and grounded in reviewed claims")
  ];
}

function spec(
  kind: ShortCreativePatternKind,
  label: string,
  source: ShortCreativePatternSource,
  nicheTags: readonly string[],
  hookMechanic: string,
  retentionMechanic: string,
  proofDevice: string,
  payoffMechanic: string,
  creatorOrKolRole: string,
  adaptationRule: string,
  riskControls: readonly string[] = [],
  fitReasons: readonly string[] = []
): LocalPatternSpec {
  return {
    kind,
    label: cleanText(label, 140) ?? "Creative structural pattern",
    source,
    nicheTags,
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

function kindForCreativeSeed(value: string): ShortCreativePatternKind {
  const lower = value.toLowerCase();
  if (/before|after|day|progress|journey|routine/.test(lower)) return "proof_diary";
  if (/compare|versus|vs|choice|decision/.test(lower)) return "comparison_test";
  if (/mistake|wrong|fix|avoid/.test(lower)) return "mistake_fix";
  if (/myth|truth|secret|belief/.test(lower)) return "myth_bust";
  if (/challenge|test|try|experiment/.test(lower)) return "challenge_progress";
  if (/workflow|dashboard|process|handoff|automation/.test(lower)) return "workflow_before_after";
  if (/community|comment|friend|reaction|social|tag|share/.test(lower)) return "community_reaction";
  if (/texture|asmr|close|macro|sound|taste|feel|interface|snap|slide|click|cable|desk|organizer/.test(lower)) return "sensory_closeup";
  if (/story|funny|weird|twist|meme|bua|relatable/.test(lower)) return "micro_story_twist";
  if (/premium|cinematic|reveal|luxury/.test(lower)) return "cinematic_reveal";
  if (/creator|kol|ugc|review|honest|skeptic/.test(lower)) return "creator_confession";
  return "problem_demo_payoff";
}

function referenceKind(reference: ShortReferenceVideoPattern): ShortCreativePatternKind {
  const combined = `${reference.hookPattern} ${reference.pacingPattern} ${reference.ctaPattern}`.toLowerCase();
  if (/before|after|day|progress|diary/.test(combined)) return "proof_diary";
  if (/compare|versus|vs|side/.test(combined)) return "comparison_test";
  if (/mistake|wrong|fix/.test(combined)) return "mistake_fix";
  if (/cinematic|reveal|premium/.test(combined)) return "cinematic_reveal";
  if (/reaction|sip|bite|try/.test(combined)) return "first_try_reaction";
  if (/workflow|dashboard|handoff/.test(combined)) return "workflow_before_after";
  if (/review|creator|ugc|skeptic/.test(combined)) return "skeptical_review";
  return "problem_demo_payoff";
}

function patternFitScore(pattern: ShortCreativePattern, input: ShortCreativePatternLearningInput): number {
  let score = 0.5;
  const tags = pattern.nicheTags.join(" ").toLowerCase();
  if (tags.includes(input.strategy.niche.toLowerCase())) score += 0.18;
  if (tags.includes("all")) score += 0.04;
  if (pattern.source === "reference_video") score += 0.14;
  if (pattern.source === "seedance_prompt_corpus") score += 0.13;
  if (pattern.source === "platform_template_corpus") score += 0.12;
  if (pattern.source === "prompt_signal") score += 0.12;
  if (input.strategy.audienceNicheIntelligence.trendPosture === "trend_native") score += 0.08;
  if (pattern.kind === "proof_diary" && /beauty|fitness|education|wellness/.test(input.strategy.niche)) score += 0.08;
  if (pattern.kind === "workflow_before_after" && /saas|b2b|agency|workflow/.test(input.strategy.niche)) score += 0.08;
  if ((pattern.kind === "hidden_detail_reveal" || pattern.kind === "sensory_closeup") && /workspace|desk|office|organizer|cable/.test(input.strategy.niche)) score += 0.08;
  return score;
}

function sceneArcFor(
  pattern: ShortCreativePattern,
  strategy: ShortViralNicheStrategy,
  proofAnchor: string,
  sceneCount: number
): readonly string[] {
  const arcByKind: Partial<Record<ShortCreativePatternKind, readonly string[]>> = {
    proof_diary: ["baseline or day-one tension", "repeated product moment", "micro proof shift", "visible payoff", "soft reviewed next step"],
    skeptical_review: ["skeptical first line", "proof setup", "specific product evidence", "changed-mind payoff", "earned CTA"],
    routine_rescue: ["rushed routine problem", "product texture/use", "fast demo", "routine payoff", "soft CTA"],
    myth_bust: ["myth statement", "why it fails", "specific proof", "replacement behavior", "save/share cue"],
    challenge_progress: ["challenge setup", "attempt/proof beat", "progress signal", "result", "next action"],
    comparison_test: ["two options", "decision criterion", "observable test", "winner reason", "CTA after proof"],
    problem_demo_payoff: ["recognizable problem", "product action", "visible proof", "clear payoff", "soft next action"],
    creator_confession: ["honest hesitation", "product proof", "specific evidence", "changed-mind turn", "earned next step"],
    sensory_closeup: ["satisfying detail", "use context", "proof close-up", "human reaction", "payoff"],
    before_after_guarded: ["conservative before-state", "method", "reviewed proof", "guarded after-state", "claim-safe CTA"],
    community_reaction: ["social cue", "product proof", "reaction", "share trigger", "soft CTA"],
    hidden_detail_reveal: ["overlooked detail", "why it matters", "proof context", "value payoff", "save/inquire cue"],
    mistake_fix: ["recognizable mistake", "correction", "proof example", "payoff", "save cue"],
    workflow_before_after: ["workflow chaos", "mechanism", "dashboard/process proof", "clean outcome", "book/demo cue"],
    micro_story_twist: ["relatable odd setup", "unexpected product entrance", "proof beat", "twist payoff", "share cue"],
    first_try_reaction: ["reaction before explanation", "sensory proof", "second confirmation", "social/share payoff", "CTA"],
    cinematic_reveal: ["visual contradiction", "premium reveal", "proof detail", "payoff", "restrained CTA"]
  };
  const base = arcByKind[pattern.kind] ?? ["hook", "problem", "proof", "demo", "payoff"];
  const arc = base.slice(0, Math.max(3, Math.min(6, sceneCount || base.length)));
  return uniqueClean([
    ...arc,
    `proof anchor: ${proofAnchor}`,
    `viewer tension: ${strategy.viewerObjection}`
  ], 8, 160);
}

function hookFor(pattern: ShortCreativePattern, strategy: ShortViralNicheStrategy, product: string): string {
  if (pattern.source === "reference_video") {
    return `Use the learned structural hook for ${product}, but rewrite the line and visual action around ${strategy.viewerDesire}.`;
  }
  if (pattern.kind === "micro_story_twist") {
    return `A surprising ${strategy.niche} moment makes ${product} feel useful before the viewer realizes it is an ad.`;
  }
  if (pattern.kind === "proof_diary") {
    return `KOL starts with a believable baseline, then lets ${product} earn attention through repeated proof moments.`;
  }
  return `${pattern.hookMechanic} for ${product}: ${strategy.audienceNicheIntelligence.hookAngle}.`;
}

function creatorDirectionFor(
  pattern: ShortCreativePattern,
  input: ShortCreativePatternLearningInput,
  product: string
): string {
  const tone = cleanText(input.brandKitEvaluation?.tone, 120) ?? input.strategy.audienceNicheIntelligence.trendPosture;
  return `${pattern.creatorOrKolRole}; use ${tone} delivery; make ${product} and the reviewed proof the center, not the source reference.`;
}

function productionNotesFor(pattern: ShortCreativePattern, input: ShortCreativePatternLearningInput): readonly string[] {
  return uniqueClean([
    `Target ${Math.round(input.durationSeconds)}s with ${Math.max(3, input.scenes.length)} visible beat changes.`,
    pattern.retentionMechanic,
    pattern.payoffMechanic,
    input.referenceVideoPattern ? `Reference ${input.referenceVideoPattern.patternId} is structure-only guidance.` : undefined,
    "Keep no-visible-text policy unless operator explicitly changes review policy."
  ], 6, 200);
}

function scoreCandidate(
  pattern: ShortCreativePattern,
  input: ShortCreativePatternLearningInput,
  prompt: string,
  sceneArc: readonly string[]
): ShortCreativeIdeaScore {
  const copyRisk = hasCopyRiskIntent(prompt) || input.referenceVideoPattern?.safetyStatus === "review_required";
  const highRiskClaim = HIGH_RISK_CLAIM_PATTERN.test(prompt) ||
    Boolean(input.productBrief?.claimInventory.some((claim) => HIGH_RISK_CLAIM_PATTERN.test(claim.text) || claim.substantiationRequired));
  const hookPotential = clampScore(0.62 +
    (input.strategy.platformFocus === "tiktok_douyin" ? 0.1 : 0.04) +
    (pattern.source === "reference_video" || pattern.source === "prompt_signal" || pattern.source === "seedance_prompt_corpus" ? 0.08 : 0) +
    (pattern.source === "platform_template_corpus" ? 0.07 : 0) +
    (pattern.kind === "proof_diary" || pattern.kind === "micro_story_twist" ? 0.06 : 0));
  const retentionPotential = clampScore(0.6 +
    Math.min(0.14, sceneArc.length * 0.02) +
    (input.strategy.viralLevers.includes("visual_retention") ? 0.08 : 0) +
    (pattern.kind === "challenge_progress" || pattern.kind === "skeptical_review" ? 0.05 : 0));
  const nicheFit = clampScore(0.52 +
    (pattern.nicheTags.join(" ").includes(input.strategy.niche) ? 0.24 : 0.08) +
    (pattern.source === "seedance_prompt_corpus" ? 0.1 : 0) +
    (pattern.source === "platform_template_corpus" ? 0.09 : 0) +
    (pattern.source === "prompt_signal" ? 0.08 : 0) +
    (input.productBrief ? 0.08 : 0));
  const proofFeasibility = clampScore(0.54 +
    (input.productBrief?.benefits.length ? 0.16 : 0) +
    (input.productBrief?.claimInventory.length ? 0.08 : 0) +
    (/proof|evidence|demo|visible|texture|workflow|test/i.test(pattern.proofDevice) ? 0.08 : 0) -
    (highRiskClaim ? 0.12 : 0));
  const brandSafety = clampScore(input.brandKitEvaluation?.status === "blocked"
    ? 0.18
    : input.brandKitEvaluation?.status === "review_required"
      ? 0.58
      : 0.78 - (highRiskClaim ? 0.08 : 0));
  const novelty = clampScore(0.58 +
    (pattern.source === "prompt_signal" ? 0.12 : 0) +
    (pattern.source === "seedance_prompt_corpus" ? 0.1 : 0) +
    (pattern.source === "platform_template_corpus" ? 0.09 : 0) +
    (pattern.kind === "micro_story_twist" || pattern.kind === "hidden_detail_reveal" ? 0.1 : 0) +
    (input.concepts.length >= 3 ? 0.04 : 0));
  const renderability = clampScore(0.7 +
    (input.scenes.length >= 3 && input.scenes.length <= 6 ? 0.1 : 0) +
    (input.durationSeconds <= 45 ? 0.06 : 0) -
    (pattern.kind === "proof_diary" && input.durationSeconds < 20 ? 0.08 : 0));
  const nonCloneSafety = clampScore(input.referenceVideoPattern?.safetyStatus === "blocked"
    ? 0.08
    : copyRisk
      ? 0.56
      : pattern.source === "reference_video"
        ? 0.74
        : 0.88);
  const totalScore = clampScore(
    hookPotential * 0.18 +
    retentionPotential * 0.16 +
    nicheFit * 0.14 +
    proofFeasibility * 0.14 +
    brandSafety * 0.12 +
    novelty * 0.1 +
    renderability * 0.08 +
    nonCloneSafety * 0.08
  );
  return {
    hookPotential,
    retentionPotential,
    nicheFit,
    proofFeasibility,
    brandSafety,
    novelty,
    renderability,
    nonCloneSafety,
    totalScore
  };
}

function scoreReasons(
  pattern: ShortCreativePattern,
  input: ShortCreativePatternLearningInput,
  score: ShortCreativeIdeaScore
): readonly string[] {
  return uniqueClean([
    `${pattern.source} pattern fits ${input.strategy.niche}`,
    `total=${score.totalScore}; hook=${score.hookPotential}; retention=${score.retentionPotential}; nonClone=${score.nonCloneSafety}`,
    input.referenceVideoPattern ? "learns reference structure only and replaces script/assets/KOL/product" : "generated from audience/niche and prompt signals",
    input.productBrief ? "has product evidence for proof planning" : "needs product evidence before paid render"
  ], 5, 180);
}

function proofAnchorFor(productBrief: ProductUrlBrief | undefined, strategy: ShortViralNicheStrategy): string {
  const firstClaim = cleanText(productBrief?.claimInventory[0]?.text, 160);
  if (firstClaim) return firstClaim;
  const firstBenefit = cleanText(productBrief?.benefits[0], 160);
  if (firstBenefit) return firstBenefit;
  return strategy.audienceNicheIntelligence.proofStrategy;
}

function productLabel(productBrief: ProductUrlBrief | undefined, niche: string): string {
  return cleanText(productBrief?.title, 80) ?? niche.replace(/_/g, " ");
}

function originalityGuardrails(
  source: ShortCreativePatternSource,
  reference: ShortReferenceVideoPattern | undefined
): readonly string[] {
  return uniqueClean([
    "learn hook mechanics, pacing, proof device, retention rhythm, and payoff logic only",
    "do not copy script wording, creator face, brand marks, edit sequence, music, captions, private assets, or unreviewed claims",
    "replace the KOL, product, setting, evidence, narration, and scene actions with user-approved material",
    source === "reference_video" && reference ? `reference ${reference.patternId} remains structure-only evidence` : undefined,
    "flag close similarity for human review before render spend"
  ], 6, 220);
}

function riskControlsFor(input: ShortCreativePatternLearningInput, prompt: string): readonly string[] {
  return uniqueClean([
    hasCopyRiskIntent(prompt) || input.referenceVideoPattern?.safetyStatus === "review_required"
      ? "copy-risk review: structure-only adaptation required"
      : undefined,
    input.productBrief?.claimInventory.some((claim) => claim.substantiationRequired)
      ? "claim review required before render"
      : undefined,
    input.brandKitEvaluation?.status === "blocked"
      ? "brand-kit block must be resolved before render"
      : undefined,
    "no visible captions, labels, CTA cards, fake UI text, or unsupported superlatives"
  ], 6, 180);
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

function clampScore(value: number): number {
  return round(Math.max(0, Math.min(1, value)));
}

function round(value: number): number {
  return Number(value.toFixed(2));
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
