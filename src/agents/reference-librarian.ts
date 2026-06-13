/**
 * Reference Librarian validates and normalizes user-supplied references before any LLM or render spend.
 * It preserves Atlas-compatible role binding while blocking obvious credential leakage through reference URIs.
 */

import type { PromptReference, PromptReferenceSelectionMetadata, ReferenceRole, ReferenceView } from "../types/prompt.js";
import type { ProviderReference, ReferenceKind } from "../types/provider.js";

const REFERENCE_ROLES: readonly ReferenceRole[] = [
  "identity",
  "product",
  "wardrobe",
  "environment",
  "motion",
  "camera",
  "audio_tempo",
  "voice",
  "style",
  "first_frame",
  "last_frame",
  "source_video_structure"
];

const REFERENCE_KINDS: readonly ReferenceKind[] = [
  "image",
  "video",
  "audio",
  "first_frame",
  "last_frame",
  "identity",
  "product",
  "environment",
  "motion",
  "camera",
  "style"
];

const ROLE_COMPATIBILITY: Record<ReferenceRole, readonly ReferenceKind[]> = {
  identity: ["image", "video", "identity", "first_frame"],
  product: ["image", "video", "product", "first_frame"],
  wardrobe: ["image", "video", "identity", "style"],
  environment: ["image", "video", "environment", "first_frame"],
  motion: ["video", "motion"],
  camera: ["video", "camera", "motion"],
  audio_tempo: ["audio"],
  voice: ["audio"],
  style: ["image", "video", "style"],
  first_frame: ["image", "first_frame"],
  last_frame: ["image", "last_frame"],
  source_video_structure: ["video"]
};

const REFERENCE_VIEWS: readonly ReferenceView[] = [
  "front",
  "side",
  "back",
  "three_quarter",
  "over_the_shoulder",
  "unknown"
];
const MAX_SELECTION_TEXT_LENGTH = 160;
const SECRET_QUERY_KEY_PATTERN = /(?:api[_-]?key|access[_-]?key|token|secret|signature|password|credential|auth)/i;
const SENSITIVE_FILE_PATTERN = /(?:^|[\\/])(?:\.env(?:\.|$)|id_rsa$|id_dsa$|id_ecdsa$|id_ed25519$|.*private[_-]?key.*|.*\.(?:pem|p12|pfx|key)$)/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export interface ReferenceLibrarianInput {
  readonly projectId: string;
  readonly references: readonly unknown[];
}

export class ReferenceLibrarian {
  public normalize(input: ReferenceLibrarianInput): readonly PromptReference[] {
    const normalized: PromptReference[] = [];
    const seen = new Set<string>();

    for (const [index, reference] of input.references.entries()) {
      const promptReference = this.normalizeReference(reference, index);
      const key = this.dedupeKey(promptReference);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(promptReference);
    }

    return normalized.sort((left, right) => this.roleOrder(left.role) - this.roleOrder(right.role));
  }

  private normalizeReference(reference: unknown, index: number): PromptReference {
    const payload = this.objectPayload(reference, `Reference ${index + 1} must be an object.`);
    const providerReference = this.normalizeProviderReference(payload.providerReference, index);
    const role = this.normalizeRole(payload.role, providerReference.kind);
    this.assertCompatible(role, providerReference.kind, index);

    const label = this.cleanString(payload.label) || `${role}_${index + 1}`;
    const priority = payload.priority === "supporting" ? "supporting" : "primary";
    const selection = this.normalizeSelection(payload.selection, index);

    return {
      role,
      label,
      priority,
      ...(selection ? { selection } : {}),
      providerReference: {
        ...providerReference,
        role,
        label
      }
    };
  }

  private normalizeSelection(value: unknown, index: number): PromptReferenceSelectionMetadata | undefined {
    if (value === undefined) {
      return undefined;
    }
    const payload = this.objectPayload(value, `Reference ${index + 1} selection must be an object.`);
    const cameraId = this.boundedCleanString(payload.cameraId, "cameraId", index);
    const compositionId = this.boundedCleanString(payload.compositionId, "compositionId", index);
    const characterId = this.boundedCleanString(payload.characterId, "characterId", index);
    const sourceShotId = this.boundedCleanString(payload.sourceShotId, "sourceShotId", index);
    const sourceSceneId = this.boundedCleanString(payload.sourceSceneId, "sourceSceneId", index);
    const view = this.normalizeSelectionView(payload.view, index);
    const timelineIndex = this.normalizeTimelineIndex(payload.timelineIndex, index);
    const authorized = this.normalizeAuthorized(payload.authorized, index);
    const selection: Partial<PromptReferenceSelectionMetadata> = {
      ...(cameraId ? { cameraId } : {}),
      ...(compositionId ? { compositionId } : {}),
      ...(characterId ? { characterId } : {}),
      ...(sourceShotId ? { sourceShotId } : {}),
      ...(sourceSceneId ? { sourceSceneId } : {}),
      ...(view ? { view } : {}),
      ...(timelineIndex !== undefined ? { timelineIndex } : {}),
      ...(authorized !== undefined ? { authorized } : {})
    };

    return Object.keys(selection).length > 0 ? selection : undefined;
  }

