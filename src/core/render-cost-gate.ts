/**
 * Render Cost Gate.
 * Extension based on VibeFrame/OpenMontage cost gates: estimate render spend before provider calls.
 * Provider prices come from runtime configuration, never from hardcoded assumptions.
 */

import type { RenderCostEstimate, CostEstimationSettings } from "../types/cost.js";
import type { CompiledPrompt } from "../types/prompt.js";
import type { ProviderReference } from "../types/provider.js";
import type { FlexibleSeedanceSettings } from "../types/settings.js";
import { candidateCountForQuality, repairAttemptCountForQuality } from "../config/seedance-settings.js";

export class RenderCostGate {
  private readonly settings: CostEstimationSettings;

  public constructor(settings: CostEstimationSettings) {
    this.settings = settings;
  }

  public estimate(input: {
    readonly compiledPrompts: readonly CompiledPrompt[];
    readonly settings: FlexibleSeedanceSettings;
    readonly plannedTestTakeCount?: number;
    readonly plannedTestTakeRenderSeconds?: number;
  }): RenderCostEstimate {
    const candidateCount = candidateCountForQuality(input.settings.qualityMode);
    const repairAttemptCount = repairAttemptCountForQuality(input.settings.qualityMode);
    const plannedTestTakeCount = input.plannedTestTakeCount ?? 0;
    const plannedTestTakeRenderSeconds = input.plannedTestTakeRenderSeconds ?? 0;
    const plannedSinglePassRenderSeconds = input.compiledPrompts.reduce(
      (sum, prompt) => sum + prompt.videoRequest.settings.durationSeconds,
      0
    );
    const plannedClipCount = input.compiledPrompts.length * (candidateCount + repairAttemptCount) + plannedTestTakeCount;
    const plannedCandidateRenderSeconds = plannedSinglePassRenderSeconds * candidateCount;
    const plannedRepairRenderSeconds = plannedSinglePassRenderSeconds * repairAttemptCount;
    const plannedRenderSeconds = plannedCandidateRenderSeconds + plannedRepairRenderSeconds + plannedTestTakeRenderSeconds;
    const referenceRegistrationCount = this.countRegisterableReferences(input.compiledPrompts);
    const estimatedRenderCostUsd = this.multiply(plannedRenderSeconds, this.settings.renderCostUsdPerSecond);
    const estimatedAssetRegistrationCostUsd = this.multiply(referenceRegistrationCount, this.settings.assetRegistrationCostUsd);
    const estimatedLlmCostUsd = this.settings.llmPlanCostUsd;
    const estimatedSubtotalUsd = this.sumDefined([
      estimatedRenderCostUsd,
      estimatedAssetRegistrationCostUsd,
      estimatedLlmCostUsd
    ]);
    const estimatedTotalCostUsd = estimatedSubtotalUsd === undefined
      ? undefined
      : this.roundMoney(estimatedSubtotalUsd * this.settings.costBufferMultiplier);
    const findings = this.findings({
      hasRenderRate: this.settings.renderCostUsdPerSecond !== undefined,
      plannedRenderSeconds,
      ...(input.settings.maxCostUsd !== undefined ? { maxCostUsd: input.settings.maxCostUsd } : {}),
      ...(estimatedTotalCostUsd !== undefined ? { estimatedTotalCostUsd } : {})
    });

    return {
      status: this.status(findings),
      plannedShotCount: input.compiledPrompts.length,
      candidateCount,
      repairAttemptCount,
      plannedTestTakeCount,
      plannedClipCount,
      plannedSinglePassRenderSeconds,
      plannedTestTakeRenderSeconds,
      plannedCandidateRenderSeconds,
      plannedRepairRenderSeconds,
      plannedRenderSeconds,
      referenceRegistrationCount,
      ...(estimatedRenderCostUsd !== undefined ? { estimatedRenderCostUsd } : {}),
      ...(estimatedAssetRegistrationCostUsd !== undefined ? { estimatedAssetRegistrationCostUsd } : {}),
      ...(estimatedLlmCostUsd !== undefined ? { estimatedLlmCostUsd } : {}),
      ...(estimatedTotalCostUsd !== undefined ? { estimatedTotalCostUsd } : {}),
      ...(input.settings.maxCostUsd !== undefined ? { maxCostUsd: input.settings.maxCostUsd } : {}),
      findings
    };
  }

  public assertWithinBudget(estimate: RenderCostEstimate): void {
    if (estimate.status !== "block") {
      return;
    }
    throw new Error(`Render cost gate blocked production. ${estimate.findings.join(" ")}`);
  }

  private findings(input: {
    readonly maxCostUsd?: number;
    readonly estimatedTotalCostUsd?: number;
    readonly hasRenderRate: boolean;
    readonly plannedRenderSeconds: number;
  }): readonly string[] {
    const findings: string[] = [];
    if (input.plannedRenderSeconds <= 0) {
      findings.push("No render seconds were planned.");
    }
    if (input.maxCostUsd !== undefined && !input.hasRenderRate) {
      findings.push("maxCostUsd is set but CINEJELLY_RENDER_COST_USD_PER_SECOND is not configured.");
    }
    if (
      input.maxCostUsd !== undefined &&
      input.estimatedTotalCostUsd !== undefined &&
      input.estimatedTotalCostUsd > input.maxCostUsd
    ) {
      findings.push(`Estimated cost ${input.estimatedTotalCostUsd} USD exceeds maxCostUsd ${input.maxCostUsd} USD.`);
    }
    if (input.maxCostUsd === undefined && input.estimatedTotalCostUsd === undefined) {
      findings.push("Cost rates are not configured; returning render-unit estimate without USD total.");
    }
    return findings;
  }

  private status(findings: readonly string[]): RenderCostEstimate["status"] {
    if (findings.some((finding) => finding.includes("No render seconds") || finding.includes("maxCostUsd") || finding.includes("exceeds"))) {
      return "block";
    }
    return findings.length > 0 ? "warn" : "pass";
  }

  private countRegisterableReferences(compiledPrompts: readonly CompiledPrompt[]): number {
    const keys = new Set<string>();
    for (const prompt of compiledPrompts) {
      for (const reference of prompt.videoRequest.references) {
        if (reference.providerAssetId || !this.requiresRegistration(reference)) {
          continue;
        }
        keys.add(`${reference.kind}:${reference.role ?? ""}:${reference.uri}`);
      }
    }
    return keys.size;
  }

  private requiresRegistration(reference: ProviderReference): boolean {
    if (reference.kind === "video" || reference.kind === "audio") {
      return true;
    }
    return Boolean(reference.role && ["motion", "camera", "source_video_structure", "audio_tempo", "voice"].includes(reference.role));
  }

  private multiply(count: number, unitCost: number | undefined): number | undefined {
    return unitCost === undefined ? undefined : this.roundMoney(count * unitCost);
  }

  private sumDefined(values: readonly (number | undefined)[]): number | undefined {
    const defined = values.filter((value): value is number => value !== undefined);
    return defined.length === 0 ? undefined : defined.reduce((sum, value) => sum + value, 0);
  }

  private roundMoney(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}
