/**
 * Reference Selection Planner.
 * CineJelly-owned rewrite of ViMax-style reference selection: same camera/composition, recency,
 * duplicate suppression, one identity portrait per character/view, and max selected references.
 */

import type {
  ContinuityRisk,
  PromptReference,
  ReferenceRole,
  ReferenceSelectionCandidate,
  ReferenceSelectionDropReason,
  ReferenceSelectionPlan,
  ReferenceSelectionReasonCode,
  ShotContract
} from "../types/prompt.js";

const DEFAULT_MAX_SELECTED_REFERENCES = 8;

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

const ROLE_BASE_SCORE: Record<ReferenceRole, number> = {
  identity: 120,
  product: 115,
  wardrobe: 90,
  first_frame: 100,
  last_frame: 100,
  environment: 70,
  motion: 60,
  camera: 65,
  audio_tempo: 45,
  voice: 45,
  style: 35,
  source_video_structure: 30
};

export interface ReferenceSelectionPlanningInput {
  readonly shots: readonly ShotContract[];
  readonly maxSelectedReferences?: number;
}

export class ReferenceSelectionPlanner {
  public planForShots(input: ReferenceSelectionPlanningInput): readonly ShotContract[] {
    return input.shots.map((shot, shotIndex) => this.planForShot(shot, shotIndex, input.maxSelectedReferences));
  }

  public planForShot(
    shot: ShotContract,
    shotIndex: number,
    maxSelectedReferences = DEFAULT_MAX_SELECTED_REFERENCES
  ): ShotContract {
    const plan = this.buildPlan({
      shot,
      shotIndex,
      maxSelectedReferences
    });

    return {
      ...shot,
      references: plan.selectedReferences,
      referenceSelectionPlan: plan
    };
  }

  private buildPlan(input: {
    readonly shot: ShotContract;
    readonly shotIndex: number;
    readonly maxSelectedReferences: number;
  }): ReferenceSelectionPlan {
    const ranked = input.shot.references
      .map((reference, originalIndex) =>
        this.scoreCandidate({
          reference,
          originalIndex,
          shot: input.shot,
          shotIndex: input.shotIndex
        })
      )
      .sort((left, right) => this.compareCandidates(left, right));
    const selected: ReferenceSelectionCandidate[] = [];
    const dropped: ReferenceSelectionCandidate[] = [];
    const exactKeys = new Set<string>();
    const characterViewKeys = new Set<string>();

    for (const candidate of ranked) {
      const dropReason = this.dropReason({
        candidate,
        exactKeys,
        characterViewKeys,
        selectedCount: selected.length,
        maxSelectedReferences: input.maxSelectedReferences
      });

      if (dropReason) {
        dropped.push({
          ...candidate,
          selected: false,
          dropReason
        });
        continue;
      }

      exactKeys.add(this.exactReferenceKey(candidate.reference));
      const characterViewKey = this.identityCharacterViewKey(candidate.reference);
      if (characterViewKey) {
        characterViewKeys.add(characterViewKey);
      }
      selected.push({
        ...candidate,
        selected: true
      });
    }

    return {
      shotId: input.shot.shotId,
      maxSelectedReferences: input.maxSelectedReferences,
      candidateCount: ranked.length,
      selectedReferences: selected.map((candidate) => candidate.reference),
      candidates: [...selected, ...dropped]
    };
  }

