/**
 * Enriches references with structured metadata derived from normalized source-video analysis.
 * This is CineJelly-owned deterministic logic; it does not perform video analysis or import upstream code.
 */

import type {
  PromptReference,
  PromptReferenceSelectionMetadata,
  ReferenceView
} from "../types/prompt.js";
import type {
  SourceVideoDeconstruction,
  SourceVideoKeyframe,
  SourceVideoSceneDeconstruction
} from "../types/source-video.js";

const MAX_SELECTION_ID_LENGTH = 160;

interface IndexedKeyframe {
  readonly scene: SourceVideoSceneDeconstruction;
  readonly sceneIndex: number;
  readonly keyframe: SourceVideoKeyframe;
  readonly keyframeIndex: number;
}

export interface SourceVideoReferenceMetadataEnrichmentInput {
  readonly references: readonly PromptReference[];
  readonly sourceVideoAnalysis?: SourceVideoDeconstruction;
}

export class SourceVideoReferenceMetadataEnricher {
  public enrich(input: SourceVideoReferenceMetadataEnrichmentInput): readonly PromptReference[] {
    const scenes = input.sourceVideoAnalysis?.scenes ?? [];
    if (scenes.length === 0) {
      return input.references;
    }

    const keyframesByUri = this.keyframesByUri(scenes);
    return input.references.map((reference) =>
      this.enrichReference({
        reference,
        sourceVideoAnalysis: input.sourceVideoAnalysis,
        scenes,
        keyframesByUri
      })
    );
  }

  private enrichReference(input: {
    readonly reference: PromptReference;
    readonly sourceVideoAnalysis: SourceVideoDeconstruction | undefined;
    readonly scenes: readonly SourceVideoSceneDeconstruction[];
    readonly keyframesByUri: ReadonlyMap<string, IndexedKeyframe>;
  }): PromptReference {
    const exactKeyframe = input.keyframesByUri.get(input.reference.providerReference.uri);
    if (exactKeyframe) {
      return this.mergeSelection(input.reference, this.selectionFromKeyframe(input.reference, exactKeyframe));
    }

    if (
      input.reference.role === "source_video_structure" &&
      input.sourceVideoAnalysis?.sourceReferenceLabel &&
      input.reference.label === input.sourceVideoAnalysis.sourceReferenceLabel
    ) {
      const firstScene = input.scenes[0];
      if (firstScene) {
        return this.mergeSelection(input.reference, this.selectionFromScene(firstScene, 0));
      }
    }

    return input.reference;
  }

  private keyframesByUri(
    scenes: readonly SourceVideoSceneDeconstruction[]
  ): ReadonlyMap<string, IndexedKeyframe> {
    const keyframes = new Map<string, IndexedKeyframe>();
    for (const [sceneIndex, scene] of scenes.entries()) {
      for (const [keyframeIndex, keyframe] of (scene.keyframes ?? []).entries()) {
        if (keyframe.uri && !keyframes.has(keyframe.uri)) {
          keyframes.set(keyframe.uri, {
            scene,
            sceneIndex,
            keyframe,
            keyframeIndex
          });
        }
      }
    }
    return keyframes;
  }

  private selectionFromScene(
    scene: SourceVideoSceneDeconstruction,
    sceneIndex: number
  ): PromptReferenceSelectionMetadata {
    const cameraId = this.selectionId(scene.camera);
    const compositionId = this.compositionId(scene);
    const selection: {
      cameraId?: string;
      compositionId?: string;
      timelineIndex: number;
      sourceSceneId: string;
    } = {
      timelineIndex: sceneIndex,
      sourceSceneId: scene.sceneId
    };
    if (cameraId) {
      selection.cameraId = cameraId;
    }
    if (compositionId) {
      selection.compositionId = compositionId;
    }
    return selection;
  }

  private selectionFromKeyframe(
    reference: PromptReference,
    keyframe: IndexedKeyframe
  ): PromptReferenceSelectionMetadata {
    const characterId = reference.role === "identity" ? this.selectionId(reference.label) : undefined;
    const view = this.inferView(`${reference.label} ${keyframe.keyframe.description}`);
    const cameraId = this.selectionId(keyframe.scene.camera);
    const compositionId = this.compositionId(keyframe.scene);
    const selection: {
      cameraId?: string;
      compositionId?: string;
      characterId?: string;
      view?: ReferenceView;
      timelineIndex: number;
      sourceSceneId: string;
      sourceShotId: string;
    } = {
      timelineIndex: keyframe.sceneIndex,
      sourceSceneId: keyframe.scene.sceneId,
      sourceShotId: `${keyframe.scene.sceneId}:keyframe:${keyframe.keyframeIndex}`
    };
    if (cameraId) {
      selection.cameraId = cameraId;
    }
    if (compositionId) {
      selection.compositionId = compositionId;
    }
    if (characterId) {
      selection.characterId = characterId;
    }
    if (view) {
      selection.view = view;
    }
    return selection;
  }

  private mergeSelection(
    reference: PromptReference,
    derived: PromptReferenceSelectionMetadata
  ): PromptReference {
    return {
      ...reference,
      selection: {
        ...derived,
        ...(reference.selection ?? {})
      }
    };
  }

  private compositionId(scene: SourceVideoSceneDeconstruction): string | undefined {
    const basis = [scene.camera, scene.visualStyle, scene.summary].filter((value): value is string => Boolean(value));
    return this.selectionId(basis.join(" "));
  }

  private selectionId(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, MAX_SELECTION_ID_LENGTH);
    return normalized || undefined;
  }

  private inferView(value: string): ReferenceView | undefined {
    const normalized = this.selectionId(value) ?? "";
    if (/(^|_)over(_the)?_shoulder($|_)/.test(normalized)) {
      return "over_the_shoulder";
    }
    if (/(^|_)three(_quarter|_quarters|_4)($|_)/.test(normalized)) {
      return "three_quarter";
    }
    if (/(^|_)front(al)?($|_)/.test(normalized)) {
      return "front";
    }
    if (/(^|_)side(_view)?($|_)/.test(normalized)) {
      return "side";
    }
    if (/(^|_)(back|rear)($|_)/.test(normalized)) {
      return "back";
    }
    return undefined;
  }
}
