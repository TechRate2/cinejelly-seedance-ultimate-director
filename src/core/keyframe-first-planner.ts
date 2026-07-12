/**
 * Keyframe-first planner.
 *
 * The single biggest realism lever in commercial AI video: generate a strong STILL opening
 * frame for each shot first (conditioned on the user's identity/product references), then
 * animate that approved frame through image-to-video instead of asking the video model to
 * invent composition from text alone. This ports the "frames stage" concept used by leading
 * UGC/micro-drama pipelines into CineJelly-owned planning code.
 *
 * Both functions are pure and no-spend: `planKeyframeRequests` only builds provider-neutral
 * image requests, and `bindKeyframesToShots` only rewires shot references once results
 * exist. Actual generation happens elsewhere behind the normal spend gates. Binding a
 * first_frame reference automatically flips the prompt compiler into image-to-video mode.
 */

import type { ImageGenerationRequest, Prediction, ProviderName } from "../types/provider.js";
import type { PromptReference, ShotContract } from "../types/prompt.js";
import type { FlexibleSeedanceSettings } from "../types/settings.js";
import { isImageOutputUrl } from "./endpoint-frame-chain.js";
import { resolveSeedanceDna } from "./seedance-dna.js";

// "wardrobe" is included so the OPENING frame the whole shot animates from is anchored on the
// signature-wardrobe reference too — otherwise the seed still is generated with no outfit anchor and
// costume drifts shot-to-shot even when a correct wardrobe reference was supplied (final-audit gap #5).
const KEYFRAME_REFERENCE_ROLES = new Set(["identity", "product", "wardrobe", "environment", "style"]);

const KEYFRAME_NEGATIVE_PROMPT =
  "no watermark, no text, no captions, no plastic over-smoothed skin, no warped hands or fingers, no distorted product or logo, no extra limbs, no cartoon or 3D render look, no oversaturated colors, no vivid-filter or HDR-glow color grading, no beauty-filter airbrushing, no over-sharpened edges, no studio-perfect staging";

export interface KeyframeRequestPlan {
  readonly shotId: string;
  readonly request: ImageGenerationRequest;
}

export interface KeyframeBindingResult {
  readonly shots: readonly ShotContract[];
  readonly boundShotIds: readonly string[];
  readonly skippedShotIds: readonly string[];
}

/**
 * Build one still-image request per shot describing that shot's OPENING frame.
 * Identity/product/environment/style references pass through so the keyframe carries the
 * user's real face and product from the start.
 */
export function planKeyframeRequests(input: {
  readonly shots: readonly ShotContract[];
  readonly provider: ProviderName;
  readonly imageModelId: string;
  readonly settings: FlexibleSeedanceSettings;
}): readonly KeyframeRequestPlan[] {
  if (!input.imageModelId?.trim()) {
    throw new Error("planKeyframeRequests needs a configured image model id.");
  }
  return input.shots.map((shot) => ({
    shotId: shot.shotId,
    request: {
      provider: input.provider,
      modelId: input.imageModelId,
      prompt: keyframePromptFor(shot),
      negativePrompt: KEYFRAME_NEGATIVE_PROMPT,
      references: shot.references
        .filter((reference) => KEYFRAME_REFERENCE_ROLES.has(reference.role))
        .map((reference) => reference.providerReference),
      settings: {
        // Pass "adaptive" through unchanged: the image provider omits ratio and lets the model
        // decide (atlas-cloud-provider.ts:502), matching the video path — so a landscape-intent
        // long-form left on "adaptive" is no longer silently pinned to 9:16 portrait via the
        // first_frame (final-audit gap #8).
        ratio: input.settings.ratio,
        ...(input.settings.seed !== undefined ? { seed: input.settings.seed } : {}),
        ...(input.settings.guidanceScale !== undefined ? { guidanceScale: input.settings.guidanceScale } : {})
      },
      metadata: {
        ...(shot.metadata ?? {}),
        shotId: shot.shotId,
        keyframeFirst: true
      }
    }
  }));
}

