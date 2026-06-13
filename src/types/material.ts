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

export type MaterialSourceValidationStatus =
  | "planned_only"
  | "approved"
  | "review_required"
  | "rejected";

export type MaterialSourceValidationSeverity = "info" | "warn" | "block";

export type MaterialSourceValidationIssueCode =
  | "planned_only_no_candidates"
  | "unknown_brief"
  | "source_not_preferred"
  | "remote_source_not_allowed"
  | "unsafe_uri"
  | "rights_not_approved"
  | "attribution_missing"
  | "duration_missing"
  | "duration_too_short"
  | "aspect_ratio_mismatch"
  | "resolution_mismatch"
  | "too_many_selected_candidates";

export interface MaterialSourceValidationIssue {
  readonly code: MaterialSourceValidationIssueCode;
  readonly severity: MaterialSourceValidationSeverity;
  readonly message: string;
  readonly repair: string;
  readonly briefId?: string;
  readonly candidateId?: string;
}

export interface MaterialSourceValidationReport {
  readonly planId: string;
  readonly projectId: string;
  readonly status: MaterialSourceValidationStatus;
  readonly candidateCount: number;
  readonly selectedCandidateCount: number;
  readonly approvedCandidateCount: number;
  readonly rejectedCandidateCount: number;
  readonly candidates: readonly MaterialCandidate[];
  readonly issues: readonly MaterialSourceValidationIssue[];
}

export interface MaterialSourceAdapterInput {
  readonly plan: MaterialSourcingPlan;
  readonly briefs?: readonly MaterialSourcingBrief[];
  readonly signal?: AbortSignal;
}

export interface MaterialSourceAdapter {
  readonly adapterId: string;
  readonly source: MaterialSource;
  resolve(input: MaterialSourceAdapterInput): Promise<readonly MaterialCandidate[]>;
}

export interface LocalMaterialCatalogEntry {
  readonly assetId: string;
  readonly label: string;
  readonly assetUri: string;
  readonly source: Extract<MaterialSource, "local_library" | "user_provided">;
  readonly purposes?: readonly MaterialPurpose[];
  readonly tags?: readonly string[];
  readonly durationSeconds?: number;
  readonly aspectRatio?: AspectRatio;
  readonly resolution?: Resolution;
  readonly rightsStatus: MaterialRightsStatus;
  readonly attribution?: string;
  readonly contentHash?: string;
}

export interface LocalMaterialCatalog {
  readonly catalogId?: string;
  readonly entries: readonly LocalMaterialCatalogEntry[];
}

export interface MaterialSourcingPlan {
  readonly planId: string;
  readonly projectId: string;
  readonly sourcePatternOrigins: readonly string[];
  readonly briefs: readonly MaterialSourcingBrief[];
}
