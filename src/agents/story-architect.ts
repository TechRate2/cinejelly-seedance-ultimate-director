/**
 * Story Architect uses the configured LLM provider to build a structured scene/beat plan.
 * It asks for universal production primitives instead of niche templates.
 */

import type { LlmProvider } from "../providers/contracts.js";
import type { IntakeResult, StoryPlan } from "../types/agent.js";
import type { ContinuityRisk } from "../types/prompt.js";
import type { SourceVideoDeconstruction } from "../types/source-video.js";
import type { BeatPlan, ScenePlan } from "../core/shot-planner.js";
import { USER_SCRIPT_OPEN_MARKER } from "../core/simple-brief-resolver.js";
import { nichePlaybookDirective, SEEDANCE_MASTERY_DIRECTIVE } from "../core/niche-playbooks.js";
import { antiSlopDirective } from "../core/anti-slop-lexicon.js";
import { CustomerActionableError } from "../core/customer-actionable-error.js";
import { explicitStyleTagRegister, isStyleRegister, registerForCreativeMode } from "../core/register-grammar.js";
import { capToSpeakableWords, countSpeechUnits, TALKING_WORDS_PER_SECOND } from "../core/duration-scripting.js";
import { MAX_CLIP_SECONDS } from "../core/chunking.js";
import type { StyleDna, StyleRegister } from "../types/prompt.js";

/**
 * Detect a pasted, already-written script inside free-form user input so the planner can
 * switch to script-first mode. Explicit marker wins; otherwise a conservative heuristic:
 * several lines that look like scene headings, dialogue, or numbered shots.
 */
export function looksLikeUserScript(userInput: string): boolean {
  if (userInput.includes(USER_SCRIPT_OPEN_MARKER)) {
    return true;
  }
  const lines = userInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 4) {
    return false;
  }
  const scriptLike = lines.filter(
    (line) =>
      /^(INT\.|EXT\.|SCENE\b|CẢNH\b|SHOT\b|\d+[.)]\s)/iu.test(line) ||
      /^[\p{Lu}][\p{L} .'-]{1,30}:\s/u.test(line) ||
      /^\[\d{1,2}:?\d{0,2}\s*[-–]\s*\d{1,2}:?\d{0,2}s?\]/u.test(line)
  );
  return scriptLike.length >= 3;
}

/**
 * The ONE predicate for "the customer supplied a finished script" — shared by the plan directive,
 * the single-clip merge, and the enhancer gate so the three sites can never drift apart
 * (adversarial-audit #6: the predicate had been re-derived in three places). Accepts the metadata
 * flag as either the string "true" (short-pipeline route stringifies metadata) or a raw boolean
 * (the direct render route passes JSON metadata through untyped — adversarial-audit #4: a literal
 * `true` used to silently disable the verbatim guarantee).
 */
export function isScriptFirstRequest(userInput: string, metadata: IntakeResult["metadata"] | undefined): boolean {
  const flag = metadata?.scriptFirst as unknown;
  return looksLikeUserScript(userInput) || flag === "true" || flag === true;
}

const SCRIPT_FIRST_DIRECTIVE =
  "SCRIPT-FIRST MODE: the user input contains a finished script. Treat it as the authoritative screenplay: keep its scene order, events, and any dialogue/narration lines VERBATIM in their original language (do not rewrite, translate, paraphrase, or invent new lines). Put each beat's exact spoken dialogue/narration line into that beat's `spokenLine` field word-for-word (leave `spokenLine` empty for beats with no spoken line); use `action` only for the visual staging, never to paraphrase the spoken line. Your job is only to decompose the script into scenes/beats with timing and to design the visual staging (subject state, camera, lighting, audio rhythm) around the user's own lines.";

/**
 * Hard language contract (final-upgrade design, mined from real paid-run artifacts): visual fields in
 * English (video models follow English direction most reliably), spoken lines ONLY in the user's
 * language with full diacritics and natural SPOKEN register — the split that previously happened by
 * accident is now law. Vietnamese-specific spoken markers included because it is the primary market.
 */
export const LANGUAGE_CONTRACT_DIRECTIVE =
  "LANGUAGE CONTRACT (obey exactly): Write EVERY visual and production field — premise, title, purpose, action, subject, camera, lighting, style, audioIntent, and all continuity values — in ENGLISH, because the video model follows English direction most reliably. Write each beat's `spokenLine` ONLY in the user's language (the language of the user's brief or pasted script), reproduced with FULL correct diacritics and natural spoken punctuation; never translate, romanize, or strip diacritics from it. Write spoken lines the way a real person TALKS to a phone camera, not the way text is WRITTEN: short breathing clauses, everyday words, natural sentence-final particles. For Vietnamese use spoken markers (nhé, nha, đấy, đó, luôn, á, ạ, mà, thôi), relationship-correct casual pronouns (mình/tớ/cậu; chị/em, anh/em — not the flat written tôi/bạn), and real spoken openers (Ôi, Ơ, Trời ơi). Stiff written-formal sentences read as AI instantly — forbidden. CONCRETE EXAMPLE — FORBIDDEN (written/stiff, reads as AI subtitle): \"Tôi rất thích sản phẩm này vì nó rất hiệu quả và tiện lợi.\" REQUIRED (spoken/alive, a real person to their phone): \"Ôi cái này mình xài mê luôn á, tiện dã man ý.\" Every spoken line must pass this bar: if it could be a written product description, rewrite it until it sounds like a friend talking.";

/**
 * Scriptwriting craft law (mined from ViMax/micro-drama screenwriter prompts, SkyReels expression
 * grammar, and the top community Seedance prompts): the difference between an alive script and a
 * stiff one is one visible emotional turn per beat, physical tells instead of named emotions, and
 * dialogue with subtext. Register-aware so one engine serves cinematic AND phone-KOL output.
 */
export const SCRIPT_CRAFT_DIRECTIVE =
  "You are a professional screenwriter, not a shot-list generator. REGISTER — pick ONE writing voice for the whole video and never mix: professional_cinematic (composed performances, motivated blocking, designed light, restrained dialogue with subtext, one deliberate camera move per beat — the craft is invisible) or natural_phone_kol (a real person talking to their own phone — selfie framing, genuine micro-shake, in-camera sound, filler words and self-interruption in speech, no scored music, no grade, no slow-motion — it must look UN-crafted, like a friend's clip). If not told, infer: review/testimonial/how-to/vlog -> natural_phone_kol; story/brand-film/drama/product-hero -> professional_cinematic. ONE-TURN RULE: every beat carries exactly ONE visible emotional or situational turn (state A -> state B the viewer can SEE); write it into the beat's `emotionalTurn` field (e.g. \"skeptical -> quietly impressed\"), and each beat must pick up the emotional state the previous beat ended on so the whole video traces one feeling, not a montage. SHOW DON'T TELL: never name an emotion in `action` — convert it to a physical tell (not \"she is angry\" but \"she clenches her fist, nails digging into her palm\"; not \"surprised\" but \"a 0.3s freeze, then her eyes widen\"). No metaphors or similes in action/camera — write only what the lens physically sees. DIALOGUE: spoken lines are real speech — one breath long, subtext over statement (a character says less than they mean), never brochure copy, never a feature list; micro-pauses and self-corrections are welcome.";

/**
 * Hook + flow law (mined from short-form retention research: hook-rate studies, the But/Therefore
 * rule, loop-bait structure, and documented AI-text tells). Small, hard, checkable rules — the
 * difference between a scroll-past and a watch-through is decided in the first line and the joins.
 */
export const HOOK_AND_FLOW_DIRECTIVE =
  "HOOK LAW (first beat): the first spoken line is AT MOST 14 words, lands inside the first 1.5 seconds, and contains something CONCRETE — a number, a named result, a direct question, or a visible contradiction; never open with greetings, self-introductions, or context-setting (\"xin chào mọi người, hôm nay...\" is forbidden — start mid-value). OPEN-LOOP RULE (mined from short-form retention data): the hook must OPEN a curiosity gap it does not immediately close — promise or tease the payoff without revealing it, so the viewer must keep watching to resolve it; the concrete detail sets the stakes, it must NOT give away the ending. The PAYOFF beat then discharges exactly that promise (the loop the hook opened is the loop the ending closes) — a hook that answers itself in the first line kills retention. RETENTION SPINE (mined from short-form virality teardowns): plan a labeled emotional curve across the runtime (e.g. curiosity -> surprise -> trust -> desire -> payoff) and place a deliberate PATTERN-INTERRUPT around the one-third mark — a visible twist, a fresh angle/prop, a contrast, or a raised stake — right where viewers drop off, so the middle never sags into repeated proof shots. FLOW SPINE: connect beats with BUT or THEREFORE logic (a complication or a consequence), never \"and then\" chaining — if two adjacent beats could swap order without anyone noticing, rewrite one of them. LOOP ENDING: when the format allows, let the final frame or final line answer or mirror the hook so the video invites an instant rewatch. AI-TEXT TELLS (forbidden in every language): forced rule-of-three lists, the \"không chỉ X mà còn Y / not just X but Y\" parallelism, buzzwords (nâng tầm, tối ưu, trải nghiệm đỉnh cao, giải pháp hoàn hảo, elevate, seamless, game-changer), and any sentence a real person would never SAY out loud — read every spoken line aloud in your head; if it sounds like ad copy, rewrite it shorter and more direct.";