/**
 * Inject each successfully generated keyframe as the shot's primary first_frame reference,
 * replacing any prior first_frame. Shots whose keyframe failed keep their original
 * references (fail-open: text/reference-to-video still works).
 */
export function bindKeyframesToShots(input: {
  readonly shots: readonly ShotContract[];
  readonly results: readonly { readonly shotId: string; readonly prediction: Prediction }[];
}): KeyframeBindingResult {
  // Prefer a succeeded prediction when duplicate shotIds appear in results.
  const resultsByShot = new Map<string, Prediction>();
  for (const result of input.results) {
    const existing = resultsByShot.get(result.shotId);
    if (!existing || (existing.status !== "succeeded" && result.prediction.status === "succeeded")) {
      resultsByShot.set(result.shotId, result.prediction);
    }
  }
  const boundShotIds: string[] = [];
  const skippedShotIds: string[] = [];
  const shots = input.shots.map((shot) => {
    const prediction = resultsByShot.get(shot.shotId);
    const imageUrl = prediction ? selectKeyframeImageUrl(prediction) : undefined;
    if (!prediction || prediction.status !== "succeeded" || !imageUrl) {
      skippedShotIds.push(shot.shotId);
      return shot;
    }
    boundShotIds.push(shot.shotId);
    const keyframeReference: PromptReference = {
      role: "first_frame",
      label: `Keyframe for ${shot.shotId}`,
      providerReference: {
        kind: "image",
        uri: imageUrl,
        label: `Keyframe for ${shot.shotId}`,
        role: "first_frame"
      },
      priority: "primary",
      selection: { sourceShotId: shot.shotId, authorized: true }
    };
    return {
      ...shot,
      references: [keyframeReference, ...shot.references.filter((reference) => reference.role !== "first_frame")],
      metadata: {
        ...(shot.metadata ?? {}),
        keyframeFirst: "true",
        keyframePredictionId: prediction.predictionId
      }
    };
  });
  return { shots, boundShotIds, skippedShotIds };
}

/** Minimal cast shape needed for portrait generation (matches SeriesCastMember). */
export interface PortraitCastMember {
  readonly characterId: string;
  readonly name: string;
  readonly description: string;
  readonly staticFeatures?: string;
  readonly dynamicFeatures?: string;
  readonly identityReferenceUri?: string;
}

/** Turnaround views for character-consistency portrait sheets (ViMax multi-view essence). */
export type PortraitView = "front" | "three_quarter" | "side";

const PORTRAIT_VIEW_DIRECTIVES: Record<PortraitView, string> = {
  front: "head-and-shoulders, facing camera directly (front view)",
  three_quarter: "head-and-shoulders at a three-quarter angle (face turned ~45 degrees)",
  side: "head-and-shoulders in profile (side view)"
};

export interface CastPortraitRequestPlan {
  readonly characterId: string;
  readonly view: PortraitView;
  /** True for the front view, which becomes the character's primary identity anchor. */
  readonly isPrimary: boolean;
  readonly request: ImageGenerationRequest;
}

/**
 * Build one portrait-sheet image request per cast member that has NO identity reference
 * yet. The generated portrait then becomes that character's identity anchor for every
 * shot and episode, so fictional characters stop drifting between generations. Members
 * that already have an identity image are skipped (the real face wins).
 */
