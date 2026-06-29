/**
 * Seedance Prompt Compiler.
 * It converts Production Graph shot contracts into compact directorial prompts and provider-neutral video requests.
 */

import { toVideoGenerationSettings } from "../config/seedance-settings.js";
import type {
  CompiledPrompt,
  PromptBindingPlan,
  PromptCompilerInput,
  ShotContract,
  TimelineSegment
} from "../types/prompt.js";
import type { ProviderMode } from "../types/provider.js";
import { buildNegativePrompt } from "./negative-constraints.js";
import { buildPromptBindingPlan, describeReferenceBindingsFromPlan } from "./reference-binding.js";
import { buildRepairHints } from "./repair-hints.js";

export class SeedancePromptCompiler {
  public compile(input: PromptCompilerInput): CompiledPrompt {
    const referencesForBinding = input.shot.referenceSelectionPlan?.selectedReferences ?? input.shot.references;
    const bindingPlan = buildPromptBindingPlan({
      references: referencesForBinding,
      risks: input.shot.risks,
      ...(input.providerSupportedReferenceKinds
        ? { providerSupportedReferenceKinds: input.providerSupportedReferenceKinds }
        : {}),
      ...(input.maxProviderReferences !== undefined ? { maxProviderReferences: input.maxProviderReferences } : {})
    });
    const providerMode = this.resolveMode(bindingPlan);
    const prompt = this.buildPrompt(input.shot, bindingPlan, providerMode);
    const negativePrompt = buildNegativePrompt(input.shot);
    const references = bindingPlan.providerReferences;
    const videoRequest = {
      provider: input.provider,
      modelId: input.modelId,
      mode: providerMode,
      prompt,
      negativePrompt,
      references,
      settings: toVideoGenerationSettings(input.settings, input.shot.durationSeconds),
      ...(input.shot.metadata ? { metadata: input.shot.metadata } : {})
    };

    return {
      shotId: input.shot.shotId,
      prompt,
      negativePrompt,
      references,
      ...(input.shot.referenceSelectionPlan ? { referenceSelectionPlan: input.shot.referenceSelectionPlan } : {}),
      bindingPlan,
      inspectionExpectations: this.buildInspectionExpectations(input.shot, bindingPlan),
      repairHints: buildRepairHints(input.shot),
      videoRequest
    };
  }

  private buildPrompt(shot: ShotContract, bindingPlan: PromptBindingPlan, providerMode: ProviderMode): string {
    const sections = [
      `Shot ${shot.shotId}, ${shot.durationSeconds}s.`,
      `Intent: ${shot.intent}.`,
      this.buildReferenceSection(bindingPlan),
      this.buildProviderModeContractSection(providerMode, bindingPlan),
      this.buildContinuitySection(shot),
      this.buildPacingSection(shot),
      this.buildMotionContinuitySection(shot, bindingPlan),
      this.buildInterShotBridgeSection(shot),
      `Scene subject: ${shot.subject}.`,
      `Action: ${shot.action}.`,
      `Camera: ${shot.camera}.`,
      `Lighting: ${shot.lighting}.`,
      shot.style ? `Style: ${shot.style}.` : undefined,
      shot.timeline && shot.timeline.length > 0 ? this.buildTimelineSection(shot.timeline) : undefined,
      shot.audioIntent ? `Audio: ${shot.audioIntent}.` : undefined,
      shot.transitionIntent ? `Transition: ${shot.transitionIntent}.` : undefined,
      this.buildFinalFrameSection(shot, bindingPlan),
      "Keep the result cinematic, coherent, and physically plausible."
    ];

    return sections.filter((section): section is string => Boolean(section && section.trim())).join("\n");
  }

