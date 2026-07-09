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
  "no watermark, no text, no captions, no plastic over-smoothed skin, no warped hands or fingers, no distorted product or logo, no extra limbs, no cartoon or 3D render look";

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
              : "Keep identical facial geometry, skin tone, hair, and features to the front view — this is the same person from another angle for a consistent turnaround sheet."
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
    "Real lens optics with natural depth of field, physically accurate light and shadows, true material microtexture (skin pores, fabric weave, product surfaces); composition must be strong enough to hold as the first frame of a commercial video."
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
