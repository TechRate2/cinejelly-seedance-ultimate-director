/**
 * Reference binding helpers based on the documented Seedance Reference Cluster pattern.
 * They sort references by role priority so identity/product anchors appear before motion/style cues.
 */

import type { PromptReference, ReferenceRole } from "../types/prompt.js";
import type { ProviderReference } from "../types/provider.js";

const ROLE_PRIORITY: Record<ReferenceRole, number> = {
  identity: 0,
  product: 1,
  wardrobe: 2,
  first_frame: 3,
  last_frame: 4,
  environment: 5,
  motion: 6,
  camera: 7,
  audio_tempo: 8,
  voice: 9,
  style: 10,
  source_video_structure: 11
};

export function sortReferencesForPrompt(references: readonly PromptReference[]): readonly PromptReference[] {
  return [...references].sort((left, right) => {
    const roleDelta = ROLE_PRIORITY[left.role] - ROLE_PRIORITY[right.role];
    if (roleDelta !== 0) {
      return roleDelta;
    }
    if (left.priority !== right.priority) {
      return left.priority === "primary" ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

export function toProviderReferences(references: readonly PromptReference[]): readonly ProviderReference[] {
  return sortReferencesForPrompt(references).map((reference) => ({
    ...reference.providerReference,
    role: reference.role,
    label: reference.label
  }));
}

export function describeReferenceBindings(references: readonly PromptReference[]): readonly string[] {
  return sortReferencesForPrompt(references).map((reference) => {
    const assetLabel = reference.providerReference.providerAssetId
      ? `asset://${reference.providerReference.providerAssetId}`
      : reference.label;
    return `${reference.role}: use ${assetLabel} as ${reference.priority} reference`;
  });
}