  private buildProviderModeContractSection(mode: ProviderMode, bindingPlan: PromptBindingPlan): string {
    const providerReferenceSummary = bindingPlan.providerReferences.length > 0
      ? bindingPlan.providerReferences.map((reference, index) => {
          const role = reference.role ?? reference.kind;
          const label = reference.label ? `=${reference.label}` : "";
          return `${index + 1}:${role}/${reference.kind}${label}`;
        }).join("; ")
      : "none";
    const roles = new Set([
      ...bindingPlan.sortedReferences.flatMap((reference) => [reference.role, reference.providerReference.kind]),
      ...bindingPlan.providerReferences.flatMap((reference) =>
        [reference.kind, reference.role].filter((value): value is string => Boolean(value))
      )
    ]);
    const planningOnlyReferences = bindingPlan.roleScopes.filter((reference) => !reference.providerIncluded);
    const lines = [
      `Seedance mode contract: ${this.providerModeLabel(mode)}.`,
      `Provider reference map: ${providerReferenceSummary}.`,
      planningOnlyReferences.length > 0
        ? `Planning-only references: ${planningOnlyReferences.map((reference) => `${reference.role}/${reference.label} (${reference.providerFilterReason ?? "not sent to provider"})`).join("; ")}; use them only as prompt/scenario constraints, not as provider media inputs.`
        : undefined,
      mode !== "text_to_video"
        ? "Reference tag syntax: when the provider exposes @image/@video/@audio handles, bind each handle by the listed role/order before prose; never reuse a handle for an unlisted role."
        : undefined,
      ...this.providerModeRules(mode),
      roles.has("identity") ? "Identity priority: KOL/character face, hair, body presence, and eye-line stay locked before style, motion, or camera references are applied." : undefined,
      roles.has("product") ? "Product priority: product geometry, packaging, label/logo placement, material, and scale stay locked before camera, lighting, or style changes." : undefined,
      roles.has("first_frame") || roles.has("last_frame")
        ? "Endpoint priority: first-frame and last-frame references define the clip handles for chaining; motion must move between them without warping identity or product details."
        : undefined,
      roles.has("source_video_structure") || roles.has("video") || roles.has("motion") || roles.has("camera")
        ? "Source/reference-video boundary: transfer only structure, beat timing, camera grammar, motion rhythm, acting energy, and endpoint framing; replace faces, products, setting, transcript wording, music, brand marks, claims, and CTA with approved user inputs."
        : undefined,
      roles.has("audio") || roles.has("audio_tempo") || roles.has("voice")
        ? "Audio reference boundary: use audio/voice references only for tempo, mood, and approved voice character; do not copy protected music, melody, or unapproved voice likeness."
        : undefined
    ].filter((line): line is string => Boolean(line));
    return lines.join(" ");
  }

  private providerModeRules(mode: ProviderMode): readonly string[] {
    switch (mode) {
      case "text_to_video":
        return [
          "Text-to-video rule: no media reference will be sent, so the prompt must be fully self-contained with subject, action, camera, lighting, physical motion, audio intent, and final frame.",
          "Do not invent a specific KOL likeness, exact product packaging, logo, source-video scene, or protected style that was not supplied by the shot contract."
        ];
      case "image_to_video":
        return [
          "Image-to-video rule: treat supplied image references as identity/product/endpoint anchors, not generic mood boards.",
          "Add controlled camera and body/product motion while preserving the anchor's geometry, pose logic, lighting direction, and recognizable details."
        ];
      case "reference_to_video":
        return [
          "Reference-to-video rule: separate every reference by role, then apply identity/product/endpoints first, environment second, camera/motion/audio/style last.",
          "If multiple references conflict, preserve approved KOL identity and product fidelity before trend style, source-video energy, or cinematic polish."
        ];
      case "video_to_video":
        return [
          "Video-to-video rule: use the source video only as the editable base and keep all edits scoped to the shot contract.",
          "Preserve continuity handles and replace any unapproved subject, product, text, logo, music, or claim."
        ];
      case "extend":
        return [
          "Extend rule: continue naturally from the supplied endpoint, matching motion direction, scale, lighting, room tone, and subject/product state.",
          "Do not restart the action, jump to a new scene, or introduce a new character/product identity unless the shot contract requires it."
        ];
      case "edit":
        return [
          "Edit rule: change only the requested subject/action/setting detail while keeping all untouched identity, product, camera, light, and endpoint continuity stable.",
          "Do not rewrite the shot into a new concept."
        ];
    }
  }

  private providerModeLabel(mode: ProviderMode): string {
    switch (mode) {
      case "text_to_video":
        return "text-to-video";
      case "image_to_video":
        return "image-to-video";
      case "reference_to_video":
        return "reference-to-video";
      case "video_to_video":
        return "video-to-video";
      case "extend":
        return "extend";
      case "edit":
        return "edit";
    }
  }

