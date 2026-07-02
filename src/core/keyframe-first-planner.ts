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

const KEYFRAME_REFERENCE_ROLES = new Set(["identity", "product", "environment", "style"]);

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
        ratio: input.settings.ratio === "adaptive" ? "9:16" : input.settings.ratio,
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
  const resultsByShot = new Map(input.results.map((result) => [result.shotId, result.prediction]));
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
  return prediction.outputUrls.find((url) => isImageOutputUrl(url)) ?? prediction.outputUrls[0];
}

function stringMetadata(shot: ShotContract, key: string): string | undefined {
  const value = shot.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
