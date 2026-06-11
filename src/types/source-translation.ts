/**
 * Source-translation contracts for tracking behavior faithfully translated from upstream snapshots.
 * These records describe provenance; production code still imports only CineJelly-owned modules.
 */

export type SourceRepositoryId =
  | "Emily2040/seedance-2.0"
  | "YouMind-OpenLab/awesome-seedance-2-prompts"
  | "HKUDS/ViMax"
  | "vericontext/vibeframe"
  | "HKUDS/VideoAgent"
  | "calesthio/OpenMontage"
  | "harry0703/MoneyPrinterTurbo"
  | "jiaminchen-1031/DirectorBench"
  | "Atlas Cloud"
  | "Other";

export type SourceLicenseKind =
  | "MIT"
  | "CC-BY-4.0"
  | "AGPL-3.0"
  | "NO-LICENSE-FOUND"
  | "MIXED"
  | "PROVIDER-DOCS"
  | "UNKNOWN";

export type SourceLogicValidationStatus =
  | "planned"
  | "reference-drafted"
  | "fidelity-reviewed"
  | "implemented"
  | "validated"
  | "blocked";

export interface SourceLogicTranslationInput {
  readonly logicName: string;
  readonly sourceRepository: SourceRepositoryId;
  readonly snapshotPath: string;
  readonly upstreamPaths: readonly string[];
  readonly upstreamCommit?: string;
  readonly license: SourceLicenseKind;
  readonly behaviorPreserved: readonly string[];
  readonly behaviorChanged: readonly string[];
  readonly referenceImplementationPath?: string;
  readonly cineJellyDestinationPaths: readonly string[];
  readonly validationStatus: SourceLogicValidationStatus;
  readonly fidelityRisks?: readonly string[];
  readonly attributionPath?: string;
}

export interface SourceLogicTranslationRecord extends SourceLogicTranslationInput {
  readonly id: string;
}