  private buildPacingSection(shot: ShotContract): string {
    const role = this.storyArcRole(shot);
    const hasTimeline = Boolean(shot.timeline?.length);
    return [
      `Pacing contract: use the full ${shot.durationSeconds}s for a complete ${role} beat with a clear opening, middle action, and ending state.`,
      this.wholeVideoArcLine(shot, role),
      "Do not collapse the shot into one static product macro, one hand pose, or an unfinished setup.",
      hasTimeline
        ? "Follow the time-coded timeline exactly; each segment must add new visual information."
        : "Create at least three visible state changes: first-frame hook, action/proof, and settled endpoint."
    ].filter((line): line is string => Boolean(line)).join(" ");
  }

  private buildMotionContinuitySection(shot: ShotContract, bindingPlan: PromptBindingPlan): string {
    const role = this.storyArcRole(shot);
    const referenceRoles = new Set(bindingPlan.providerReferences.map((reference) => reference.role ?? reference.kind));
    const continuityPriority = [
      referenceRoles.has("identity") ? "preserve KOL/character identity before changing pose or expression" : undefined,
      referenceRoles.has("product") ? "preserve product geometry, packaging, logo placement, and scale before style or camera motion" : undefined,
      referenceRoles.has("environment") ? "keep the set/background spatially stable unless the action moves through it" : undefined,
      referenceRoles.has("source_video_structure") || referenceRoles.has("motion") || referenceRoles.has("camera")
        ? "use source/reference video only for rhythm, camera grammar, motion timing, and endpoint framing; replace script, faces, product, background, music, and claims with approved inputs"
        : undefined
    ].filter((line): line is string => Boolean(line));
    return [
      `Motion continuity: make the ${role} beat feel like one filmed moment, with cause-and-effect motion instead of disconnected poses.`,
      "First half-second must be readable immediately; final half-second must settle into an edit-ready handle for xfade, last-frame chaining, or the next shot.",
      "Avoid teleporting hands, products, faces, props, camera direction, or lighting between timeline segments.",
      ...continuityPriority
    ].join(" ");
  }

  private buildFinalFrameSection(shot: ShotContract, bindingPlan: PromptBindingPlan): string {
    const hasNextState = Boolean(shot.continuity.nextShotStartState);
    const hasLastFrameReference = bindingPlan.providerReferences.some((reference) =>
      reference.role === "last_frame" || reference.kind === "last_frame"
    );
    const clauses = [
      "Final-frame contract: end on a stable, usable frame with the main subject, product, and action result still legible.",
      hasNextState ? `The next shot expects: ${shot.continuity.nextShotStartState}.` : undefined,
      hasLastFrameReference ? "If a last-frame reference is present, move toward it without deforming identity or product details." : undefined,
      "Do not end on a blur, mid-blink, hidden product, cropped face, empty frame, or unresolved camera whip unless explicitly requested."
    ].filter((line): line is string => Boolean(line));
    return clauses.join(" ");
  }

  private buildInterShotBridgeSection(shot: ShotContract): string {
    const previousState = shot.continuity.previousShotEndState;
    const nextState = shot.continuity.nextShotStartState;
    const bridgeLines = [
      "Inter-shot bridge: this clip must cut together with adjacent clips as one continuous film, not as a disconnected standalone generation.",
      previousState ? `Start by matching the prior clip endpoint: ${previousState}.` : "Start with a clean readable handle that can accept a prior xfade or first-frame chain.",
      nextState ? `End by preparing the next clip start: ${nextState}.` : "End with a clean readable handle that can accept xfade, cut, or last-frame chaining.",
      shot.transitionIntent ? `Bridge transition intent: ${shot.transitionIntent}.` : undefined,
      "Keep screen direction, camera momentum, subject scale, lighting color, room tone, and action state consistent across the edit boundary.",
      "Do not create a new location, different product scale, different KOL face, sudden color shift, silent audio gap, or unrelated camera angle at the boundary."
    ].filter((line): line is string => Boolean(line));
    return bridgeLines.join(" ");
  }

  private storyArcRole(shot: ShotContract): string {
    if (typeof shot.metadata?.storyArcRole === "string" && shot.metadata.storyArcRole.trim()) {
      return shot.metadata.storyArcRole.trim();
    }
    if (typeof shot.metadata?.shortStoryRole === "string" && shot.metadata.shortStoryRole.trim()) {
      return shot.metadata.shortStoryRole.trim();
    }
    return "story";
  }

