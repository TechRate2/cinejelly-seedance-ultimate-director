/**
 * Reference Vision Analyst — grounds the creative decision in the ACTUAL uploaded assets instead of
 * just their {role,label}. One structured multimodal LLM call that LOOKS at the uploaded image
 * references (product/face/scene) and returns a short concrete descriptor per image (palette, real
 * material, any logo/label text, subject appearance, lighting mood). The brief analyst then decides
 * style/palette/visual-world from what the product and person REALLY look like.
 *
 * Fail-open and bounded: only https image references are sent (the model must be able to fetch the
 * URL); any error or non-image/asset-only reference set returns an empty result, so the pipeline
 * falls back to today's label-only behavior. Only runs when there is at least one usable image, so
 * a text-only brief incurs zero extra cost.
 */

import type { LlmProvider } from "../providers/contracts.js";
import type { PromptReference } from "../types/prompt.js";
import type { ProviderMetadata } from "../types/provider.js";
import { isLocalHost } from "../utils/ssrf-guard.js";

const MAX_VISION_REFERENCES = 6;

const VISION_SCHEMA = {
  type: "object",
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "descriptor"],
        properties: {
          label: { type: "string" },
          descriptor: { type: "string" }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

interface VisionAssetJson {
  readonly label?: unknown;
  readonly descriptor?: unknown;
}
interface VisionJson {
  readonly assets?: readonly VisionAssetJson[];
}

export interface ReferenceVisualDescriptor {
  readonly label: string;
  readonly descriptor: string;
}

export class ReferenceVisionAnalyst {
  private readonly llmProvider: LlmProvider;
  private readonly modelId: string;

  public constructor(llmProvider: LlmProvider, modelId: string) {
    this.llmProvider = llmProvider;
    this.modelId = modelId;
  }

  public async describe(
    references: readonly PromptReference[],
    metadata: ProviderMetadata | undefined,
    signal?: AbortSignal
  ): Promise<readonly ReferenceVisualDescriptor[]> {
    const httpsImages = references
      .filter(
        (reference) =>
          reference.providerReference.kind === "image" &&
          typeof reference.providerReference.uri === "string" &&
          /^https:\/\//i.test(reference.providerReference.uri)
      )
      .slice(0, MAX_VISION_REFERENCES);
    // SSRF: the image URL is fetched server-side by the multimodal model. Never hand it an internal/
    // private host — skip any reference whose host is a loopback/private/link-local literal (incl.
    // CGNAT) (deep-audit: reference-URI SSRF). Synchronous literal check (admission already applies
    // the same at request time); a public domain that DNS-resolves to private is a documented residual
    // (follow-up: IP-pinned fetch). Fail-open: skipping just means no descriptor for that image.
    const images = httpsImages.filter((reference) => {
      try {
        return !isLocalHost(new URL(reference.providerReference.uri as string).hostname);
      } catch {
        return false;
      }
    });
    if (images.length === 0) {
      return [];
    }
    try {
      const response = await this.llmProvider.structured<VisionJson, typeof VISION_SCHEMA>(
        {
          modelId: this.modelId,
          instruction:
            "You are a product/scene visual analyst. For EACH attached reference image, return a SHORT concrete descriptor (one clause) of what it actually shows: dominant colors/palette, real material/finish, any readable logo or label text (quote it exactly), the subject's key appearance, and the lighting mood. Physical, camera-real wording only — never marketing adjectives. Match each descriptor to the asset's `label`. Return the SAME labels you were given.",
          schema: VISION_SCHEMA,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Describe each attached reference image. Return each asset's descriptor under its EXACT label (copy the label verbatim). Assets in order: ${images
                    .map((reference, index) => `image ${index + 1} — label "${reference.label}" (role: ${reference.role})`)
                    .join("; ")}.`
                },
                ...images.map((reference) => ({
                  type: "image_url" as const,
                  image_url: { url: reference.providerReference.uri as string }
                }))
              ]
            }
          ],
          metadata: {
            ...(metadata ?? {}),
            graphNodeId: "reference_vision"
          }
        },
        signal
      );
      return this.coerce(response.value, images);
    } catch {
      // Fail-open: vision grounding is an enhancer, never a blocker.
      return [];
    }
  }

  private coerce(
    value: VisionJson,
    images: readonly PromptReference[]
  ): readonly ReferenceVisualDescriptor[] {
    // Match on a NORMALIZED label so a role-prefixed or index-prefixed echo ("identity:Mai",
    // "1. Mai", 'Mai (identity)') still binds to the real label (cross-audit LOW #3). Map back to
    // the canonical label the pipeline uses so downstream lookups by label keep working.
    const normalize = (raw: string): string =>
      raw.toLowerCase().replace(/^\s*\d+[.)]\s*/, "").replace(/^[a-z_]+\s*:\s*/, "").replace(/[()"']/g, "").trim();
    const canonicalByNormalized = new Map(images.map((reference) => [normalize(reference.label), reference.label]));
    const out: ReferenceVisualDescriptor[] = [];
    const seen = new Set<string>();
    for (const asset of Array.isArray(value.assets) ? value.assets : []) {
      const rawLabel = typeof asset.label === "string" ? asset.label.trim() : "";
      const descriptor = typeof asset.descriptor === "string" ? asset.descriptor.trim() : "";
      const canonical = rawLabel ? canonicalByNormalized.get(normalize(rawLabel)) : undefined;
      if (!canonical || !descriptor || seen.has(canonical)) {
        continue;
      }
      seen.add(canonical);
      out.push({ label: canonical, descriptor: descriptor.slice(0, 300) });
    }
    return out;
  }
}