interface StoryPlanJson {
  readonly premise: string;
  readonly targetDurationSeconds: number;
  readonly register?: unknown;
  readonly scenes: readonly unknown[];
  readonly episodeSummary?: unknown;
  readonly episodeEndState?: unknown;
  readonly cliffhanger?: unknown;
  readonly cast?: unknown;
}

const KNOWN_RISKS = new Set<string>([
  "face",
  "product_logo",
  "wardrobe",
  "environment",
  "physics",
  "text",
  "multi_character_blocking",
  "audio_sync",
  "transition"
]);
const MIN_BEAT_DURATION_SECONDS = 4;
// Talking (avatar) beats are speech-bound: the OmniHuman clip lasts exactly its TTS line, so a
// talking video's runtime = total spoken words / speech-rate. A phone-KOL line is naturally short
// (~2-2.5s), so talking beats need a LOWER floor than b-roll — otherwise the 4s floor caps an 18s
// video at 4 beats (floor(18/4)) and it can never hold enough short lines to fill the runtime
// (paid-acceptance forensics 2026-07-26: 18s ordered rendered 7.3s). VN ElevenLabs measured ≈4
// words/sec.
const TALKING_MIN_BEAT_DURATION_SECONDS = 2;
// Not a whitespace split: Chinese and Japanese are written without spaces, so a whole sentence
// counted as one word and every CJK talking plan was scheduled at a fraction of its real length.
const countWords = (text: string): number => countSpeechUnits(text);

