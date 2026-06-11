import type { AspectRatio, Resolution } from "./settings.js";

export type MaterialSource =
  | "user_provided"
  | "local_library"
  | "pexels"
  | "pixabay"
  | "coverr"
  | "paid_stock"
  | "atlas_asset_library";

export type MaterialPurpose =
  | "reference_plate"
  | "stock_insert"
  | "b_roll"
  | "product_plate"
  | "audio_bed"
  | "subtitle_asset";

export type MaterialRightsRequirement =
  | "user_owned"
  | "commercial_stock"
  | "attribution_required"
  | "internal_reference_only";

export type MaterialRightsStatus =
  | "unverified"
  | "approved"
  | "requires_attribution"
  | "rejected";

export interface MaterialSearchTerm {
  readonly term: string;
  readonly weight: number;
  readonly reason: string;
}

export interface MaterialSourcingBrief {
  readonly briefId: string;
  readonly projectId: string;
  readonly shotId?: string;
  readonly sceneId?: string;
  readonly purpose: MaterialPurpose;
  readonly queryTerms: readonly MaterialSearchTerm[];
  readonly preferredSources: readonly MaterialSource[];
  readonly aspectRatio: AspectRatio;
  readonly resolution: Resolution;
  readonly minimumDurationSeconds: number;
  readonly targetDurationSeconds: number;
  readonly maxCandidates: number;
  readonly rightsRequirement: MaterialRightsRequirement;
  readonly allowRemoteSources: boolean;
}

export interface MaterialCandidate {
  readonly candidateId: string;
  readonly briefId: string;
  readonly source: MaterialSource;
  readonly uri: string;
  readonly durationSeconds?: number;
  readonly aspectRatio?: AspectRatio;
  readonly resolution?: Resolution;
  readonly rightsStatus: MaterialRightsStatus;
  readonly attribution?: string;
  readonly contentHash?: string;
  readonly selected: boolean;
  readonly rejectionReason?: string;
}

export interface MaterialSourcingPlan {
  readonly planId: string;
  readonly projectId: string;
  readonly sourcePatternOrigins: readonly string[];
  readonly briefs: readonly MaterialSourcingBrief[];
}