export function planCastPortraitRequests(input: {
  readonly cast: readonly PortraitCastMember[];
  readonly provider: ProviderName;
  readonly imageModelId: string;
  readonly ratio?: "9:16" | "1:1" | "3:4";
  readonly seed?: number;
  /** Views to generate per character. Defaults to front-only (back-compatible). */
  readonly views?: readonly PortraitView[];
}): readonly CastPortraitRequestPlan[] {
  if (!input.imageModelId?.trim()) {
    throw new Error("planCastPortraitRequests needs a configured image model id.");
  }
  // Deduplicate and always lead with the front view (the identity anchor).
  const requestedViews = input.views && input.views.length > 0 ? input.views : (["front"] as const);
  const views = [...new Set<PortraitView>(["front", ...requestedViews.filter((view) => view !== "front")])].filter(
    (view) => requestedViews.includes(view) || view === "front"
  );
  const plans: CastPortraitRequestPlan[] = [];
  for (const member of input.cast) {
    if (member.identityReferenceUri?.trim()) {
      continue;
    }
    for (const view of views) {
      plans.push({
        characterId: member.characterId,
        view,
        isPrimary: view === "front",
        request: {
          provider: input.provider,
          modelId: input.imageModelId,
          prompt: [
            `Photoreal character identity portrait of ${member.name}: ${PORTRAIT_VIEW_DIRECTIVES[view]}, neutral relaxed expression, even soft studio light, plain neutral background.`,
            `Locked identity anchor: ${member.staticFeatures?.trim() || member.description}.`,
            member.dynamicFeatures?.trim() ? `Current presentation: ${member.dynamicFeatures}.` : undefined,
            view === "front"
              ? "Real skin microtexture and hair detail, accurate facial geometry, no beautify smoothing; this image is the single source of truth for this character's face across a whole video series."
              : "Keep identical facial geometry, skin tone, hair, and features to the front view — this is the same person from another angle for a consistent turnaround sheet.",
            "Color: natural true-to-life color balance like an unedited photo — accurate white balance, restrained saturation, soft organic contrast; no vivid mode, no HDR halo, no beauty filter."
          ]
            .filter((line): line is string => Boolean(line))
            .join(" "),
          negativePrompt: KEYFRAME_NEGATIVE_PROMPT,
          references: [],
          settings: {
            ratio: input.ratio ?? "3:4",
            ...(input.seed !== undefined ? { seed: input.seed } : {})
          },
          metadata: {
            characterId: member.characterId,
            castPortrait: true,
            portraitView: view
          }
        }
      });
    }
  }
  return plans;
}

/**
 * Fill each cast member's identityReferenceUri from a successful portrait prediction.
 * Members with an existing identity image, or whose portrait failed, are returned
 * unchanged (fail-open).
 */
export function bindPortraitsToCast<TMember extends PortraitCastMember>(input: {
  readonly cast: readonly TMember[];
  readonly results: readonly {
    readonly characterId: string;
    readonly prediction: Prediction;
    /** When multi-view portraits are generated, only the front view anchors identity. */
    readonly isPrimary?: boolean;
  }[];
}): readonly TMember[] {
  // The identity anchor is the primary (front) view; extra turnaround views do not
  // override it. Results without an isPrimary flag are treated as primary (back-compat).
  const byCharacter = new Map(
    input.results
      .filter((result) => result.isPrimary !== false)
      .map((result) => [result.characterId, result.prediction])
  );
  return input.cast.map((member) => {
    if (member.identityReferenceUri?.trim()) {
      return member;
    }
    const prediction = byCharacter.get(member.characterId);
    const imageUrl = prediction ? selectKeyframeImageUrl(prediction) : undefined;
    if (!prediction || prediction.status !== "succeeded" || !imageUrl) {
      return member;
    }
    return { ...member, identityReferenceUri: imageUrl };
  });
}

const MAX_ANCHOR_CHARACTERS = 6;
const MIN_SHOTS_FOR_ANCHOR = 2;
const CHARACTER_ARTICLE_PREFIX = /^(?:the|a|an)\s+/i;

/**
 * Normalize a free-text character identity into a stable grouping key so "the founder", "Founder",
 * and "  founder " collapse to ONE character instead of fragmenting into separate anchors (which
 * would both waste image spend and fail to anchor consistently).
 */
