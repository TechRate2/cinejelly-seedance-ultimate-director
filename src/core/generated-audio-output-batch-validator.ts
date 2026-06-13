/**
 * Reconciles generated-audio execution plans with provider results before final audio mixing.
 * Inspired by MoneyPrinterTurbo staged audio artifacts and VibeFrame validation/report discipline.
 */

import type { GeneratedAudioIntent } from "../types/audio.js";
import type {
  GeneratedAudioExecutionItem,
  GeneratedAudioExecutionPlan,
  GeneratedAudioExecutionReadyItem
} from "../types/generated-audio-execution.js";
import type {
  GeneratedAudioOutputBatchValidationIssue,
  GeneratedAudioOutputBatchValidationIssueCode,
  GeneratedAudioOutputBatchValidationStatus,
  GeneratedAudioOutputValidationBatchReport,
  GeneratedAudioOutputValidationReport,
  GeneratedAudioOutputValidationSeverity
} from "../types/generated-audio-output.js";
import type { AudioGenerationResult } from "../types/provider.js";
import { GeneratedAudioOutputValidator } from "./generated-audio-output-validator.js";
import type { GeneratedAudioAssetResolverLike } from "./generated-audio-asset-resolver.js";

export interface GeneratedAudioOutputBatchValidatorInput {
  readonly intents: readonly GeneratedAudioIntent[];
  readonly executionPlan: GeneratedAudioExecutionPlan;
  readonly results: readonly AudioGenerationResult[];
}

export interface GeneratedAudioOutputBatchValidatorOptions {
  readonly assetResolver?: GeneratedAudioAssetResolverLike;
}

export class GeneratedAudioOutputBatchValidator {
  private readonly outputValidator: GeneratedAudioOutputValidator;

  public constructor(options: GeneratedAudioOutputBatchValidatorOptions = {}) {
    this.outputValidator = new GeneratedAudioOutputValidator(
      options.assetResolver ? { assetResolver: options.assetResolver } : {}
    );
  }

  public validate(input: GeneratedAudioOutputBatchValidatorInput): GeneratedAudioOutputValidationBatchReport {
    const issues: GeneratedAudioOutputBatchValidationIssue[] = [];
    const duplicateIntentIds = new Set<string>();
    const duplicatePlannedItemIds = new Set<string>();
    const intentById = this.indexIntents(input.intents, duplicateIntentIds, issues);
    const readyItems = input.executionPlan.items.filter(isReadyItem);
    const readyById = this.indexReadyItems(readyItems, duplicatePlannedItemIds, issues);
    const blockedIntentIds = new Set(
      input.executionPlan.items
        .filter((item) => item.status === "blocked")
        .map((item) => item.intentId)
    );
    const resultsByIntentId = this.groupResultsByIntentId(input.results);
    const reports: GeneratedAudioOutputValidationReport[] = [];

    this.recordUnexpectedResults(input.results, readyById, blockedIntentIds, issues);

    for (const plannedItem of readyItems) {
      if (duplicatePlannedItemIds.has(plannedItem.intentId)) {
        continue;
      }
      if (duplicateIntentIds.has(plannedItem.intentId)) {
        continue;
      }

      const intent = intentById.get(plannedItem.intentId);
      const matchingResults = resultsByIntentId.get(plannedItem.intentId) ?? [];

      if (!intent) {
        issues.push(this.issue(
          "missing_intent",
          plannedItem.intentId,
          "Generated-audio execution plan references an intent that is not present in the original intent list.",
          "Regenerate the generated-audio execution plan from the current postproduction asset plan."
        ));
        continue;
      }
      if (matchingResults.length === 0) {
        issues.push(this.issue(
          "missing_planned_result",
          plannedItem.intentId,
          "Generated-audio ready item is missing a provider result.",
          "Run or repair the matching generated-audio request before mixing."
        ));
        continue;
      }
      if (matchingResults.length > 1) {
        issues.push(this.issue(
          "duplicate_result",
          plannedItem.intentId,
          "Generated-audio ready item has multiple provider results.",
          "Keep exactly one reviewed provider result for the intent before mixing."
        ));
        continue;
      }
      const result = matchingResults[0];
      if (!result) {
        issues.push(this.issue(
          "missing_planned_result",
          plannedItem.intentId,
          "Generated-audio ready item is missing a provider result.",
          "Run or repair the matching generated-audio request before mixing."
        ));
        continue;
      }

      reports.push(this.outputValidator.validate({
        intent,
        plannedItem,
        result
      }));
    }

    const audioTracks = reports
      .map((report) => report.audioTrack)
      .filter((track): track is NonNullable<typeof track> => track !== undefined);
    const status = this.status({
      readyIntentCount: readyItems.length,
      resultCount: input.results.length,
      approvedTrackCount: audioTracks.length,
      issues,
      reports
    });

    return {
      status,
      intentCount: input.executionPlan.intentCount,
      readyIntentCount: readyItems.length,
      resultCount: input.results.length,
      approvedTrackCount: audioTracks.length,
      reviewRequiredReportCount: reports.filter((report) => report.status === "review_required").length,
      rejectedReportCount: reports.filter((report) => report.status === "rejected").length,
      missingResultCount: issues.filter((issue) => issue.code === "missing_planned_result").length,
      unexpectedResultCount: issues.filter((issue) =>
        issue.code === "unexpected_result" || issue.code === "result_for_blocked_intent"
      ).length,
      duplicateResultCount: issues.filter((issue) => issue.code === "duplicate_result").length,
      issueCount: issues.length,
      issues,
      reports,
      audioTracks
    };
  }

