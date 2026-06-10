/**
 * Consistency Guardian domain service.
 * It performs deterministic preflight and provider-output validation before deeper media inspection exists.
 */

import type {
  GuardianFinding,
  GuardianReport,
  GuardianSeverity,
  GuardianStatus,
  PreflightInput,
  RenderInspectionInput
} from "../types/guardian.js";
import type { ShotContract } from "../types/prompt.js";

export class ConsistencyGuardian {
  public preflight(input: PreflightInput): GuardianReport {
    const findings: GuardianFinding[] = [
      ...this.validateShotBasics(input.shot),
      ...this.validateReferences(input.shot),
      ...this.validateContinuity(input),
      ...this.validatePromptDensity(input.prompt, input.negativePrompt),
      ...this.validateTimeline(input.shot)
    ];

    return this.toReport(input.shot.shotId, "preflight", findings);
  }

  public inspectRender(input: RenderInspectionInput): GuardianReport {
    const findings: GuardianFinding[] = [];

    if (input.prediction.status !== "succeeded") {
      findings.push({
        stage: "render",
        status: "rerender",
        severity: "S1",
        checkpoint: "provider_status",
        evidence: `Prediction ended with status ${input.prediction.status}.`,
        repair: "Rerender the affected shot after checking provider error metadata."
      });
    }

    if (input.prediction.outputUrls.length === 0) {
      findings.push({
        stage: "render",
        status: "block",
        severity: "S0",
        checkpoint: "output_presence",
        evidence: "Provider response did not include a usable output URL.",
        repair: "Block delivery and resubmit the shot after provider diagnostics."
      });
    }

    if (input.prediction.latencyMs && input.prediction.latencyMs > 20 * 60 * 1000) {
      findings.push({
        stage: "render",
        status: "warn",
        severity: "S3",
        checkpoint: "latency",
        evidence: `Prediction latency was ${input.prediction.latencyMs}ms.`,
        repair: "Record latency for cost and provider-routing analysis."
      });
    }

    return this.toReport(input.shot.shotId, "render", findings);
  }

  public inspectTestTake(input: RenderInspectionInput): GuardianReport {
    const renderReport = this.inspectRender(input);
    return {
      ...renderReport,
      stage: "test_take",
      findings: renderReport.findings.map((finding) => ({
        ...finding,
        stage: "test_take"
      }))
    };
  }

  private validateShotBasics(shot: ShotContract): readonly GuardianFinding[] {
    const findings: GuardianFinding[] = [];

    if (shot.durationSeconds < 4 || shot.durationSeconds > 15) {
      findings.push({
        stage: "preflight",
        status: "block",
        severity: "S0",
        checkpoint: "duration",
        evidence: `Shot duration ${shot.durationSeconds}s is outside Seedance clip range.`,
        repair: "Split or resize the shot through smart chunking before rendering."
      });
    }
    if (!shot.intent.trim() || !shot.action.trim() || !shot.camera.trim()) {
      findings.push({
        stage: "preflight",
        status: "repair",
        severity: "S1",
        checkpoint: "shot_contract_completeness",
        evidence: "Shot contract is missing intent, action, or camera direction.",
        repair: "Regenerate the shot contract before compiling the prompt."
      });
    }
    return findings;
  }

  private validateReferences(shot: ShotContract): readonly GuardianFinding[] {
    const findings: GuardianFinding[] = [];
    const roles = new Set(shot.references.map((reference) => reference.role));

    if (shot.risks.includes("face") && !roles.has("identity")) {
      findings.push({
        stage: "preflight",
        status: "repair",
        severity: "S1",
        checkpoint: "identity_reference",
        evidence: "Face continuity risk exists but no identity reference is bound.",
        repair: "Bind an identity reference or lower the shot risk before rendering."
      });
    }
    if (shot.risks.includes("product_logo") && !roles.has("product")) {
      findings.push({
        stage: "preflight",
        status: "repair",
        severity: "S1",
        checkpoint: "product_reference",
        evidence: "Product/logo continuity risk exists but no product reference is bound.",
        repair: "Bind a product reference or redesign the shot to avoid logo-critical rendering."
      });
    }
    if (shot.transitionIntent && !roles.has("first_frame") && !roles.has("last_frame") && shot.risks.includes("transition")) {
      findings.push({
        stage: "preflight",
        status: "warn",
        severity: "S2",
        checkpoint: "transition_anchor",
        evidence: "Transition-critical shot lacks first/last-frame anchors.",
        repair: "Use endpoint anchors for high-consistency long-form transitions."
      });
    }
    return findings;
  }