const STORY_PLAN_SCHEMA = {
  type: "object",
  required: ["premise", "targetDurationSeconds", "scenes"],
  properties: {
    premise: { type: "string" },
    targetDurationSeconds: { type: "number" },
    register: { type: "string", enum: ["professional_cinematic", "natural_phone_kol"] },
    episodeSummary: { type: "string" },
    episodeEndState: { type: "string" },
    cliffhanger: { type: "string" },
    cast: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "appearance"],
        properties: {
          label: { type: "string" },
          appearance: { type: "string" }
        }
      }
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        required: ["sceneId", "title", "beats"],
        properties: {
          sceneId: { type: "string" },
          title: { type: "string" },
          beats: {
            type: "array",
            items: {
              type: "object",
              required: ["beatId", "purpose", "action", "subject", "camera", "lighting", "durationSeconds"],
              properties: {
                beatId: { type: "string" },
                purpose: { type: "string" },
                action: { type: "string" },
                subject: { type: "string" },
                camera: { type: "string" },
                lighting: { type: "string" },
                style: { type: "string" },
                audioIntent: { type: "string" },
                spokenLine: { type: "string" },
                emotionalTurn: { type: "string" },
                styleDna: {
                  type: "object",
                  properties: {
                    optics: { type: "string" },
                    lighting: { type: "string" },
                    palette: { type: "string" },
                    motion: { type: "string" },
                    performance: { type: "string" },
                    audioFeel: { type: "string" },
                    moodWords: { type: "array", items: { type: "string" } },
                    avoid: { type: "array", items: { type: "string" } }
                  }
                },
                durationSeconds: { type: "number" },
                risks: { type: "array", items: { type: "string" } },
                identity: { type: "string" },
                product: { type: "string" },
                environment: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

export class StoryArchitect {
  private readonly llmProvider: LlmProvider;
  private readonly modelId: string;

  public constructor(llmProvider: LlmProvider, modelId: string) {
    this.llmProvider = llmProvider;
    this.modelId = modelId;
  }

  public async plan(intake: IntakeResult, signal?: AbortSignal): Promise<StoryPlan> {
    // Script-time niche intelligence: the matching content-family playbook (mined from the
    // proven Seedance prompt corpus) plus cross-family mastery rules become part of the
    // planning instruction, so scripts are born with the winning hook/beats/audio/reference
    // strategy for their niche instead of a generic arc.
    const registerHint = this.resolvedRegisterHint(intake);
    const playbookDirective = nichePlaybookDirective({
      // Feed the KNOWN metadata niche key FIRST so a fixed family (e.g. beauty_skincare ->
      // commercial_product) still matches its proven playbook; the analyst's free-text niche is only
      // the fallback and the CUSTOM playbook (composed from creativeIntent) fires only when neither
      // the metadata niche key nor the creativeMode resolves a fixed family (cross-audit LOW #2).
      ...(intake.metadata?.shortViralNiche ?? intake.metadata?.niche ?? intake.creativeIntent?.niche
        ? { niche: (intake.metadata?.shortViralNiche ?? intake.metadata?.niche ?? intake.creativeIntent?.niche) as string }
        : {}),
      ...(intake.metadata?.shortViralCreativeMode ?? intake.metadata?.creativeMode
        ? { creativeMode: (intake.metadata.shortViralCreativeMode ?? intake.metadata.creativeMode) as string }
        : {}),
      ...(intake.creativeIntent ? { creativeIntent: intake.creativeIntent } : {}),
      // The RESOLVED register so the playbook can't contradict it (cross-audit A1): an explicit
      // [style:X] tag or the analyst's register wins, else derive it from the creative mode.
      ...(registerHint ? { register: registerHint } : {})
    });
    // One predicate drives BOTH the script-first directive and its precedence override so the
    // pair can never drift apart (they are meaningless without each other).
    const scriptFirstMode = isScriptFirstRequest(intake.userInput, intake.metadata);
    // Long-form beat-density floor (cross-audit B4): the render layer chunks every beat into 4-15s
    // clips, so a long video with too FEW authored beats survives (it renders) but reads as a stretched
    // short — the same 3 actions tiled across 4 minutes. Give the writer a deterministic beat-count
    // target scaled to the runtime (no beat may own more than ~15s of screen time) so long-form gets a
    // genuinely rich arc, not a padded one. Gated to true long-form (>45s); shorts keep their tight
    // hook/proof/payoff structure already spelled out below.
    const durationDensityGuidance = this.longFormBeatDensityGuidance(intake.settings.durationTargetSeconds);
    // Talking-video beat-count floor: an avatar clip lasts only its spoken line (~2-2.5s), so an
    // 18s talking video needs ~7-8 short-line beats to fill the runtime — NOT 3 long beats. This is
    // the reliable lever (the economy LLM writes many short lines happily) that the "write longer
    // lines" law could not force. Deterministically enforced after the plan too (continuation loop
    // + capacity), but stating it up front makes the first pass land close.
    const talkingDensityGuidance = this.talkingBeatDensityGuidance(
      intake.settings.durationTargetSeconds,
      this.isTalkingDominatedPlan(intake, registerHint)
    );
    const response = await this.llmProvider.structured<StoryPlanJson, typeof STORY_PLAN_SCHEMA>(
      {
        modelId: this.modelId,
        instruction:
          "Create a production-ready video scene plan. Use reusable production primitives, not hardcoded niche templates. Allocate the full requested duration into a complete beginning, middle, and ending: short commercial inputs need hook/problem, proof/demo, and payoff/soft next-step; long-form inputs need setup, development, proof escalation, and resolved close. Every beat must include a concrete visible state change, timed audio intent when audio is enabled, and an endpoint that the next beat can continue without a visible jump cut. " +
          durationDensityGuidance +
          talkingDensityGuidance +
          `${playbookDirective} ${SEEDANCE_MASTERY_DIRECTIVE} ${antiSlopDirective()}`,
        schema: STORY_PLAN_SCHEMA,
        messages: [
          {
            role: "system",
            content:
              (scriptFirstMode ? `${SCRIPT_FIRST_DIRECTIVE} ` : "") +
              `${SCRIPT_CRAFT_DIRECTIVE} ${LANGUAGE_CONTRACT_DIRECTIVE} ${HOOK_AND_FLOW_DIRECTIVE} ` +
              // Script-first precedence (audit #4): without this line, the language contract's
              // "rewrite spoken lines as natural speech with particles" instruction collides with
              // the verbatim mandate in the same system prompt and the model picks unpredictably.
              (scriptFirstMode
                ? "PRECEDENCE: SCRIPT-FIRST MODE overrides every spoken-line rewriting rule above — the user's own dialogue/narration lines go into `spokenLine` VERBATIM (no added particles, no re-punctuation, no naturalization, no shortening); the LANGUAGE CONTRACT's and DIALOGUE craft's rewrite guidance applies ONLY to beats where the user wrote no line. "
                : "") +
              (typeof intake.metadata?.seriesId === "string" && intake.metadata.seriesId.trim()
                ? "SERIES MODE: this is one episode of an ongoing series. Also return three top-level fields the next episode is written from: `episodeSummary` (2-3 sentences of what visibly happened this episode), `episodeEndState` (the exact visible state at the final frame — who is where, holding what, feeling what), and `cliffhanger` (the unresolved hook, empty string if this episode resolves). Honor any PREVIOUSLY-ON recap in the brief: continue those facts exactly, never contradict or re-introduce established characters. "
                : "") +
              (intake.creativeIntent
                ? `CREATIVE INTENT (decided by the brief analyst — obey it): register=${intake.creativeIntent.register}; spoken language=${intake.creativeIntent.language}; tone=${intake.creativeIntent.tone}; pacing=${intake.creativeIntent.pacingProfile}. Visual world: ${intake.creativeIntent.visualWorld}. Story engine — conflict: ${intake.creativeIntent.storyEngine.conflict}; stakes: ${intake.creativeIntent.storyEngine.stakes}; payoff: ${intake.creativeIntent.storyEngine.payoff}. Emotional arc to trace across the beats: ${intake.creativeIntent.emotionArc}. The hook must open on the conflict/stakes; the ending must land the payoff. `
                : "") +
              // Style coherence (audit): the analyst already decided a whole-video look; show it to the
              // scriptwriter as a BIBLE to specialize, instead of letting the writer re-invent style
              // blind and contradict it (the two LLM stages must produce ONE coherent look).
              (intake.creativeIntent?.styleDna
                ? `STYLE BIBLE (from the brief analyst — the whole video's look; each beat's styleDna must SPECIALIZE this for that moment, never contradict it): ${[
                    intake.creativeIntent.styleDna.optics ? `optics=${intake.creativeIntent.styleDna.optics}` : undefined,
                    intake.creativeIntent.styleDna.lighting ? `lighting=${intake.creativeIntent.styleDna.lighting}` : undefined,
                    intake.creativeIntent.styleDna.palette ? `palette=${intake.creativeIntent.styleDna.palette}` : undefined,
                    intake.creativeIntent.styleDna.motion ? `motion=${intake.creativeIntent.styleDna.motion}` : undefined,
                    intake.creativeIntent.styleDna.performance ? `performance=${intake.creativeIntent.styleDna.performance}` : undefined,
                    intake.creativeIntent.styleDna.audioFeel ? `audioFeel=${intake.creativeIntent.styleDna.audioFeel}` : undefined
                  ].filter(Boolean).join("; ")}. `
                : "") +
              // Per-character appearance sheet (audit HIGH: invented faces were built from the scene
              // line and drifted/looked generic). Force a real face description per character so the
              // identity anchor portrait has a clean, specific source of truth.
              "CAST APPEARANCE: return a top-level `cast` array — one entry per DISTINCT character (same labels you use in beat `identity`), each { label, appearance } where `appearance` is a SHORT concrete FACE/BODY sheet in English built from STABLE, LOW-FREQUENCY identity features the image and avatar models can hold constant across shots: ethnicity, age range, face shape, hairstyle/hairline/hair colour, brow and eye shape, build, and signature wardrobe (state the exact garment + colour so it stays fixed). AVOID tiny high-frequency spot features (moles, beauty marks, freckles, small scars) unless you pin an EXACT anchored location — such marks drift between shots and read as an inconsistent face, so prefer NOT to invent them. e.g. { label: \"Linh\", appearance: \"Vietnamese woman, late 20s, oval face, straight shoulder-length black hair with a centre part, soft rounded brows, warm dark eyes, slim build, fixed outfit: cream ribbed knit sweater\" }. Describe the FACE, HAIR, and WARDROBE only, never the scene or props. This is the single source of truth that keeps each face AND outfit identical across every shot; be specific enough that the same person in the same clothes is unmistakable. " +
              "STYLE DNA: return your chosen register in the top-level `register` field, and for each beat author `styleDna` — SHORT concrete niche specifics for optics, lighting, palette, motion, performance, and audioFeel (e.g. macro serum-on-skin glisten for beauty; fabric drape in motion for fashion). This is where ALL category detail lives — physical, camera-real wording only (the anti-slop directive's banned-booster list applies here). " +
              "You are CineJelly's Story Architect. Return JSON only. Each scene must contain beats with beatId, purpose, action, subject, camera, lighting, durationSeconds, risks, references, continuity, and audioIntent when audio is not none. For 15-60s short videos, do not waste the duration on repeated static product macro shots: the plan must include an opening hook/problem, a middle demo/proof action, and an ending payoff/result or soft next-step implication. For longer videos, avoid a loose montage: each section must advance the argument, proof, emotion, or product understanding. Make every action concrete enough to film: visible subject state, physical product contact or proof action, camera movement, audio rhythm, and an endpoint that can cut or crossfade into the next beat. SPOKEN-LINE DURATION LAW (two-sided — paid-acceptance forensics 2026-07-26): real speech runs about 4 words per second (Vietnamese TTS measured ~4/s), and on talking shots THE CLIP LASTS EXACTLY AS LONG AS THE LINE — so EVERY beat with a spokenLine must both FIT and FILL its duration: a 4-5s talking beat needs a 16-22 word line, a 3s beat 11-13 words. Write within ±15% of (beatSeconds × 4) words; an 8-word line on a 4.5s beat leaves the clip ending at ~2s and the whole video collapsing far short of the customer's ordered duration. The `references` array lists every uploaded asset the user supplied, each with its role (identity=a specific character, product, environment, wardrobe, voice, style) and label; treat it as the cast and prop roster. Deliberately schedule these across beats — set each beat's continuity.identity/product/environment to the matching reference label so a distinct character enters/leaves on purpose (e.g. character A in the opening beats, character B enters at the turn) and the hero product is bound to the beats where it must appear; never merge two identity references into one character. Give EACH distinct character (including invented ones with no uploaded reference) a SHORT STABLE label — a name or role such as \"Linh\" or \"the founder\" — and set every beat's `identity` to that EXACT same label for every beat the character appears in. Never describe the same recurring person with two different identity strings (e.g. \"young woman\" in one beat and \"the girl\" in another); reuse the one label verbatim, so the pipeline recognizes it as one person and keeps their face consistent across shots. When a beat features SEVERAL characters, list their labels separated by commas (e.g. identity: \"Linh, Mai\") — never invent a combined name; each listed person keeps their own locked face. If sourceVideoAnalysis is present, use it only for original pacing, structure, camera grammar, and style transformation; do not copy exact shots, transcript wording, likenesses, logos, or protected expression."
          },
          {
            role: "user",
            content: JSON.stringify({
              userInput: intake.userInput,
              settings: intake.settings,
              // Surface the reference ROSTER (role + label), not just a count, so the planner can
              // deliberately cast distinct identities/products/environments across beats instead of
              // planning blind (final-audit gap #4). Bounded to keep the payload small.
              references: intake.references
                .slice(0, 24)
                .map((reference) => ({ role: reference.role, label: reference.label })),
              referenceCount: intake.references.length,
              ...(intake.creativeIntent
                ? {
                    creativeIntent: {
                      register: intake.creativeIntent.register,
                      genre: intake.creativeIntent.genre,
                      niche: intake.creativeIntent.niche,
                      audience: intake.creativeIntent.audience,
                      language: intake.creativeIntent.language,
                      tone: intake.creativeIntent.tone,
                      emotionArc: intake.creativeIntent.emotionArc,
                      pacingProfile: intake.creativeIntent.pacingProfile,
                      visualWorld: intake.creativeIntent.visualWorld,
                      storyEngine: intake.creativeIntent.storyEngine
                    }
                  }
                : {}),
              ...(intake.sourceVideoAnalysis ? { sourceVideoAnalysis: this.sourceVideoBrief(intake.sourceVideoAnalysis) } : {})
            })
          }
        ],
        metadata: {
          ...(intake.metadata ?? {}),
          projectId: intake.projectId,
          graphNodeId: "story_plan"
        }
      },
      signal
    );

    const longCompleted = await this.continueLongPlanIfTruncated(response.value, intake, signal);
    const talkingCompleted = await this.continueTalkingPlanIfShort(longCompleted, intake, registerHint, signal);
    return this.coerceStoryPlan(talkingCompleted, intake);
  }

  /**
   * Deterministic teeth for talking-video duration (paid-acceptance forensics): an avatar clip lasts
   * only its spoken line, so the delivered runtime ≈ total spoken words / 4. Measure the scheduled
   * speech of the LLM's plan; if it covers less than 85% of the ordered duration, issue ONE bounded
   * continuation asking for enough extra short talking beats to cover the missing seconds — and merge
   * only unseen sceneIds (echo = no-op). This is what the prompt-only "write longer lines" law could
   * not guarantee: it MEASURES the result and re-drives, instead of asking-and-hoping. Fail-open: any
   * error leaves the plan as-is (a short talking video still renders; the delivery gate handles the
   * residual). Skips script-first (verbatim customer lines are not ours to pad).
   */
  private async continueTalkingPlanIfShort(
    value: StoryPlanJson,
    intake: IntakeResult,
    register?: StyleRegister,
    signal?: AbortSignal
  ): Promise<StoryPlanJson> {
    const duration = intake.settings.durationTargetSeconds;
    if (
      !this.isTalkingDominatedPlan(intake, register) ||
      isScriptFirstRequest(intake.userInput, intake.metadata) ||
      !Number.isFinite(duration) || duration < 8 || duration > 45 ||
      !Array.isArray(value.scenes)
    ) {
      return value;
    }
    const rawScenes = value.scenes as readonly Record<string, unknown>[];
    const spokenWords = rawScenes
      .flatMap((scene) => (Array.isArray(scene?.beats) ? (scene.beats as readonly Record<string, unknown>[]) : []))
      .reduce((sum, beat) => sum + (typeof beat?.spokenLine === "string" ? countWords(beat.spokenLine) : 0), 0);
    const scheduledSpeechSeconds = spokenWords / TALKING_WORDS_PER_SECOND;
    // Trigger ABOVE the delivery gate's short-block tolerance (adversarial-audit F2): the gate blocks
    // a delivered talking video shorter than ~90% of the ordered duration (DURATION_SHORT_BLOCK_
    // TOLERANCE 0.10). A 0.85 trigger left a dead-zone — a plan measuring 86-89% of target got NO
    // top-up yet failed delivery after the paid render. Fire at <92% so anything that would fail
    // delivery gets a top-up attempt first.
    if (spokenWords === 0 || scheduledSpeechSeconds >= duration * 0.92) {
      return value;
    }
    const missingSeconds = Math.max(2, Math.round(duration - scheduledSpeechSeconds));
    const extraBeats = Math.max(1, Math.ceil(missingSeconds / 2.5));
    try {
      const summary = rawScenes
        .flatMap((scene) => (Array.isArray(scene?.beats) ? (scene.beats as readonly Record<string, unknown>[]) : []))
        .map((beat, index) => `${index + 1}. ${typeof beat?.spokenLine === "string" ? beat.spokenLine.slice(0, 80) : "(no line)"}`)
        .join("\n")
        .slice(0, 1_500);
      const existingSceneCount = rawScenes.length;
      const response = await this.llmProvider.structured<StoryPlanJson, typeof STORY_PLAN_SCHEMA>(
        {
          modelId: this.modelId,
          instruction:
            `EXTEND a talking-head video plan that is too SHORT. The person's clip lasts only their spoken line, so the current plan only fills ~${Math.round(scheduledSpeechSeconds)}s of the ordered ${duration}s. Add ${extraBeats} NEW talking beats in NEW scenes (sceneIds numbered after the existing ${existingSceneCount}), each with its own natural spoken sentence (~8-11 words, ~4 words/second) continuing the SAME person and topic — do NOT repeat lines already written (listed below). Return ONLY the new scenes in the same JSON schema. ` +
            `${SEEDANCE_MASTERY_DIRECTIVE}`,
          schema: STORY_PLAN_SCHEMA,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                linesAlreadyWritten: summary,
                userInput: intake.userInput.slice(0, 1_200),
                settings: { durationTargetSeconds: duration }
              })
            }
          ],
          metadata: {
            ...(intake.metadata ?? {}),
            projectId: intake.projectId,
            graphNodeId: "story_plan_talking_extension"
          }
        },
        signal
      );
      const continuationScenes = Array.isArray(response.value?.scenes)
        ? (response.value.scenes as readonly Record<string, unknown>[])
        : [];
      const seenSceneIds = new Set(
        rawScenes.map((scene) => (typeof scene?.sceneId === "string" ? scene.sceneId : "")).filter(Boolean)
      );
      const freshScenes = continuationScenes.filter((scene) => {
        const sceneId = typeof scene?.sceneId === "string" ? scene.sceneId : "";
        const hasBeats = Array.isArray(scene?.beats) && scene.beats.length > 0;
        return hasBeats && (!sceneId || !seenSceneIds.has(sceneId));
      });
      if (freshScenes.length === 0) {
        return value;
      }
      return { ...value, scenes: [...rawScenes, ...freshScenes] as StoryPlanJson["scenes"] };
    } catch {
      return value;
    }
  }

  /**
   * Anti-truncation continuation for LONG plans (LocalMiniDrama pattern, repo-mining round 2): a
   * multi-minute request can come back with a fraction of the demanded beats (max-token cut or a
   * lazy model). One follow-up call asks the model to CONTINUE the same story from the last planned
   * beat — with a compact anti-duplication summary of everything already planned — and the merge
   * keeps only scenes with UNSEEN sceneIds, so an echo of the old scenes is a no-op. Bounded to one
   * continuation, fail-open on any error: a short plan still renders (chunking + normalize stretch
   * it), it just reads thin — so this is a quality rescue, never a blocker.
   */
  private async continueLongPlanIfTruncated(
    value: StoryPlanJson,
    intake: IntakeResult,
    signal?: AbortSignal
  ): Promise<StoryPlanJson> {
    const duration = intake.settings.durationTargetSeconds;
    if (!Number.isFinite(duration) || duration < 120 || !Array.isArray(value.scenes)) {
      return value;
    }
    const rawScenes = value.scenes as readonly Record<string, unknown>[];
    const rawBeatCount = rawScenes.reduce(
      (sum, scene) => sum + (Array.isArray(scene?.beats) ? scene.beats.length : 0),
      0
    );
    const minBeats = Math.ceil(duration / 12);
    if (rawBeatCount === 0 || rawBeatCount >= Math.ceil(minBeats / 2)) {
      return value;
    }
    try {
      const plannedSummary = rawScenes
        .flatMap((scene) => (Array.isArray(scene?.beats) ? (scene.beats as readonly Record<string, unknown>[]) : []))
        .map((beat, index) => {
          const purpose = typeof beat?.purpose === "string" ? beat.purpose : "beat";
          const action = typeof beat?.action === "string" ? beat.action.slice(0, 90) : "";
          return `${index + 1}. [${purpose}] ${action}`;
        })
        .join("\n")
        .slice(0, 2_000);
      const response = await this.llmProvider.structured<StoryPlanJson, typeof STORY_PLAN_SCHEMA>(
        {
          modelId: this.modelId,
          instruction:
            `CONTINUE an interrupted scene plan for a ${duration}s video. Beats 1-${rawBeatCount} are already planned (summary below) — do NOT repeat, rewrite, or re-title them. Continue the SAME story from beat ${rawBeatCount + 1}, adding roughly ${Math.max(2, minBeats - rawBeatCount)} NEW beats in NEW scenes (new sceneIds numbered after the existing ones) that develop and then resolve the story across the remaining runtime. Same JSON schema; return ONLY the new scenes. ` +
            `${SEEDANCE_MASTERY_DIRECTIVE}`,
          schema: STORY_PLAN_SCHEMA,
          messages: [
            {
              role: "user",
              content: JSON.stringify({
                alreadyPlannedBeats: plannedSummary,
                userInput: intake.userInput.slice(0, 1_500),
                settings: { durationTargetSeconds: duration }
              })
            }
          ],
          metadata: {
            ...(intake.metadata ?? {}),
            projectId: intake.projectId,
            graphNodeId: "story_plan_continuation"
          }
        },
        signal
      );
      const continuationScenes = Array.isArray(response.value?.scenes)
        ? (response.value.scenes as readonly Record<string, unknown>[])
        : [];
      const seenSceneIds = new Set(
        rawScenes.map((scene) => (typeof scene?.sceneId === "string" ? scene.sceneId : "")).filter(Boolean)
      );
      const freshScenes = continuationScenes.filter((scene) => {
        const sceneId = typeof scene?.sceneId === "string" ? scene.sceneId : "";
        const hasBeats = Array.isArray(scene?.beats) && scene.beats.length > 0;
        return hasBeats && (!sceneId || !seenSceneIds.has(sceneId));
      });
      if (freshScenes.length === 0) {
        return value;
      }
      return { ...value, scenes: [...rawScenes, ...freshScenes] as StoryPlanJson["scenes"] };
    } catch {
      return value;
    }
  }

  /**
   * The register used to keep the niche playbook from contradicting it (cross-audit A1), computed the
   * same way coerceStoryPlan resolves the final register: explicit [style:X] tag → analyst intent →
   * creative-mode map. Available at directive-build time (before the LLM authors its own register).
   */
  /**
   * Deterministic beat-count target for long-form so the LLM can't hand a multi-minute runtime just a
   * handful of beats (cross-audit B4). Floor = one beat per ~12s (no beat should own more than the 15s
   * render-clip ceiling), soft upper = one per ~7s (rich cutting without over-fragmenting). Empty for
   * ≤45s, where the tight hook/proof/payoff structure below already governs the beat count.
   */
  private longFormBeatDensityGuidance(durationTargetSeconds: number): string {
    if (!Number.isFinite(durationTargetSeconds) || durationTargetSeconds <= 45) {
      return "";
    }
    const minBeats = Math.ceil(durationTargetSeconds / 12);
    const softMaxBeats = Math.ceil(durationTargetSeconds / 7);
    // ≥120s must also arrive as ≥3 SCENES: the long-form review gate hard-requires three sequence
    // movements (setup/development/payoff), and until this line nothing ever TOLD the model that —
    // the job died pre-spend on LLM scene grouping (redundancy-audit R7).
    const sceneStructure = durationTargetSeconds >= 120
      ? `Group the beats into at least 3 scenes — a setup movement, a development movement, and a payoff movement — each scene a distinct location/phase of the story. `
      : "";
    return `LONG-FORM DENSITY: this is a ${durationTargetSeconds}s video — decompose it into at least ${minBeats} distinct beats (aim ${minBeats}-${softMaxBeats}), each a NEW visible action or story turn. ${sceneStructure}No single beat may carry more than ~15 seconds of screen time; if a stretch would run longer, split it into separate beats with fresh action so the video reads as a rich developing arc, never the same few shots stretched thin. `;
  }

  /**
   * Beat-count floor for TALKING videos (avatar/phone-KOL with audio): each avatar clip lasts only
   * its spoken line (~2-2.5s), so the runtime = total speech. An 18s talking video therefore needs
   * ~7-8 short-line beats, not 3 long ones. This works WITH the economy LLM's nature (it writes many
   * short natural lines happily) instead of against it (the "write longer lines" law it ignored).
   * Enforced deterministically after the plan by the capacity change + continuation loop; this line
   * makes the first pass land close. Empty when not talking-dominated.
   */
  private talkingBeatDensityGuidance(durationTargetSeconds: number, talkingDominated: boolean): string {
    if (!talkingDominated || !Number.isFinite(durationTargetSeconds) || durationTargetSeconds < 8) {
      return "";
    }
    const minBeats = Math.max(2, Math.ceil(durationTargetSeconds / 2.5));
    return `TALKING VIDEO DENSITY: this is a ${durationTargetSeconds}s spoken/talking-head video — the on-screen person's clip lasts only as long as their line, so to fill ${durationTargetSeconds} seconds you MUST write at least ${minBeats} short talking beats, each a complete natural spoken sentence (a real person talks ~4 words/second, so ~8-11 words per beat). Prefer MANY short beats over a few long ones; every beat carries its own spoken line. `;
  }

  /**
   * Deterministic backstop for the long-form review gate: a ≥120s plan that still arrived with
   * fewer than 3 scenes is REGROUPED in code — contiguous beats split into setup / development /
   * payoff movements, order untouched — instead of hard-failing the paid job on LLM scene grouping
   * (redundancy-audit R7: the gate demanded 3 sequences while nothing guaranteed them). The LLM is
   * also told the rule (density guidance), so this fires only when it disobeys; fewer than 3 beats
   * stays as-is (a degenerate plan should still surface, not be padded into fake structure).
   */
  private ensureLongFormSceneStructure(scenes: readonly ScenePlan[], intake: IntakeResult): readonly ScenePlan[] {
    if (intake.settings.durationTargetSeconds < 120 || scenes.length >= 3) {
      return scenes;
    }
    const beats = scenes.flatMap((scene) => scene.beats);
    if (beats.length < 3) {
      return scenes;
    }
    const third = Math.ceil(beats.length / 3);
    const movements: readonly { readonly sceneId: string; readonly title: string; readonly beats: readonly BeatPlan[] }[] = [
      { sceneId: "sequence_1_setup", title: "Setup", beats: beats.slice(0, third) },
      { sceneId: "sequence_2_development", title: "Development", beats: beats.slice(third, third * 2) },
      { sceneId: "sequence_3_payoff", title: "Payoff", beats: beats.slice(third * 2) }
    ];
    return movements
      .filter((movement) => movement.beats.length > 0)
      .map((movement) => ({ sceneId: movement.sceneId, title: movement.title, beats: movement.beats }));
  }

  private resolvedRegisterHint(intake: IntakeResult): StyleRegister | undefined {
    const explicit = explicitStyleTagRegister(intake.userInput);
    if (explicit) {
      return explicit;
    }
    if (intake.creativeIntent?.register && isStyleRegister(intake.creativeIntent.register)) {
      return intake.creativeIntent.register;
    }
    const creativeMode = typeof intake.metadata?.shortViralCreativeMode === "string"
      ? intake.metadata.shortViralCreativeMode
      : typeof intake.metadata?.creativeMode === "string" ? intake.metadata.creativeMode : undefined;
    return registerForCreativeMode(creativeMode);
  }

  private coerceStoryPlan(value: StoryPlanJson, intake: IntakeResult): StoryPlan {
    if (!value.premise || !Array.isArray(value.scenes)) {
      throw new Error("Story Architect response is missing premise or scenes.");
    }
    // Deterministic register precedence (adversarial-audit #2): the SAME hint that selected the
    // niche playbook and shaped the scripting directive also decides the final register — customer
    // [style:X] tag > analyst intent > creative-mode map (cross-audit #1 kept: the customer's pick
    // still outranks everything). The LLM's self-authored register fills in ONLY when no
    // deterministic signal exists; letting it outrank the hint meant a script written under the
    // phone-KOL playbook could compile under a cinematic frame whenever the model defied its own
    // directive (or vice versa) — the directive and the final frame must be the same decision.
    const register: StyleRegister | undefined = this.resolvedRegisterHint(intake)
      ?? (isStyleRegister(value.register) ? value.register : undefined);
    const scenes = value.scenes.map((scene, sceneIndex) => this.coerceScene(scene, sceneIndex, intake, register));
    const usableScenes = scenes.length > 0 ? scenes : [this.fallbackScene(intake, 0, register)];
    const workflowScenes = this.singleClipRequested(intake)
      ? [this.singleClipScene(usableScenes, intake, register)]
      : usableScenes;
    const boundedScenes = this.limitBeatsToDurationCapacity(workflowScenes, intake, register);
    const sequencedScenes = this.ensureLongFormSceneStructure(boundedScenes, intake);
    const normalizedScenes = this.normalizeDurations(sequencedScenes, intake.settings.durationTargetSeconds);

    const optionalText = (candidate: unknown): string | undefined =>
      typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
    const episodeSummary = optionalText(value.episodeSummary);
    const episodeEndState = optionalText(value.episodeEndState);
    const cliffhanger = optionalText(value.cliffhanger);
    const cast = this.coerceCast(value.cast);

    return {
      premise: value.premise,
      targetDurationSeconds: intake.settings.durationTargetSeconds,
      scenes: normalizedScenes,
      ...(episodeSummary ? { episodeSummary } : {}),
      ...(episodeEndState ? { episodeEndState } : {}),
      ...(cliffhanger ? { cliffhanger } : {}),
      ...(cast.length > 0 ? { cast } : {})
    };
  }

  /** Per-character appearance sheets: the clean face source-of-truth for identity anchoring. */
  private coerceCast(value: unknown): readonly { readonly label: string; readonly appearance: string }[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const seen = new Set<string>();
    const cast: { readonly label: string; readonly appearance: string }[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const appearance = typeof record.appearance === "string" ? record.appearance.trim() : "";
      const key = label.toLowerCase();
      if (!label || !appearance || seen.has(key)) {
        continue;
      }
      seen.add(key);
      cast.push({ label, appearance: appearance.slice(0, 400) });
    }
    return cast.slice(0, 12);
  }

  /** LLM-authored per-beat style DNA; requires a resolved register to anchor the axes. */
  private coerceStyleDna(value: unknown, register: StyleRegister | undefined): StyleDna | undefined {
    if (!register) {
      return undefined;
    }
    const payload = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
    const text = (key: string): string | undefined =>
      typeof payload[key] === "string" && (payload[key] as string).trim() ? (payload[key] as string).trim() : undefined;
    const list = (key: string): readonly string[] | undefined => {
      const raw = payload[key];
      if (!Array.isArray(raw)) {
        return undefined;
      }
      const cleaned = raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 8);
      return cleaned.length > 0 ? cleaned : undefined;
    };
    const optics = text("optics");
    const lighting = text("lighting");
    const palette = text("palette");
    const motion = text("motion");
    const performance = text("performance");
    const audioFeel = text("audioFeel");
    const moodWords = list("moodWords");
    const avoid = list("avoid");
    // A register alone is NOT authored DNA — without at least one axis the legacy niche/mode tables
    // must still fire under the register frame, or briefs where the LLM skips styleDna lose all
    // category color (caught by the input-matrix harness).
    if (!optics && !lighting && !palette && !motion && !performance && !audioFeel && !moodWords && !avoid) {
      return undefined;
    }
    return {
      register,
      ...(optics ? { optics } : {}),
      ...(lighting ? { lighting } : {}),
      ...(palette ? { palette } : {}),
      ...(motion ? { motion } : {}),
      ...(performance ? { performance } : {}),
      ...(audioFeel ? { audioFeel } : {}),
      ...(moodWords ? { moodWords } : {}),
      ...(avoid ? { avoid } : {})
    };
  }

  private coerceScene(scene: unknown, sceneIndex: number, intake: IntakeResult, register?: StyleRegister): ScenePlan {
    const payload = scene && typeof scene === "object" ? (scene as Record<string, unknown>) : {};
    const rawBeats = Array.isArray(payload.beats) ? payload.beats : [];
    const sceneId = typeof payload.sceneId === "string" ? payload.sceneId : `scene_${sceneIndex + 1}`;
    const title = typeof payload.title === "string" ? payload.title : `Scene ${sceneIndex + 1}`;
    const beats = rawBeats.length > 0
      ? rawBeats.map((beat, beatIndex) => this.coerceBeat(beat, sceneIndex, beatIndex, intake, register))
      : [this.fallbackBeat(sceneId, title, sceneIndex, 0, intake, register)];

    return {
      sceneId,
      title,
      beats
    };
  }

  private coerceBeat(
    beat: unknown,
    sceneIndex: number,
    beatIndex: number,
    intake: IntakeResult,
    register?: StyleRegister
  ): BeatPlan {
    const payload = beat && typeof beat === "object" ? (beat as Record<string, unknown>) : {};
    const style = typeof payload.style === "string" ? payload.style : undefined;
    const audioIntent = typeof payload.audioIntent === "string" && payload.audioIntent.trim()
      ? payload.audioIntent.trim()
      : this.defaultAudioIntent(payload, intake, register);
    const identity = typeof payload.identity === "string" ? payload.identity : undefined;
    const product = typeof payload.product === "string" ? payload.product : undefined;
    // Length-cap environment like cast.appearance (adversarial-audit F4): it now flows into the
    // keyframe + avatar image prompts, and an LLM echoing the whole customer brief verbatim would
    // bloat those prompts. 300 chars is plenty for a setting description.
    const environment = typeof payload.environment === "string" ? payload.environment.slice(0, 300) : undefined;
    // Verbatim scripted line: preserved EXACTLY as the model returned it (only outer whitespace
    // trimmed) so a script-first user's dialogue/narration is never paraphrased downstream (gap #6).
    const spokenLine = typeof payload.spokenLine === "string" && payload.spokenLine.trim()
      ? payload.spokenLine.trim()
      : undefined;
    const emotionalTurn = typeof payload.emotionalTurn === "string" && payload.emotionalTurn.trim()
      ? payload.emotionalTurn.trim()
      : undefined;
    // Style DNA precedence (audit #1/#2): beat-authored axes win; otherwise the analyst's
    // whole-video styleDna is inherited — but ONLY when its register agrees with the resolved
    // register (axes written for the phone register under a cinematic frame would contradict each
    // other; on disagreement the plan's register wins and the axes are dropped, cross-review);
    // otherwise a bare {register} still travels so the compiler's register frame fires even when
    // the scriptwriter wrote no axes and no creativeMode metadata exists. The compiler keeps
    // legacy niche color for axis-less DNA, so this never costs category detail.
    const intentDna = intake.creativeIntent?.styleDna;
    const intentDnaUsable = intentDna && (register === undefined || intentDna.register === register);
    const styleDna = this.coerceStyleDna(payload.styleDna, register)
      ?? (intentDnaUsable ? intentDna : undefined)
      ?? (register ? { register } : undefined);

    return {
      beatId: typeof payload.beatId === "string" ? payload.beatId : `scene_${sceneIndex + 1}_beat_${beatIndex + 1}`,
      purpose: this.readString(payload.purpose, "advance the story with a clear commercial beat"),
      action: this.readString(payload.action, "show a clear visual action that fulfills the beat"),
      subject: this.readString(payload.subject, "the primary subject described by the user"),
      camera: this.readString(payload.camera, this.defaultCraft(register).camera),
      lighting: this.readString(payload.lighting, this.defaultCraft(register).lighting),
      ...(style ? { style } : {}),
      ...(audioIntent ? { audioIntent } : {}),
      ...(spokenLine ? { spokenLine } : {}),
      ...(emotionalTurn ? { emotionalTurn } : {}),
      ...(styleDna ? { styleDna } : {}),
      durationSeconds: this.readNumber(payload.durationSeconds, Math.max(8, Math.min(15, intake.settings.durationTargetSeconds / 12))),
      risks: this.readRisks(payload.risks),
      references: intake.references,
      continuity: {
        ...(identity ? { identity } : {}),
        ...(product ? { product } : {}),
        ...(environment ? { environment } : {}),
        ...(style ? { style } : {})
      }
    };
  }

  /**
   * Register-derived craft defaults for LLM-omitted camera/lighting fields (audit #6). The old
   * fallbacks were flavorless platitudes ("stable cinematic camera", "coherent cinematic lighting")
   * that landed VERBATIM in the compiled Camera:/Lighting: lines and read as generic stock AI — and
   * imposed a cinematic word on phone-KOL beats. These defaults speak each register's own concrete
   * language (agreeing with the compiler's register frame by construction) and are slop-free, so the
   * guardian's authored_slop_density gate stays quiet on system-generated text.
   */
  private defaultCraft(register: StyleRegister | undefined): { readonly camera: string; readonly lighting: string } {
    if (register === "natural_phone_kol") {
      return {
        camera: "handheld phone framing at arm's length with natural micro-shake and one small reframe",
        lighting: "found window or room light with true auto-exposure shifts"
      };
    }
    if (register === "professional_cinematic") {
      return {
        camera: "steady framing with one motivated move (a slow push-in) and a clean focal plane",
        lighting: "soft motivated key light with gentle fill and rim separation"
      };
    }
    return {
      camera: "steady eye-level framing with one deliberate reframe toward the action",
      lighting: "natural motivated light with accurate contact shadows"
    };
  }

  private fallbackScene(intake: IntakeResult, sceneIndex: number, register?: StyleRegister): ScenePlan {
    const sceneId = `scene_${sceneIndex + 1}`;
    return {
      sceneId,
      title: "Core Production Scene",
      beats: [this.fallbackBeat(sceneId, "Core Production Scene", sceneIndex, 0, intake, register)]
    };
  }

  private fallbackBeat(sceneId: string, sceneTitle: string, sceneIndex: number, beatIndex: number, intake: IntakeResult, register?: StyleRegister): BeatPlan {
    const craft = this.defaultCraft(register);
    return {
      beatId: `${sceneId}_beat_${beatIndex + 1}`,
      purpose: "turn the user's input into a clear commercial visual beat",
      action: `visualize the main idea from the user input with a coherent beginning, middle, and end: ${intake.userInput}`,
      subject: "the primary subject described by the user",
      camera: craft.camera,
      lighting: craft.lighting,
      style: sceneTitle,
      durationSeconds: intake.settings.durationTargetSeconds,
      risks: [],
      references: intake.references,
      continuity: {
        environment: `maintain the setting established in ${sceneTitle}`
      },
      ...(intake.settings.audioMode !== "none" ? { audioIntent: "support the visual pacing with coherent ambience or music" } : {})
    };
  }

  private singleClipRequested(intake: IntakeResult): boolean {
    // A provider clip physically tops out at MAX_CLIP_SECONDS. An explicit "single" request beyond
    // that cannot be honored — the chunker would split the collapsed beat anyway and the entire
    // merged dialogue would ride the first sub-clip (adversarial-audit #3: 60s "single" crammed a
    // 168-word budget onto one ≤15s clip). Fall back to the normal multi-beat plan, which renders
    // as one continuous arc across clips — the closest real thing to what was asked.
    if (intake.settings.durationTargetSeconds > MAX_CLIP_SECONDS) {
      return false;
    }
    const metadata = intake.metadata ?? {};
    const rawMode = metadata.workflowMode ?? metadata.renderMode ?? metadata.videoMode ?? metadata.mode;
    const normalized = rawMode?.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (normalized === "single" || normalized === "single_clip" || normalized === "one_clip") {
      return true;
    }
    if (normalized && normalized !== "auto") {
      return false;
    }
    return metadata.shortPipelineRecommendedWorkflowMode === "single_clip";
  }

  private singleClipScene(scenes: readonly ScenePlan[], intake: IntakeResult, register?: StyleRegister): ScenePlan {
    const beats = scenes.flatMap((scene) => scene.beats);
    const firstBeat = beats[0] ?? this.fallbackBeat("single_clip_scene", "Single Clip", 0, 0, intake, register);
    const actionArc = beats
      .map((beat) => beat.action)
      .filter((action) => action.trim().length > 0)
      .slice(0, 6)
      .join(" Then ");
    // Collapsing to one clip must not discard the later beats' verbatim dialogue (audit #5): the
    // merged beat speaks ALL the scripted lines in order, and its emotional turn spans the whole
    // arc (first turn's start -> last turn's end).
    const spokenLines = beats
      .map((beat) => beat.spokenLine?.trim())
      .filter((line): line is string => Boolean(line));
    // A single clip physically cannot speak every beat's dialogue if they sum past what fits its
    // runtime (cross-audit B5): capToSpeakableWords keeps the OPENING lines (the hook + the first
    // turn, the most important words) and trims the tail to the shared VO cadence, instead of
    // cramming an unspeakable wall of narration into a 15s clip.
    //
    // SCRIPT-FIRST EXCEPTION (self-audit regression guard): when the customer PASTED their own finished
    // script, every spokenLine is their exact words under a hard VERBATIM promise (SCRIPT_FIRST_DIRECTIVE
    // + the compiler's "deliver word-for-word, do not shorten" contract). Capping there would silently
    // truncate the customer's own script AND contradict the verbatim line the compiler still emits — so
    // the budget applies ONLY to lines the model authored itself. An over-long pasted script for a tiny
    // duration is the customer's own choice (they can pick a longer runtime); we never drop their words.
    const scriptFirstMode = isScriptFirstRequest(intake.userInput, intake.metadata);
    const joinedSpokenLines = spokenLines.join(" ");
    const mergedSpokenLine = scriptFirstMode
      ? joinedSpokenLines
      : capToSpeakableWords(joinedSpokenLines, intake.settings.durationTargetSeconds, TALKING_WORDS_PER_SECOND);
    const turns = beats
      .map((beat) => beat.emotionalTurn?.trim())
      .filter((turn): turn is string => Boolean(turn));
    const firstTurn = turns[0];
    const lastTurn = turns[turns.length - 1];
    // LLMs write the turn arrow as "->", "→", or "=>" interchangeably — split on all of them.
    const TURN_ARROW = /\s*(?:->|→|=>|⇒)\s*/;
    const mergedEmotionalTurn = firstTurn && lastTurn && firstTurn !== lastTurn
      ? `${(firstTurn.split(TURN_ARROW)[0] ?? firstTurn).trim()} -> ${(lastTurn.split(TURN_ARROW).pop() ?? lastTurn).trim()}`
      : firstTurn;
    const risks = [...new Set(beats.flatMap((beat) => beat.risks))];
    const continuity = beats.reduce<BeatPlan["continuity"]>((accumulator, beat) => ({
      ...accumulator,
      ...beat.continuity
    }), {});
    const sceneTitle = scenes.map((scene) => scene.title).filter(Boolean).slice(0, 3).join(" / ") || "Single Clip";
    return {
      sceneId: "single_clip_scene",
      title: sceneTitle,
      beats: [
        {
          ...firstBeat,
          beatId: "single_clip_beat_1",
          purpose: "render the approved short plan as one continuous provider clip",
          action: this.singleClipActionArc(actionArc || firstBeat.action, intake),
          ...(mergedSpokenLine ? { spokenLine: mergedSpokenLine } : {}),
          ...(mergedEmotionalTurn ? { emotionalTurn: mergedEmotionalTurn } : {}),
          durationSeconds: intake.settings.durationTargetSeconds,
          risks,
          references: intake.references,
          continuity,
          ...(intake.settings.audioMode !== "none"
            ? { audioIntent: firstBeat.audioIntent ?? "support the single-clip short with coherent ambience or narration timing" }
            : {})
        }
      ]
    };
  }

  private normalizeDurations(scenes: readonly ScenePlan[], targetDurationSeconds: number): readonly ScenePlan[] {
    const allBeats = scenes.flatMap((scene) => scene.beats);
    if (allBeats.length === 0) {
      return scenes;
    }
    // Per-beat minimum: a talking (spokenLine) beat may go down to the talking floor (~2s) because
    // its rendered avatar clip is only as long as its short line; forcing it to 4s would both bloat
    // the cost estimate AND make 8 short beats sum to 32s on an 18s order. B-roll beats keep the 4s
    // floor. Without this, the capacity fix above (which allows more talking beats) would break the
    // duration math.
    // Same speech-aware floor the capacity cap uses, so the two can never disagree: a spoken beat is
    // floored at its real line length (the avatar clip's actual runtime), b-roll at 4s.
    const minFor = (beat: BeatPlan): number => this.beatDurationFloor(beat);
    const minTotal = allBeats.reduce((sum, beat) => sum + minFor(beat), 0);
    // Belt-and-suspenders (adversarial-audit F1): the capacity cap now keeps the floor-sum ≤ target,
    // but if a caller ever hands normalizeDurations more beats than the target can hold at their
    // floors, distribute the target PROPORTIONALLY to the floors instead of pinning each to its floor
    // (which would overshoot). Guarantees the returned durations sum ≈ target for any beat mix.
    if (minTotal > targetDurationSeconds) {
      let beatCursor = 0;
      return scenes.map((scene) => ({
        ...scene,
        beats: scene.beats.map((beat) => {
          beatCursor += 1;
          const share = (minFor(beat) / minTotal) * targetDurationSeconds;
          return { ...beat, durationSeconds: Math.max(1, Math.round(share)) };
        })
      }));
    }
    const distributableSeconds = Math.max(0, Math.round(targetDurationSeconds - minTotal));
    const weights = allBeats.map((beat) => Math.max(0, beat.durationSeconds - minFor(beat)));
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const exactExtras = weights.map((weight) =>
      weightTotal > 0 ? (distributableSeconds * weight) / weightTotal : distributableSeconds / allBeats.length
    );
    const floorExtras = exactExtras.map((extra) => Math.floor(extra));
    let remainder = distributableSeconds - floorExtras.reduce((sum, extra) => sum + extra, 0);
    const fractionalOrder = exactExtras
      .map((extra, index) => ({ index, fraction: extra - Math.floor(extra) }))
      .sort((left, right) => right.fraction - left.fraction);

    for (const item of fractionalOrder) {
      if (remainder <= 0) {
        break;
      }
      floorExtras[item.index] = (floorExtras[item.index] ?? 0) + 1;
      remainder -= 1;
    }

    let beatCursor = 0;
    return scenes.map((scene, sceneIndex) => ({
      ...scene,
      beats: scene.beats.map((beat) => {
        const durationSeconds = minFor(beat) + (floorExtras[beatCursor] ?? 0);
        beatCursor += 1;
        return {
          ...beat,
          durationSeconds
        };
      })
    }));
  }

  /** True when this plan is expected to be talking-head/avatar-dominated (its runtime is speech-bound). */
  private isTalkingDominatedPlan(intake: IntakeResult, register?: StyleRegister): boolean {
    return register === "natural_phone_kol" && intake.settings.audioMode !== "none";
  }

  /**
   * The per-beat duration floor. A SPOKEN (avatar) beat's clip lasts exactly its line, so its floor
   * is the line's real speech length — NOT a fixed 2s. Using the fixed floor made the capacity cap
   * over-reserve time per beat (9 beats x 2s on an 18s order) while each beat only delivered ~1.75s,
   * so a plan written in short natural lines could never fill the runtime no matter how many beats
   * the top-up loop added. Clamped to a sane 1.5s..15s band. B-roll keeps the 4s floor.
   */
  private beatDurationFloor(beat: BeatPlan): number {
    const line = beat.spokenLine?.trim();
    if (!line) {
      return MIN_BEAT_DURATION_SECONDS;
    }
    // Rounded to whole seconds: normalizeDurations distributes the remaining time in integers, so a
    // fractional floor made the per-beat sum miss the ordered duration (a 12s single clip landed at
    // 12.5s). Never below the 2s talking floor, never above the 15s provider clip ceiling.
    const speechSeconds = Math.round(countWords(line) / TALKING_WORDS_PER_SECOND);
    return Math.min(15, Math.max(TALKING_MIN_BEAT_DURATION_SECONDS, speechSeconds));
  }

  private limitBeatsToDurationCapacity(scenes: readonly ScenePlan[], intake: IntakeResult, register?: StyleRegister): readonly ScenePlan[] {
    // Cap by the SUM of each beat's ACTUAL per-beat floor (2s spoken / 4s b-roll), not a single
    // register-wide floor × count (adversarial-audit F1): a MIXED talking plan (spoken beats + silent
    // b-roll cutaways) counted every beat at the 2s talking floor but normalizeDurations floors the
    // silent ones at 4s, so the sum blew past the target (5 spoken + 4 b-roll = 26s on an 18s order),
    // feeding a wrong number to both the cost gate and the delivery gate. Accumulate real floors and
    // stop before the running floor-sum would exceed the ordered duration; always keep ≥1 beat.
    const target = intake.settings.durationTargetSeconds;
    let floorSum = 0;
    let kept = 0;
    const bounded: ScenePlan[] = [];
    for (const scene of scenes) {
      const beats: BeatPlan[] = [];
      for (const beat of scene.beats) {
        const nextFloor = this.beatDurationFloor(beat);
        if (kept >= 1 && floorSum + nextFloor > target) {
          break;
        }
        beats.push(beat);
        floorSum += nextFloor;
        kept += 1;
      }
      if (beats.length > 0) {
        bounded.push({ ...scene, beats });
      }
      if (beats.length < scene.beats.length) {
        break;
      }
    }
    return bounded.length > 0 ? bounded : [this.fallbackScene(intake, 0, register)];
  }

  private readString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  // Register-aware defaults (contradiction-probe #1): the phone-KOL register's audio axis is
  // "in-camera sound only, NO scored music" — a default that injects a "music bed" under that
  // register put two opposite audio instructions in the SAME compiled prompt (and Seedance's
  // documented failure mode is scoring it like a car advert). Cinematic/neutral defaults keep a
  // bed but pin it UNDER the voice ("never swells"), which also agrees verbatim with the
  // talking-head naturalness clause ("no music swelling under the line").
  private defaultAudioIntent(payload: Record<string, unknown>, intake: IntakeResult, register?: StyleRegister): string | undefined {
    if (intake.settings.audioMode === "none") {
      return undefined;
    }
    const phone = register === "natural_phone_kol";
    const purpose = typeof payload.purpose === "string" ? payload.purpose.toLowerCase() : "";
    if (/\bhook\b|opening|first/.test(purpose)) {
      return phone
        ? "the voice opens the clip immediately over real in-camera room tone — no music bed, no dead air"
        : "guided voiceover starts immediately with a sharp hook and no dead air; any music stays low under the voice and never swells";
    }
    if (/\bpayoff\b|result|cta|ending|close/.test(purpose)) {
      return phone
        ? "the voice lands the final line over in-camera sound only with a natural settle — no music tail"
        : "guided voiceover resolves under the visual payoff with a soft next-step line; music stays under the voice and fades clean";
    }
    return phone
      ? "guided voiceover supports the visible demo or proof action over natural room tone and real contact noise"
      : "guided voiceover supports the visible demo or proof action, with subtle ambience and product/contact SFX where useful";
  }

  private singleClipActionArc(action: string, intake: IntakeResult): string {
    if (intake.settings.durationTargetSeconds > 60) {
      return action;
    }
    return [
      "Use the full short duration as one continuous arc:",
      "0-1s hook/problem or payoff promise;",
      "middle seconds show context plus demo/proof action;",
      "final seconds show the result, reaction, or soft next-step implication;",
      "end on a stable frame that can be exported directly or chained into the next clip.",
      `Planned action: ${action}`
    ].join(" ");
  }

  private readNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private readRisks(value: unknown): readonly ContinuityRisk[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((risk): risk is ContinuityRisk => typeof risk === "string" && KNOWN_RISKS.has(risk));
  }

  private sourceVideoBrief(value: SourceVideoDeconstruction): Record<string, unknown> {
    return {
      ...(value.sourceReferenceLabel ? { sourceReferenceLabel: value.sourceReferenceLabel } : {}),
      ...(value.transformationIntent ? { transformationIntent: value.transformationIntent } : {}),
      ...(value.mediaMetrics ? { mediaMetrics: this.sourceVideoMediaMetricsBrief(value.mediaMetrics) } : {}),
      sceneCount: value.scenes?.length ?? 0,
      transcriptCueCount: value.transcript?.length ?? 0,
      scenes: (value.scenes ?? []).slice(0, 80).map((scene) => ({
        sceneId: scene.sceneId,
        startSecond: scene.startSecond,
        endSecond: scene.endSecond,
        summary: scene.summary,
        ...(scene.pacing ? { pacing: scene.pacing } : {}),
        ...(scene.camera ? { camera: scene.camera } : {}),
        ...(scene.audio ? { audio: scene.audio } : {}),
        ...(scene.visualStyle ? { visualStyle: scene.visualStyle } : {}),
        keyframes: (scene.keyframes ?? []).slice(0, 6).map((keyframe) => ({
          timestampSecond: keyframe.timestampSecond,
          description: keyframe.description
        }))
      })),
      transcript: (value.transcript ?? []).slice(0, 160).map((cue) => ({
        startSecond: cue.startSecond,
        endSecond: cue.endSecond,
        text: cue.text
      })),
      pacingNotes: (value.pacingNotes ?? []).slice(0, 60),
      styleNotes: (value.styleNotes ?? []).slice(0, 60),
      structuralBeats: (value.structuralBeats ?? []).slice(0, 80),
      safetyNotes: (value.safetyNotes ?? []).slice(0, 60)
    };
  }

  private sourceVideoMediaMetricsBrief(value: NonNullable<SourceVideoDeconstruction["mediaMetrics"]>): Record<string, unknown> {
    return {
      ...(value.durationSeconds !== undefined ? { durationSeconds: value.durationSeconds } : {}),
      ...(value.video ? { video: value.video } : {}),
      audio: value.audio,
      editRhythm: {
        sceneCutCount: value.editRhythm.sceneCutCount,
        cutDensityPerMinute: value.editRhythm.cutDensityPerMinute,
        averageShotLengthSeconds: value.editRhythm.averageShotLengthSeconds,
        rhythmLabel: value.editRhythm.rhythmLabel,
        sceneCutTimestampsSeconds: (value.editRhythm.sceneCutTimestampsSeconds ?? []).slice(0, 24)
      },
      evidence: {
        probeSucceeded: value.evidence.probeSucceeded,
        sceneDetectionSucceeded: value.evidence.sceneDetectionSucceeded,
        sourceUriSha256: value.evidence.sourceUriSha256
      }
    };
  }
}
