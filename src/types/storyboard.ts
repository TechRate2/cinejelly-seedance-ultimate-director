/**
 * Storyboard contracts for the production planning stage.
 * Panels are text-first production artifacts derived from shot contracts before render spend.
 */

import type { PromptReference, ShotContinuity } from "./prompt.js";

export interface StoryboardPanel {
  readonly panelId: string;
  readonly shotId: string;
  readonly sceneId?: string;
  readonly beatId?: string;
  readonly order: number;
  readonly durationSeconds: number;
  readonly visualDescription: string;
  readonly action: string;
  readonly camera: string;
  readonly lighting: string;
  readonly continuity: ShotContinuity;
  readonly referenceBindings: readonly StoryboardReferenceBinding[];
  readonly transitionIntent?: string;
  readonly inspectionFocus: readonly string[];
}

export interface StoryboardReferenceBinding {
  readonly role: PromptReference["role"];
  readonly label: string;
  readonly priority: PromptReference["priority"];
}

export interface Storyboard {
  readonly projectId: string;
  readonly createdAt: Date;
  readonly panels: readonly StoryboardPanel[];
}