  private normalizeProviderReference(value: unknown, index: number): ProviderReference {
    const payload = this.objectPayload(value, `Reference ${index + 1} must include providerReference.`);
    const uri = this.cleanString(payload.uri);
    const providerAssetId = this.cleanString(payload.providerAssetId);
    if (!uri) {
      throw new Error(`Reference ${index + 1} must include a non-empty providerReference.uri.`);
    }
    this.assertSafeReferenceUri(uri, index);

    return {
      kind: this.normalizeKind(payload.kind, uri),
      uri,
      ...(providerAssetId ? { providerAssetId } : {})
    };
  }

  private normalizeRole(value: unknown, kind: ReferenceKind): ReferenceRole {
    if (typeof value === "string" && REFERENCE_ROLES.includes(value as ReferenceRole)) {
      return value as ReferenceRole;
    }
    switch (kind) {
      case "audio":
        return "audio_tempo";
      case "video":
      case "motion":
      case "camera":
        return "motion";
      case "first_frame":
        return "first_frame";
      case "last_frame":
        return "last_frame";
      case "product":
        return "product";
      case "environment":
        return "environment";
      case "style":
        return "style";
      case "identity":
      case "image":
        return "identity";
    }
  }

  private normalizeKind(value: unknown, uri: string): ReferenceKind {
    if (typeof value === "string" && REFERENCE_KINDS.includes(value as ReferenceKind)) {
      return value as ReferenceKind;
    }
    const lowerUri = uri.toLowerCase();
    if (/\.(?:mp4|mov|webm|mkv|avi|m4v)(?:$|[?#])/.test(lowerUri)) {
      return "video";
    }
    if (/\.(?:mp3|wav|m4a|aac|flac|ogg)(?:$|[?#])/.test(lowerUri)) {
      return "audio";
    }
    return "image";
  }

  private assertCompatible(role: ReferenceRole, kind: ReferenceKind, index: number): void {
    if (ROLE_COMPATIBILITY[role].includes(kind)) {
      return;
    }
    throw new Error(
      `Reference ${index + 1} role ${role} is incompatible with providerReference.kind ${kind}.`
    );
  }

  private assertSafeReferenceUri(uri: string, index: number): void {
    if (CONTROL_CHARACTER_PATTERN.test(uri)) {
      throw new Error(`Reference ${index + 1} URI contains control characters.`);
    }
    if (SENSITIVE_FILE_PATTERN.test(uri)) {
      throw new Error(`Reference ${index + 1} URI points to a sensitive credential-like file.`);
    }

    try {
      const parsed = new URL(uri);
      if (!["https:", "asset:"].includes(parsed.protocol)) {
        throw new Error(`Reference ${index + 1} URI must use https or asset://.`);
      }
      if (parsed.username || parsed.password) {
        throw new Error(`Reference ${index + 1} URI must not contain embedded credentials.`);
      }
      if (parsed.protocol === "asset:" && (parsed.search || parsed.hash)) {
        throw new Error(`Reference ${index + 1} asset:// URI must not include query strings or fragments.`);
      }
      for (const key of parsed.searchParams.keys()) {
        if (SECRET_QUERY_KEY_PATTERN.test(key)) {
          throw new Error(`Reference ${index + 1} URI query contains credential-like parameter ${key}.`);
        }
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Reference ${index + 1} URI must be an absolute HTTPS URL or asset:// reference.`);
      }
      throw error;
    }
  }

  private objectPayload(value: unknown, message: string): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    throw new Error(message);
  }

  private cleanString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private boundedCleanString(value: unknown, fieldName: string, index: number): string | undefined {
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`Reference ${index + 1} selection.${fieldName} must be a string.`);
    }
    const cleaned = this.cleanString(value);
    if (cleaned === undefined) {
      return undefined;
    }
    if (cleaned.length > MAX_SELECTION_TEXT_LENGTH) {
      throw new Error(`Reference ${index + 1} selection.${fieldName} cannot exceed ${MAX_SELECTION_TEXT_LENGTH} characters.`);
    }
    return cleaned;
  }

  private normalizeSelectionView(value: unknown, index: number): ReferenceView | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value === "string" && REFERENCE_VIEWS.includes(value as ReferenceView)) {
      return value as ReferenceView;
    }
    throw new Error(`Reference ${index + 1} selection.view must be one of: ${REFERENCE_VIEWS.join(", ")}.`);
  }

  private normalizeTimelineIndex(value: unknown, index: number): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
    throw new Error(`Reference ${index + 1} selection.timelineIndex must be a non-negative integer.`);
  }

  private normalizeAuthorized(value: unknown, index: number): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value === "boolean") {
      return value;
    }
    throw new Error(`Reference ${index + 1} selection.authorized must be a boolean.`);
  }

  private roleOrder(role: ReferenceRole): number {
    return REFERENCE_ROLES.indexOf(role);
  }

  private dedupeKey(reference: PromptReference): string {
    return [
      reference.role,
      reference.label.toLowerCase(),
      reference.providerReference.kind,
      reference.providerReference.providerAssetId ?? reference.providerReference.uri
    ].join(":");
  }
}