  private scoreCandidate(input: {
    readonly reference: PromptReference;
    readonly originalIndex: number;
    readonly shot: ShotContract;
    readonly shotIndex: number;
  }): ReferenceSelectionCandidate {
    const scoreReasons = new Set<ReferenceSelectionReasonCode>(["role_priority", "stable_tiebreak"]);
    let score = ROLE_BASE_SCORE[input.reference.role];

    if (input.reference.priority === "primary") {
      score += 50;
      scoreReasons.add("primary_priority");
    }
    if (this.cameraMatches(input.reference.selection?.cameraId, input.shot.camera)) {
      score += 40;
      scoreReasons.add("same_camera");
    }
    if (this.compositionMatches(input.reference.selection?.compositionId, input.shot.metadata?.compositionId)) {
      score += 35;
      scoreReasons.add("same_composition");
    }
    const recencyScore = this.recencyScore(input.reference.selection?.timelineIndex, input.shotIndex);
    if (recencyScore > 0) {
      score += recencyScore;
      scoreReasons.add("recent_prior_frame");
    }
    if (this.hasRisk(input.shot.risks, "face") && input.reference.role === "identity") {
      score += 60;
      scoreReasons.add("identity_risk_anchor");
    }
    if (this.hasRisk(input.shot.risks, "product_logo") && input.reference.role === "product") {
      score += 60;
      scoreReasons.add("product_risk_anchor");
    }
    if (
      this.hasRisk(input.shot.risks, "transition") &&
      (input.reference.role === "first_frame" || input.reference.role === "last_frame")
    ) {
      score += 45;
      scoreReasons.add("transition_endpoint_anchor");
    }

    return {
      reference: input.reference,
      originalIndex: input.originalIndex,
      score,
      scoreReasons: [...scoreReasons],
      selected: false
    };
  }

  private dropReason(input: {
    readonly candidate: ReferenceSelectionCandidate;
    readonly exactKeys: ReadonlySet<string>;
    readonly characterViewKeys: ReadonlySet<string>;
    readonly selectedCount: number;
    readonly maxSelectedReferences: number;
  }): ReferenceSelectionDropReason | undefined {
    if (input.candidate.reference.selection?.authorized === false) {
      return "unauthorized_reference";
    }
    if (input.exactKeys.has(this.exactReferenceKey(input.candidate.reference))) {
      return "duplicate_exact_reference";
    }
    const characterViewKey = this.identityCharacterViewKey(input.candidate.reference);
    if (characterViewKey && input.characterViewKeys.has(characterViewKey)) {
      return "duplicate_character_view";
    }
    if (input.selectedCount >= input.maxSelectedReferences) {
      return "max_selected_references_exceeded";
    }
    return undefined;
  }

  private compareCandidates(left: ReferenceSelectionCandidate, right: ReferenceSelectionCandidate): number {
    const scoreDelta = right.score - left.score;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const roleDelta = ROLE_PRIORITY[left.reference.role] - ROLE_PRIORITY[right.reference.role];
    if (roleDelta !== 0) {
      return roleDelta;
    }
    const labelDelta = left.reference.label.localeCompare(right.reference.label);
    if (labelDelta !== 0) {
      return labelDelta;
    }
    return left.originalIndex - right.originalIndex;
  }

  private cameraMatches(cameraId: string | undefined, shotCamera: string): boolean {
    if (!cameraId) {
      return false;
    }
    return this.normalized(shotCamera).includes(this.normalized(cameraId));
  }

  private compositionMatches(compositionId: string | undefined, targetComposition: unknown): boolean {
    if (!compositionId || typeof targetComposition !== "string") {
      return false;
    }
    return this.normalized(compositionId) === this.normalized(targetComposition);
  }

  private recencyScore(timelineIndex: number | undefined, shotIndex: number): number {
    if (timelineIndex === undefined || timelineIndex >= shotIndex) {
      return 0;
    }
    return Math.max(1, 30 - (shotIndex - timelineIndex) * 3);
  }

  private hasRisk(risks: readonly ContinuityRisk[], risk: ContinuityRisk): boolean {
    return risks.includes(risk);
  }

  private identityCharacterViewKey(reference: PromptReference): string | undefined {
    if (reference.role !== "identity") {
      return undefined;
    }
    const characterId = reference.selection?.characterId;
    const view = reference.selection?.view;
    if (!characterId || !view) {
      return undefined;
    }
    return `${this.normalized(characterId)}:${view}`;
  }

  private exactReferenceKey(reference: PromptReference): string {
    return [
      reference.role,
      this.normalized(reference.label),
      reference.providerReference.kind,
      reference.providerReference.providerAssetId ?? reference.providerReference.uri
    ].join(":");
  }

  private normalized(value: string): string {
    return value
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .toLowerCase();
  }
}
