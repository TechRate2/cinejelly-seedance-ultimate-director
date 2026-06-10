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
  RenderInspectionInput,
  StoryboardInspectionInput
} from "../types/guardian.js";
import type { ShotContract } from "../types/prompt.js";
import type { StoryboardPanel } from "../types/storyboard.js";

export class ConsistencyGuardian {
  public inspectStoryboard(input: StoryboardInspectionInput): GuardianReport {
    const findings: GuardianFinding[] = [
      ...this.validateStoryboardCoverage(input),
      ...this.validateStoryboardPanels(input)
    ];

    return this.toReport(input.storyboard.projectId, "storyboard", findings);
  }

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

  private validateStoryboardCoverage(input: StoryboardInspectionInput): readonly GuardianFinding[] {
    const findings: GuardianFinding[] = [];
    const shotIds = new Set(input.shots.map((shot) => shot.shotId));
    const panelShotIds = new Set<string>();
    const duplicates = new Set<string>();

    for (const panel of input.storyboard.panels) {
      if (panelShotIds.has(panel.shotId)) {
        duplicates.add(panel.shotId);
      }
      panelShotIds.add(panel.shotId);
      if (!shotIds.has(panel.shotId)) {
        findings.push({
          stage: "storyboard",
          status: "block",
          severity: "S0",
          checkpoint: "storyboard_panel_unknown_shot",
          evidence: `Storyboard panel ${panel.panelId} references unknown shot ${panel.shotId}.`,
          repair: "Regenerate storyboard panels from the approved shot contract set before rendering."
        });
      }
    }

    for (const shot of input.shots) {
      if (!panelShotIds.has(shot.shotId)) {
        findings.push({
          stage: "storyboard",
          status: "block",
          severity: "S0",
          checkpoint: "storyboard_panel_missing",
          evidence: `Shot ${shot.shotId} has no storyboard panel.`,
          repair: "Generate a storyboard panel for every renderable shot before rendering."
        });
      }
    }

    for (const duplicate of duplicates) {
      findings.push({
        stage: "storyboard",
        status: "repair",
        severity: "S1",
        checkpoint: "storyboard_panel_duplicate",
        evidence: `Shot ${duplicate} appears in more than one storyboard panel.`,
        repair: "Deduplicate storyboard panels so each shot has exactly one panel."
      });
    }

    if (input.storyboard.panels.length !== input.shots.length) {
      findings.push({
        stage: "storyboard",
        status: "repair",
        severity: "S1",
        checkpoint: "storyboard_panel_count",
        evidence: `Storyboard has ${input.storyboard.panels.length} panel(s) for ${input.shots.length} shot(s).`,
        repair: "Regenerate storyboard coverage from the shot contract list."
      });
    }

    return findings;
  }

  private validateStoryboardPanels(input: StoryboardInspectionInput): readonly GuardianFinding[] {
    const findings: GuardianFinding[] = [];
    const shotsById = new Map(input.shots.map((shot) => [shot.shotId, shot]));
    const orderedPanels = [...input.storyboard.panels].sort((left, right) => left.order - right.order);

    for (const [index, panel] of orderedPanels.entries()) {
      const shot = shotsById.get(panel.shotId);
      if (!shot) {
        continue;
      }
      findings.push(...this.validateStoryboardPanel(panel, shot, index));
    }

    return findings;
  }

  private validateStoryboardPanel(
    panel: StoryboardPanel,
    shot: ShotContract,
    expectedOrder: number
  ): readonly GuardianFinding[] {
    const findings: GuardianFinding[] = [];

    if (panel.order !== expectedOrder) {
      findings.push({
        stage: "storyboard",
        status: "repair",
        severity: "S2",
        checkpoint: "storyboard_order",
        evidence: `Panel ${panel.panelId} has order ${panel.order}; expected ${expectedOrder}.`,
        repair: "Regenerate storyboard panel ordering from the timeline order."
      });
    }
    if (panel.durationSeconds !== shot.durationSeconds) {
      findings.push({
        stage: "storyboard",
        status: "repair",
        severity: "S1",
        checkpoint: "storyboard_duration",
        evidence: `Panel ${panel.panelId} duration ${panel.durationSeconds}s does not match shot ${shot.durationSeconds}s.`,
        repair: "Regenerate the storyboard panel from the approved shot contract duration."
      });
    }
    if (!panel.visualDescription.trim() || !panel.action.trim() || !panel.camera.trim() || !panel.lighting.trim()) {
      findings.push({
        stage: "storyboard",
        status: "repair",
        severity: "S1",
        checkpoint: "storyboard_panel_completeness",
        evidence: `Panel ${panel.panelId} is missing visual description, action, camera, or lighting.`,
        repair: "Regenerate the storyboard panel before prompt compilation."
      });
    }
    if (panel.action !== shot.action || panel.camera !== shot.camera || panel.lighting !== shot.lighting) {
      findings.push({
        stage: "storyboard",
        status: "repair",
        severity: "S1",
        checkpoint: "storyboard_contract_alignment",
        evidence: `Panel ${panel.panelId} does not match the approved action, camera, or lighting contract for ${shot.shotId}.`,
        repair: "Rebuild the panel directly from the shot contract to avoid prompt/render drift."
      });
    }
    if (this.referenceBindingKey(panel.referenceBindings) !== this.referenceBindingKey(shot.references)) {
      findings.push({
        stage: "storyboard",
        status: "repair",
        severity: "S1",
        checkpoint: "storyboard_reference_alignment",
        evidence: `Panel ${panel.panelId} reference bindings differ from shot ${shot.shotId}.`,
        repair: "Regenerate storyboard reference bindings from the approved shot references."
      });
    }
    if (shot.transitionIntent && panel.transitionIntent !== shot.transitionIntent) {
      findings.push({
        stage: "storyboard",
        status: "repair",
        severity: "S2",
        checkpoint: "storyboard_transition_alignment",
        evidence: `Panel ${panel.panelId} does not preserve the shot transition intent.`,
        repair: "Copy the approved transition intent into the storyboard panel before rendering."
      });
    }
    if (panel.inspectionFocus.length === 0) {
      findings.push({
        stage: "storyboard",
        status: "warn",
        severity: "S3",
        checkpoint: "storyboard_inspection_focus",
        evidence: `Panel ${panel.panelId} has no inspection focus items.`,
        repair: "Add inspection focus items so downstream Guardian checks remain actionable."
      });
    }

    return findings;
  }

  private referenceBindingKey(
    bindings: readonly { readonly role: string; readonly label: string; readonly priority: string }[]
  ): string {
    return bindings
      .map((binding) => `${binding.role}:${binding.label}:${binding.priority}`)
      .sort()
      .join("|");
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
