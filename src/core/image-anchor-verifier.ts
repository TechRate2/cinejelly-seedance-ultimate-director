/**
 * Image-anchor verifier — the ViMax spend-economy stage CineJelly was missing (repo-fidelity audit
 * gap #2): check the CHEAP image (portrait ~$0.036, keyframe ~$0.036) BEFORE the EXPENSIVE video
 * conditions on it. A drifted/deformed anchor poisons every paid video candidate rendered from it;
 * one bounded vision-LLM look at each anchor catches that for cents.
 *
 * Verdict policy is deliberately conservative:
 *   - "pass"    → anchor is usable;
 *   - "fail"    → the image contradicts its expectation (wrong/deformed face, wrong subject,
 *                 rendering artifacts) — caller may regenerate ONCE, then apply its keep/drop policy;
 *   - "skipped" → the CHECK itself could not run (provider error/timeout). Fail-open: an infra
 *                 hiccup must never block a legitimate render.
 */

import type { LlmProvider } from "../providers/contracts.js";

export interface ImageAnchorCheckInput {
  /** HTTPS URL of the generated image to verify (Atlas asset URL). */
  readonly imageUrl: string;
  readonly kind: "character_portrait" | "shot_keyframe" | "identity_reference";
  /** What the image MUST show — cast appearance sheet or the shot's subject/identity brief. */
  readonly expectation: string;
  /** Uploaded/canonical identity images the anchor must show the SAME person as, when any. */
  readonly identityReferenceUrls?: readonly string[];
  readonly modelId?: string;
  readonly metadata?: Record<string, string>;
}

export interface ImageAnchorVerdict {
  readonly imageUrl: string;
  readonly kind: ImageAnchorCheckInput["kind"];
  readonly status: "pass" | "fail" | "skipped";
  readonly reason: string;
}

interface VerdictJson {
  readonly status: "pass" | "fail";
  readonly reason: string;
}

const VERDICT_SCHEMA = {
  type: "object",
  required: ["status", "reason"],
  properties: {
    status: { type: "string", enum: ["pass", "fail"] },
    reason: { type: "string" }
  }
} satisfies Record<string, unknown>;

const MAX_IDENTITY_REFERENCES = 3;

export class ImageAnchorVerifier {
  private readonly llmProvider: LlmProvider;
  private readonly defaultModelId: string;

  public constructor(llmProvider: LlmProvider, defaultModelId: string) {
    this.llmProvider = llmProvider;
    this.defaultModelId = defaultModelId;
  }

  public async verify(input: ImageAnchorCheckInput, signal?: AbortSignal): Promise<ImageAnchorVerdict> {
    const identityUrls = (input.identityReferenceUrls ?? [])
      .filter((url) => /^https:\/\//.test(url))
      .slice(0, MAX_IDENTITY_REFERENCES);
    const rules = [
      input.kind === "character_portrait"
        ? "This is a CHARACTER ANCHOR PORTRAIT: exactly one person, face clearly visible and sharp, matching the locked appearance sheet below."
        : input.kind === "identity_reference"
          ? "This is a customer-UPLOADED IDENTITY REFERENCE photo that will lock a person's face across a whole video. It must contain exactly ONE clearly visible, reasonably sharp human face (front or near-front). FAIL on: no visible face, multiple people, a face too small/blurry to anchor identity, heavy beauty-filter distortion, or the face mostly covered (mask/sunglasses/hair)."
          : "This is a SHOT KEYFRAME: the frame the video will start from; the subject and any named person/product must match the expectation below.",
      identityUrls.length > 0
        ? "The FIRST image is the generated anchor; every FOLLOWING image is a canonical identity reference — the generated anchor must show the SAME person (face structure, features), or fail."
        : undefined,
      "FAIL on: a different/blended face than required, deformed anatomy (extra or fused fingers, warped features, broken eyes/teeth), duplicated subject, visible generated text or watermark, or a subject that contradicts the expectation.",
      "PASS on imperfect but usable: minor styling differences (clothing color, background, lighting) are NOT failures when identity and anatomy are correct.",
      `EXPECTATION: ${input.expectation}`
    ].filter((line): line is string => Boolean(line)).join("\n");

    try {
      const response = await this.llmProvider.structured<VerdictJson, typeof VERDICT_SCHEMA>(
        {
          modelId: input.modelId ?? this.defaultModelId,
          schema: VERDICT_SCHEMA,
          instruction:
            'Return JSON {"status","reason"}: status "fail" only for defects that would ruin a video conditioned on this image; one short reason sentence.',
          messages: [
            {
              role: "system",
              content:
                "You are a strict film-production still checker. Judge ONLY what is visible in the supplied images."
            },
            {
              role: "user",
              content: [
                { type: "text" as const, text: rules },
                { type: "image_url" as const, image_url: { url: input.imageUrl } },
                ...identityUrls.map((url) => ({ type: "image_url" as const, image_url: { url } }))
              ]
            }
          ],
          metadata: { imageAnchorKind: input.kind, ...(input.metadata ?? {}) }
        },
        signal
      );
      return {
        imageUrl: input.imageUrl,
        kind: input.kind,
        status: response.value.status === "fail" ? "fail" : "pass",
        reason: response.value.reason?.trim() || (response.value.status === "fail" ? "anchor contradicts expectation" : "ok")
      };
    } catch (error) {
      // A user abort must propagate — swallowing it would keep spending after cancellation.
      if (signal?.aborted) {
        throw error;
      }
      return {
        imageUrl: input.imageUrl,
        kind: input.kind,
        status: "skipped",
        reason: `verifier unavailable: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}