  private wholeVideoArcLine(shot: ShotContract, role: string): string | undefined {
    const startSecond = numberMetadata(shot.metadata?.storyArcStartSecond);
    const endSecond = numberMetadata(shot.metadata?.storyArcEndSecond);
    const targetDurationSeconds = numberMetadata(shot.metadata?.storyArcTargetDurationSeconds);
    const position = typeof shot.metadata?.storyArcPosition === "string" && shot.metadata.storyArcPosition.trim()
      ? shot.metadata.storyArcPosition.trim()
      : undefined;
    if (startSecond === undefined || endSecond === undefined || targetDurationSeconds === undefined) {
      return undefined;
    }
    const positionLine = position ? `, ${position}` : "";
    return `Whole-video arc: this shot covers ${startSecond}-${endSecond}s of ${targetDurationSeconds}s${positionLine}; it must advance the ${role} movement and hand off cleanly to the next beat.`;
  }

  private buildReferenceSection(bindingPlan: PromptBindingPlan): string {
    if (bindingPlan.sortedReferences.length === 0) {
      return "References: no external reference assets; follow the shot contract only.";
    }
    const referenceLines = describeReferenceBindingsFromPlan(bindingPlan).map((item) => `- ${item}`);
    return `References:\n${referenceLines.join("\n")}`;
  }

  private buildContinuitySection(shot: ShotContract): string {
    const continuity = shot.continuity;
    const clauses = [
      continuity.identity ? `Identity: preserve ${continuity.identity}.` : undefined,
      continuity.product ? `Product: preserve ${continuity.product}.` : undefined,
      continuity.wardrobe ? `Wardrobe: preserve ${continuity.wardrobe}.` : undefined,
      continuity.environment ? `Environment: preserve ${continuity.environment}.` : undefined,
      continuity.style ? `Visual continuity: maintain ${continuity.style}.` : undefined,
      continuity.previousShotEndState ? `Start state: ${continuity.previousShotEndState}.` : undefined,
      continuity.nextShotStartState ? `End state: ${continuity.nextShotStartState}.` : undefined
    ].filter((clause): clause is string => Boolean(clause));

    return clauses.length > 0 ? `Continuity:\n${clauses.map((clause) => `- ${clause}`).join("\n")}` : "Continuity: follow scene context with no unexplained changes.";
  }

  private buildTimelineSection(timeline: readonly TimelineSegment[]): string {
    const lines = timeline.map((segment, index) => {
      const parts = [
        `Beat ${index + 1}, ${segment.startSecond}-${segment.endSecond}s: ${segment.action}`,
        segment.camera ? `camera ${segment.camera}` : undefined,
        segment.audioCue ? `audio cue ${segment.audioCue}` : undefined
      ].filter((part): part is string => Boolean(part));
      return parts.join("; ");
    });
    return `Timeline:\n${lines.map((line) => `- ${line}.`).join("\n")}`;
  }

  private buildInspectionExpectations(shot: ShotContract, bindingPlan: PromptBindingPlan): readonly string[] {
    const expectations = new Set<string>([
      "prompt intent is visible",
      "camera instruction is followed",
      "lighting remains coherent",
      "no unintended text, watermark, or subtitles"
    ]);

    for (const reference of bindingPlan.sortedReferences) {
      expectations.add(`${reference.role} reference is respected`);
    }
    for (const conflict of bindingPlan.conflicts) {
      if (conflict.status === "repair" || conflict.status === "block") {
        expectations.add(`binding conflict ${conflict.code} is resolved before provider spend`);
      }
    }
    for (const risk of shot.risks) {
      expectations.add(`${risk} risk is controlled`);
    }
    if (shot.transitionIntent) {
      expectations.add("start and end states support the requested transition");
    }
    return [...expectations];
  }

  private resolveMode(bindingPlan: PromptBindingPlan): ProviderMode {
    const roles = new Set<string>();
    for (const reference of bindingPlan.providerReferences) {
      roles.add(reference.kind);
      if (reference.role) {
        roles.add(reference.role);
      }
    }
    if (
      roles.has("video") ||
      roles.has("source_video_structure") ||
      roles.has("motion") ||
      roles.has("camera") ||
      roles.has("audio") ||
      roles.has("audio_tempo") ||
      roles.has("voice") ||
      roles.has("style")
    ) {
      return "reference_to_video";
    }
    if (roles.has("first_frame") || roles.has("last_frame") || roles.has("identity") || roles.has("product")) {
      return "image_to_video";
    }
    return "text_to_video";
  }
}

function numberMetadata(value: string | number | boolean | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}