export function normalizeCharacterKey(identity: string | undefined): string {
  if (!identity) {
    return "";
  }
  return identity
    .trim()
    .toLowerCase()
    .replace(CHARACTER_ARTICLE_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Multi-character separators across the languages we plan in: "Linh and Mai", "Linh và Mai",
// "Linh, Mai", "Linh & Mai", "Linh + Mai". Word separators require surrounding whitespace (JS \b
// misbehaves on non-ASCII like "và", and this also keeps names such as "Sandy" unsplit). "with" is
// deliberately NOT a separator — "woman with glasses" is one person, not two.
const CHARACTER_CONJUNCTION_SEPARATOR = /\s+(?:and|và|va|cùng|cung)\s+|\s*[&+]\s*/i;
const CHARACTER_COMMA_SEPARATOR = /\s*,\s*/;
// A real character label is short ("Linh", "the founder", "skeptical customer"). If any split part is
// longer, the string is a DESCRIPTION with punctuation ("Linh, exhausted after a long day"), not a
// character list — splitting it would fabricate a bogus character that gets its own portrait and a
// wrong identity reference. Treat such strings as one character.
const CHARACTER_LABEL_ARTICLE = /^(?:the|a|an)\s+\S+/i;
const MAX_CHARACTER_LABEL_WORDS = 3;

function startsWithUppercaseLetter(value: string): boolean {
  const firstLetter = value.match(/\p{L}/u)?.[0];
  return Boolean(firstLetter && firstLetter !== firstLetter.toLocaleLowerCase());
}

/**
 * A part is only accepted as a separate character when it reads like a LABEL, not a description:
 * short, and either a capitalized name ("Mai") or an article role ("the founder"). Comma parts are
 * held to the strict capitalized-name rule because commas also introduce appositives/adjectives
 * ("Linh, tired" / "An, the founder" are ONE person) — roles list via "and"/"và" instead.
 */
function isCharacterLabelLike(part: string, allowArticleRole: boolean): boolean {
  if (part.split(/\s+/).length > MAX_CHARACTER_LABEL_WORDS) {
    return false;
  }
  if (startsWithUppercaseLetter(part)) {
    return true;
  }
  return allowArticleRole && CHARACTER_LABEL_ARTICLE.test(part);
}

/**
 * Split a beat identity string that names SEVERAL characters ("Linh and Mai") into the individual
 * people. A multi-character shot must reference each person's OWN portrait — treating the pair as one
 * pseudo-character both generates a useless merged portrait and mis-anchors the shot (live-render
 * finding: scene with both women got a single "Linh and Mai" identity). Single names pass through.
 */
export function splitCharacterIdentities(identity: string | undefined): readonly string[] {
  const trimmed = identity?.trim();
  if (!trimmed) {
    return [];
  }
  // Stage 1: conjunction separators (and/và/&/+) — unambiguous people-joiners, roles allowed.
  const conjunctionParts = trimmed
    .split(CHARACTER_CONJUNCTION_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  // Stage 2: commas inside each part — strict capitalized-name lists only ("Linh, Mai"), because a
  // comma can also introduce an appositive/adjective describing ONE person ("Linh, tired").
  const parts: string[] = [];
  for (const part of conjunctionParts) {
    const commaParts = part.split(CHARACTER_COMMA_SEPARATOR).map((sub) => sub.trim()).filter(Boolean);
    if (commaParts.length >= 2 && commaParts.every((sub) => isCharacterLabelLike(sub, false))) {
      parts.push(...commaParts);
    } else {
      parts.push(part);
    }
  }
  const candidates = parts.filter((part) => normalizeCharacterKey(part).length > 0);
  if (candidates.length < 2) {
    return candidates.length === 1 ? candidates : [trimmed];
  }
  // Every part must read like a label (short name or article role); otherwise the string is
  // descriptive prose ("Mai và điện thoại" = Mai with her phone) and must stay ONE character.
  if (!candidates.every((part) => isCharacterLabelLike(part, true))) {
    return [trimmed];
  }
  // Dedup within one identity string ("Linh and Linh") so a shot never double-counts a person —
  // duplicates would defeat the >=2-shot portrait spend cap.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of candidates) {
    const key = normalizeCharacterKey(part);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(part);
    }
  }
  return unique;
}

export interface CharacterAnchorPlan {
  readonly characterKey: string;
  readonly name: string;
  readonly description: string;
  readonly shotIds: readonly string[];
}

/** Normalized character keys of the identity references already attached to a shot (label + characterId). */
function shotIdentityReferenceKeys(shot: ShotContract): Set<string> {
  const keys = new Set<string>();
  for (const reference of shot.references) {
    if (reference.role !== "identity") {
      continue;
    }
    const labelKey = normalizeCharacterKey(reference.label);
    if (labelKey) {
      keys.add(labelKey);
    }
    const characterKey = normalizeCharacterKey(reference.selection?.characterId);
    if (characterKey) {
      keys.add(characterKey);
    }
  }
  return keys;
}

/**
 * Find INVENTED characters that recur across shots but have NO uploaded identity reference, so a
 * single shared portrait can anchor their face across the whole video. Without this, every per-shot
 * keyframe re-invents the face and it drifts across a long video (final-audit gap #2). Characters
 * that already carry an identity reference (a real uploaded face) are never anchored — the real face
 * wins. Bounded to MAX_ANCHOR_CHARACTERS and to characters that appear in >=2 shots so image spend
 * stays strictly capped and single-appearance descriptions never trigger a portrait.
 */
export function planCharacterAnchors(
  shots: readonly ShotContract[],
  maxCharacters: number = MAX_ANCHOR_CHARACTERS
): readonly CharacterAnchorPlan[] {
  const groups = new Map<
    string,
    { name: string; description: string; shotIds: string[]; hasIdentityRef: boolean }
  >();
  for (const shot of shots) {
    const identity = typeof shot.continuity?.identity === "string" ? shot.continuity.identity : undefined;
    // "Linh and Mai" is TWO people: each person gets their own group (and later their own portrait),
    // and this shot counts toward both — never a merged "Linh and Mai" pseudo-character.
    const people = splitCharacterIdentities(identity);
    if (people.length === 0) {
      continue;
    }
    // Per-PERSON uploaded-face detection: on a mixed shot (uploaded KOL + invented co-character), the
    // KOL's reference must suppress only the KOL's anchor, not the invented person's — otherwise the
    // invented face drifts with no portrait. Single-person shots keep the conservative rule (any
    // identity ref on the shot belongs to that person).
    const referenceKeys = shotIdentityReferenceKeys(shot);
    for (const person of people) {
      const key = normalizeCharacterKey(person);
      const personHasRef = people.length === 1 ? referenceKeys.size > 0 : referenceKeys.has(key);
      const existing = groups.get(key);
      if (existing) {
        existing.shotIds.push(shot.shotId);
        existing.hasIdentityRef = existing.hasIdentityRef || personHasRef;
        if (!existing.description && shot.subject?.trim()) {
          existing.description = shot.subject.trim();
        }
      } else {
        groups.set(key, {
          name: person.trim() || key,
          description: shot.subject?.trim() ?? "",
          shotIds: [shot.shotId],
          hasIdentityRef: personHasRef
        });
      }
    }
  }
  const candidates: CharacterAnchorPlan[] = [];
  for (const [characterKey, group] of groups) {
    if (group.hasIdentityRef || group.shotIds.length < MIN_SHOTS_FOR_ANCHOR) {
      continue;
    }
    candidates.push({
      characterKey,
      name: group.name,
      description: group.description || group.name,
      shotIds: group.shotIds
    });
  }
  return candidates
    .sort((left, right) => right.shotIds.length - left.shotIds.length)
    .slice(0, Math.max(0, maxCharacters));
}

/**
 * Attach a generated character-anchor portrait as an identity reference on every shot that features
 * that character, so the per-shot keyframe AND the video model share one canonical face. Never
 * overrides a shot that already has a real identity reference (fail-safe). Returns the anchored shot
 * ids so the caller can recompile those prompts even when their per-shot keyframe was skipped.
 */
export function bindCharacterAnchorsToShots(input: {
  readonly shots: readonly ShotContract[];
  readonly anchors: readonly { readonly characterKey: string; readonly name: string; readonly uri: string }[];
}): { readonly shots: readonly ShotContract[]; readonly anchoredShotIds: readonly string[] } {
  const byKey = new Map(input.anchors.map((anchor) => [anchor.characterKey, anchor]));
  const anchoredShotIds: string[] = [];
  const shots = input.shots.map((shot) => {
    const identity = typeof shot.continuity?.identity === "string" ? shot.continuity.identity : undefined;
    const people = splitCharacterIdentities(identity);
    const referenceKeys = shotIdentityReferenceKeys(shot);
    // Single-person shots keep the conservative rule: any existing identity ref means the real face
    // wins and no anchor is attached. On a MIXED multi-person shot (uploaded KOL + invented
    // co-character), only the person matching an existing ref is skipped — the invented co-character
    // still gets their portrait so their face does not drift (diff-review fix).
    if (people.length <= 1 && shot.references.some((reference) => reference.role === "identity")) {
      return shot;
    }
    // A multi-character shot ("Linh and Mai") gets one identity reference PER matched person, so the
    // keyframe and video model see each face's own portrait and never blend the two.
    const matchedAnchors = people
      .filter((person) => !referenceKeys.has(normalizeCharacterKey(person)))
      .map((person) => byKey.get(normalizeCharacterKey(person)))
      .filter((anchor): anchor is NonNullable<typeof anchor> => Boolean(anchor));
    const uniqueAnchors = [...new Map(matchedAnchors.map((anchor) => [anchor.characterKey, anchor])).values()];
    if (uniqueAnchors.length === 0) {
      return shot;
    }
    anchoredShotIds.push(shot.shotId);
    const identityReferences: PromptReference[] = uniqueAnchors.map((anchor) => ({
      role: "identity",
      label: anchor.name,
      priority: "primary",
      selection: { characterId: anchor.characterKey, authorized: true },
      providerReference: { kind: "image", uri: anchor.uri, role: "identity", label: anchor.name }
    }));
    return { ...shot, references: [...identityReferences, ...shot.references] };
  });
  return { shots, anchoredShotIds };
}

function keyframePromptFor(shot: ShotContract): string {
  const niche = stringMetadata(shot, "shortViralNiche") ?? stringMetadata(shot, "niche");
  const creativeMode =
    stringMetadata(shot, "shortViralCreativeMode") ??
    stringMetadata(shot, "shortDirectorCreativeMode") ??
    stringMetadata(shot, "creativeMode");
  const dnaLines = niche || creativeMode
    ? resolveSeedanceDna({
        ...(niche ? { niche } : {}),
        ...(creativeMode ? { creativeMode } : {})
      }).promptLines
    : [];
  return [
    `Single photoreal still frame: the OPENING frame of this shot, already mid-action with immediate visual tension (never an empty establishing frame).`,
    `Subject: ${shot.subject}.`,
    `Moment: the first instant of "${shot.action}".`,
    `Camera: ${shot.camera}. Lighting: ${shot.lighting}.`,
    shot.style ? `Style: ${shot.style}.` : undefined,
    ...dnaLines,
    "Real lens optics with natural depth of field, physically accurate light and shadows, true material microtexture (skin pores, fabric weave, product surfaces); composition must be strong enough to hold as the first frame of a commercial video.",
    // Color science: the frame must read as an UNEDITED smartphone capture, not an AI showcase image.
    // Over-saturated/over-sharp keyframes poison every downstream image-to-video clip with a fake look.
    "Color: natural true-to-life color balance exactly like an unedited smartphone photo — accurate white balance, restrained saturation, soft organic contrast, slight ambient imperfection; absolutely no vivid mode, no HDR halo, no punchy filter, no over-sharpening."
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");
}

function selectKeyframeImageUrl(prediction: Prediction): string | undefined {
  // Image outputs only: never fall back to an unclassified URL, or a video output could
  // silently become a first_frame "image" reference and corrupt image-to-video mode.
  return prediction.outputUrls.find((url) => isImageOutputUrl(url));
}

function stringMetadata(shot: ShotContract, key: string): string | undefined {
  const value = shot.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