  private validateContinuity(input: PreflightInput): readonly GuardianFinding[] {
    const findings: GuardianFinding[] = [];

    for (const character of input.ledger.characters) {
      const requiresCharacter = input.shot.continuity.identity?.includes(character.characterId);
      if (!requiresCharacter) {
        continue;
      }
      const labels = new Set(input.shot.references.map((reference) => reference.label));
      const missingLabels = character.requiredReferenceLabels.filter((label) => !labels.has(label));
      if (missingLabels.length > 0) {
        findings.push({
          stage: "preflight",
          status: "repair",
          severity: "S1",
          checkpoint: "character_bible_reference",
          evidence: `Missing character bible reference labels: ${missingLabels.join(", ")}.`,
          repair: "Attach required character bible references before rendering."
        });
      }
    }

    for (const style of input.ledger.styles) {
      const violatesRule = style.prohibitedDrift.some((rule) => input.prompt.toLowerCase().includes(rule.toLowerCase()));
      if (violatesRule) {
        findings.push({
          stage: "preflight",
          status: "repair",
          severity: "S2",
          checkpoint: "style_bible_drift",
          evidence: `Prompt contains language prohibited by style bible ${style.styleId}.`,
          repair: "Rewrite the prompt to preserve the approved visual style."
        });
      }
    }

    return findings;
  }

  private validatePromptDensity(prompt: string, negativePrompt: string): readonly GuardianFinding[] {
    const findings: GuardianFinding[] = [];
    if (prompt.length > 2500) {
      findings.push({
        stage: "preflight",
        status: "warn",
        severity: "S2",
        checkpoint: "prompt_density",
        evidence: `Prompt length is ${prompt.length} characters.`,
        repair: "Compress prompt to directorial essentials before rendering."
      });
    }
    if (negativePrompt.split(",").length > 12) {
      findings.push({
        stage: "preflight",
        status: "warn",
        severity: "S3",
        checkpoint: "negative_prompt_density",
        evidence: "Negative prompt contains more than 12 comma-separated constraints.",
        repair: "Keep only constraints tied to actual shot risks."
      });
    }
    return findings;
  }

  private validateTimeline(shot: ShotContract): readonly GuardianFinding[] {
    if (!shot.timeline || shot.timeline.length === 0) {
      return [];
    }
    const findings: GuardianFinding[] = [];
    for (const segment of shot.timeline) {
      if (segment.startSecond < 0 || segment.endSecond > shot.durationSeconds || segment.endSecond <= segment.startSecond) {
        findings.push({
          stage: "preflight",
          status: "repair",
          severity: "S1",
          checkpoint: "timeline_bounds",
          evidence: `Timeline segment ${segment.startSecond}-${segment.endSecond}s is outside shot duration ${shot.durationSeconds}s.`,
          repair: "Regenerate timeline segments within shot duration."
        });
      }
    }
    return findings;
  }

  private toReport(nodeId: string, stage: GuardianReport["stage"], findings: readonly GuardianFinding[]): GuardianReport {
    return {
      nodeId,
      stage,
      status: this.rollupStatus(findings),
      findings
    };
  }

  private rollupStatus(findings: readonly GuardianFinding[]): GuardianStatus {
    if (findings.some((finding) => finding.status === "block")) {
      return "block";
    }
    if (findings.some((finding) => finding.status === "rerender")) {
      return "rerender";
    }
    if (findings.some((finding) => finding.status === "repair")) {
      return "repair";
    }
    if (findings.some((finding) => finding.status === "warn")) {
      return "warn";
    }
    return "pass";
  }
}