  private indexIntents(
    intents: readonly GeneratedAudioIntent[],
    duplicateIntentIds: Set<string>,
    issues: GeneratedAudioOutputBatchValidationIssue[]
  ): Map<string, GeneratedAudioIntent> {
    const intentById = new Map<string, GeneratedAudioIntent>();
    for (const intent of intents) {
      if (intentById.has(intent.intentId)) {
        duplicateIntentIds.add(intent.intentId);
        issues.push(this.issue(
          "duplicate_intent",
          intent.intentId,
          "Generated-audio intent list contains duplicate intent IDs.",
          "Deduplicate generated-audio intents before planning provider execution."
        ));
        continue;
      }
      intentById.set(intent.intentId, intent);
    }
    return intentById;
  }

  private indexReadyItems(
    readyItems: readonly GeneratedAudioExecutionReadyItem[],
    duplicatePlannedItemIds: Set<string>,
    issues: GeneratedAudioOutputBatchValidationIssue[]
  ): Map<string, GeneratedAudioExecutionReadyItem> {
    const readyById = new Map<string, GeneratedAudioExecutionReadyItem>();
    for (const item of readyItems) {
      if (readyById.has(item.intentId)) {
        duplicatePlannedItemIds.add(item.intentId);
        issues.push(this.issue(
          "duplicate_planned_item",
          item.intentId,
          "Generated-audio execution plan contains duplicate ready items for one intent.",
          "Regenerate the generated-audio execution plan so each intent has one execution item."
        ));
        continue;
      }
      readyById.set(item.intentId, item);
    }
    return readyById;
  }

  private groupResultsByIntentId(results: readonly AudioGenerationResult[]): Map<string, AudioGenerationResult[]> {
    const resultsByIntentId = new Map<string, AudioGenerationResult[]>();
    for (const result of results) {
      const existing = resultsByIntentId.get(result.intentId);
      if (existing) {
        existing.push(result);
      } else {
        resultsByIntentId.set(result.intentId, [result]);
      }
    }
    return resultsByIntentId;
  }

  private recordUnexpectedResults(
    results: readonly AudioGenerationResult[],
    readyById: ReadonlyMap<string, GeneratedAudioExecutionReadyItem>,
    blockedIntentIds: ReadonlySet<string>,
    issues: GeneratedAudioOutputBatchValidationIssue[]
  ): void {
    for (const result of results) {
      if (readyById.has(result.intentId)) {
        continue;
      }
      if (blockedIntentIds.has(result.intentId)) {
        issues.push(this.issue(
          "result_for_blocked_intent",
          result.intentId,
          "Generated-audio result was supplied for a blocked execution-plan item.",
          "Discard the result or regenerate the plan before provider execution."
        ));
        continue;
      }
      issues.push(this.issue(
        "unexpected_result",
        result.intentId,
        "Generated-audio result does not match any ready execution-plan item.",
        "Discard unexpected generated-audio results before mixing."
      ));
    }
  }

  private status(input: {
    readonly readyIntentCount: number;
    readonly resultCount: number;
    readonly approvedTrackCount: number;
    readonly issues: readonly GeneratedAudioOutputBatchValidationIssue[];
    readonly reports: readonly GeneratedAudioOutputValidationReport[];
  }): GeneratedAudioOutputBatchValidationStatus {
    if (input.readyIntentCount === 0 && input.resultCount === 0 && input.issues.length === 0) {
      return "not_requested";
    }

    const hasBlock = input.issues.some((issue) => issue.severity === "block") ||
      input.reports.some((report) => report.status === "rejected");
    const hasWarn = input.issues.some((issue) => issue.severity === "warn") ||
      input.reports.some((report) => report.status === "review_required");
    const hasIncompleteReadyItems = input.reports.length < input.readyIntentCount;

    if (input.approvedTrackCount > 0 && (hasBlock || hasWarn || hasIncompleteReadyItems)) {
      return "partially_approved";
    }
    if (hasBlock) {
      return "rejected";
    }
    if (hasWarn) {
      return "review_required";
    }
    return "approved";
  }

  private issue(
    code: GeneratedAudioOutputBatchValidationIssueCode,
    intentId: string,
    message: string,
    repair: string,
    severity: GeneratedAudioOutputValidationSeverity = "block"
  ): GeneratedAudioOutputBatchValidationIssue {
    return { code, severity, intentId, message, repair };
  }
}

function isReadyItem(item: GeneratedAudioExecutionItem): item is GeneratedAudioExecutionReadyItem {
  return item.status === "ready_for_provider";
}
