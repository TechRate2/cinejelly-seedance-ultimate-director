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

/** What the image ACTUALLY shows, judged from the pixels (NOT the slot the user put it in). */
export type DetectedReferenceKind =
  | "person_face"
  | "product_object"
  | "scene_environment"
  | "logo_text"
  | "style_board"
  | "unclear";

const DETECTED_KINDS: readonly DetectedReferenceKind[] = [
  "person_face", "product_object", "scene_environment", "logo_text", "style_board", "unclear"
];

const VISION_SCHEMA = {
  type: "object",
  required: ["assets"],
  properties: {
    assets: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "descriptor", "detectedKind"],
        properties: {
          label: { type: "string" },
          descriptor: { type: "string" },
          detectedKind: { type: "string", enum: [...DETECTED_KINDS] }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

interface VisionAssetJson {
  readonly label?: unknown;
  readonly descriptor?: unknown;
  readonly detectedKind?: unknown;
}
interface VisionJson {
  readonly assets?: readonly VisionAssetJson[];
}

export interface ReferenceVisualDescriptor {
  readonly label: string;
  readonly descriptor: string;
  /** Content classification from the pixels — used to catch a mis-slotted upload before spend. */
  readonly detectedKind?: DetectedReferenceKind;
}

export interface ReferenceRoleMismatch {
  readonly label: string;
  readonly declaredRole: string;
  readonly detectedKind: DetectedReferenceKind;
  /** Plain-Vietnamese message telling the customer which slot to fix. */
  readonly message: string;
}

/**
 * Compare each reference's DECLARED role (from the UI slot) against what the vision analyst SAW in the
 * pixels, and flag only the two HIGH-CONFIDENCE contradictions that waste a paid render: a product/
 * object sitting in the KOL/identity slot, and a human face sitting in the product slot. Other kinds
 * (scene/style/logo/unclear) are ambiguous and never flagged, so a legitimate upload is never blocked.
 */
export function reconcileReferenceRoles(
  references: readonly PromptReference[],
  descriptors: readonly ReferenceVisualDescriptor[]
): readonly ReferenceRoleMismatch[] {
  const kindByLabel = new Map(descriptors.filter((d) => d.detectedKind).map((d) => [d.label, d.detectedKind!]));
  // Labels are the ONLY join key between a reference and what the vision model saw — and nothing
  // upstream ever uniquifies customer/API-supplied labels. When two references share one label, a
  // descriptor cannot be attributed to either with confidence: binding it to both falsely blocked
  // a correctly-slotted paid job (product photo's kind attributed to the face sharing its label)
  // AND masked the real mis-slot (adversarial-audit #1). Ambiguous labels fail OPEN — never guess
  // with the customer's money.
  const labelCounts = new Map<string, number>();
  for (const reference of references) {
    labelCounts.set(reference.label, (labelCounts.get(reference.label) ?? 0) + 1);
  }
  const mismatches: ReferenceRoleMismatch[] = [];
  for (const reference of references) {
    if (reference.providerReference.kind !== "image") {
      continue;
    }
    if ((labelCounts.get(reference.label) ?? 0) > 1) {
      continue;
    }
    const detectedKind = kindByLabel.get(reference.label);
    if (!detectedKind) {
      continue;
    }
    const role = reference.role;
    if (role === "identity" && detectedKind === "product_object") {
      mismatches.push({
        label: reference.label,
        declaredRole: role,
        detectedKind,
        message: "Ảnh bạn để ở ô KOL (người) trông giống một SẢN PHẨM/ĐỒ VẬT, không phải mặt người. Có thể bạn để nhầm ô — hãy đưa ảnh sản phẩm sang ô Sản phẩm, và để ảnh MẶT người ở ô KOL, rồi tạo lại."
      });
    } else if (role === "product" && detectedKind === "person_face") {
      mismatches.push({
        label: reference.label,
        declaredRole: role,
        detectedKind,
        message: "Ảnh bạn để ở ô Sản phẩm trông giống MẶT NGƯỜI, không phải sản phẩm. Có thể bạn để nhầm ô — hãy đưa ảnh mặt sang ô KOL, và để ảnh SẢN PHẨM ở ô Sản phẩm, rồi tạo lại."
      });
    }
  }
  return mismatches;
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
            "You are a product/scene visual analyst. For EACH attached reference image return: (1) a SHORT concrete descriptor (one clause) of what it actually shows — dominant colors/palette, real material/finish, any readable logo or label text quoted exactly, the subject's key appearance, lighting mood; physical camera-real wording, never marketing adjectives. (2) `detectedKind` — classify what the image PRIMARILY shows, judging ONLY from the pixels, IGNORING the role you were told: person_face (a human face/person is the main subject) | product_object (a physical product/object/packaging is the main subject) | scene_environment (a location/room/background with no dominant single subject) | logo_text (mostly a logo/text/graphic) | style_board (a mood/reference collage) | unclear. Be honest even if it contradicts the stated role. Match each entry to the asset's `label`; return the SAME labels you were given.",
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
    // Two DIFFERENT labels can normalize to the same key ("product: Mai" and "Mai") — a last-wins
    // map then re-canonicalized one image's descriptor onto the OTHER reference's label, cross-
    // attributing content between references (adversarial-audit #1 variant). An ambiguous
    // normalized key binds to NO canonical label: losing a descriptor is fail-open; binding it to
    // the wrong reference poisons both the brief grounding and the role guard.
    const canonicalByNormalized = new Map<string, string>();
    const ambiguousNormalized = new Set<string>();
    for (const reference of images) {
      const key = normalize(reference.label);
      if (canonicalByNormalized.has(key) && canonicalByNormalized.get(key) !== reference.label) {
        ambiguousNormalized.add(key);
      }
      canonicalByNormalized.set(key, reference.label);
    }
    for (const key of ambiguousNormalized) {
      canonicalByNormalized.delete(key);
    }
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
      const detectedKind = DETECTED_KINDS.includes(asset.detectedKind as DetectedReferenceKind)
        ? (asset.detectedKind as DetectedReferenceKind)
        : undefined;
      out.push({ label: canonical, descriptor: descriptor.slice(0, 300), ...(detectedKind ? { detectedKind } : {}) });
    }
    return out;
  }
}
