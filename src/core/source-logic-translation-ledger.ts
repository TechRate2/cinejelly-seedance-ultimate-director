/**
 * In-memory provenance ledger for source-derived behavior.
 * It keeps source lineage explicit without turning upstream snapshots into runtime dependencies.
 */

import type { SourceLogicTranslationInput, SourceLogicTranslationRecord } from "../types/source-translation.js";
import { createStableId } from "../utils/ids.js";

export class SourceLogicTranslationLedger {
  private readonly recordsById = new Map<string, SourceLogicTranslationRecord>();

  public constructor(initialRecords: readonly SourceLogicTranslationInput[] = []) {
    for (const record of initialRecords) {
      this.record(record);
    }
  }

  public record(input: SourceLogicTranslationInput): SourceLogicTranslationRecord {
    const normalized = normalizeTranslationInput(input);
    const id = createTranslationRecordId(normalized);
    const record: SourceLogicTranslationRecord = { ...normalized, id };

    const existing = this.recordsById.get(id);
    if (existing) {
      return existing;
    }

    this.recordsById.set(id, record);
    return record;
  }

  public list(): readonly SourceLogicTranslationRecord[] {
    return [...this.recordsById.values()].sort((left, right) => left.logicName.localeCompare(right.logicName));
  }

  public findById(id: string): SourceLogicTranslationRecord | undefined {
    return this.recordsById.get(id);
  }

  public findByLogicName(logicName: string): readonly SourceLogicTranslationRecord[] {
    const normalizedName = normalizeRequiredText(logicName, "logicName");
    return this.list().filter((record) => record.logicName === normalizedName);
  }
}

export function createTranslationRecordId(input: SourceLogicTranslationInput): string {
  const normalized = normalizeTranslationInput(input);
  return createStableId(
    "slt",
    [
      normalized.logicName,
      normalized.sourceRepository,
      normalized.snapshotPath,
      normalized.upstreamCommit ?? "",
      normalized.upstreamPaths.join("|"),
      normalized.cineJellyDestinationPaths.join("|")
    ].join("\n")
  );
}

function normalizeTranslationInput(input: SourceLogicTranslationInput): SourceLogicTranslationInput {
  const snapshotPath = normalizeRequiredText(input.snapshotPath, "snapshotPath");
  if (!isAllowedSourcePath(snapshotPath)) {
    throw new Error("Source translation snapshotPath must point to external/upstream or provider documentation.");
  }

  const destinations = normalizeRequiredTextList(input.cineJellyDestinationPaths, "cineJellyDestinationPaths");
  for (const destination of destinations) {
    if (isDisallowedProductionDestination(destination)) {
      throw new Error("Source translation destination paths must not point into external/upstream.");
    }
  }

  const upstreamCommit = normalizeOptionalText(input.upstreamCommit);
  const referenceImplementationPath = normalizeOptionalText(input.referenceImplementationPath);
  const fidelityRisks = normalizeOptionalTextList(input.fidelityRisks);
  const attributionPath = normalizeOptionalText(input.attributionPath);

  return {
    logicName: normalizeRequiredText(input.logicName, "logicName"),
    sourceRepository: input.sourceRepository,
    snapshotPath,
    upstreamPaths: normalizeRequiredTextList(input.upstreamPaths, "upstreamPaths"),
    license: input.license,
    behaviorPreserved: normalizeRequiredTextList(input.behaviorPreserved, "behaviorPreserved"),
    behaviorChanged: normalizeTextList(input.behaviorChanged),
    cineJellyDestinationPaths: destinations,
    validationStatus: input.validationStatus,
    ...(upstreamCommit ? { upstreamCommit } : {}),
    ...(referenceImplementationPath ? { referenceImplementationPath } : {}),
    ...(fidelityRisks ? { fidelityRisks } : {}),
    ...(attributionPath ? { attributionPath } : {})
  };
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Source translation ${fieldName} must be non-empty.`);
  }
  return trimmed;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRequiredTextList(values: readonly string[], fieldName: string): readonly string[] {
  const normalized = normalizeTextList(values);
  if (normalized.length === 0) {
    throw new Error(`Source translation ${fieldName} must contain at least one item.`);
  }
  return normalized;
}

function normalizeOptionalTextList(values: readonly string[] | undefined): readonly string[] | undefined {
  if (!values) {
    return undefined;
  }
  const normalized = normalizeTextList(values);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTextList(values: readonly string[]): readonly string[] {
  const normalized = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      normalized.add(trimmed);
    }
  }
  return [...normalized].sort((left, right) => left.localeCompare(right));
}

function isAllowedSourcePath(path: string): boolean {
  return path.startsWith("external/upstream/") || path.startsWith("docs/") || path.startsWith("https://");
}

function isDisallowedProductionDestination(path: string): boolean {
  return path === "external" || path.startsWith("external/") || path.includes("/external/upstream/");
}
