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
import {
  ARC_ROLE_DIRECTIVES,
  buildDurationScript,
  CLIFFHANGER_ENDING_ARC_DIRECTIVE,
  type VideoArcRole
} from "../core/duration-scripting.js";
import { resolveSeedanceDna } from "../core/seedance-dna.js";
import { cinematicGrammarPromptLine } from "../core/seedance-cinematic-grammar.js";
import { shotGrammarFromMetadata, shotGrammarPromptLine } from "../core/shot-grammar.js";
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
      this.buildReferenceHandlePrelude(bindingPlan, providerMode),
      `Video brief: ${shot.durationSeconds}s ${this.providerModeLabel(providerMode)} clip.`,
      `Creative intent: ${shot.intent}.`,
      this.buildReferenceSection(bindingPlan),
      this.buildProviderModeContractSection(providerMode, bindingPlan),
      this.buildContinuitySection(shot, bindingPlan),
      this.buildPacingSection(shot),
      this.buildDurationScriptSection(shot),
      this.buildMotionContinuitySection(shot, bindingPlan),
      this.buildInterShotBridgeSection(shot, bindingPlan),
      this.buildBoundaryChoreographySection(shot, bindingPlan),
      `Scene subject: ${shot.subject}.`,
      `Action: ${this.providerActionText(shot.action)}.`,
      `Camera: ${shot.camera}.`,
      this.buildShotGrammarSection(shot),
      `Lighting: ${shot.lighting}.`,
      shot.style ? `Style: ${shot.style}.` : undefined,
      shot.timeline && shot.timeline.length > 0 ? this.buildTimelineSection(shot.timeline, shot) : undefined,
      this.buildAudioProductionSection(shot),
      shot.transitionIntent ? `Transition: ${shot.transitionIntent}.` : undefined,
      this.buildNicheDnaSection(shot),
      this.buildCinematicGrammarSection(shot),
      this.buildFinalFrameSection(shot, bindingPlan),
      this.buildRealismGuardrailsSection()
    ];

    return sections.filter((section): section is string => Boolean(section && section.trim())).join("\n");
  }

  private buildReferenceHandlePrelude(bindingPlan: PromptBindingPlan, providerMode: ProviderMode): string | undefined {
    if (providerMode === "text_to_video" || bindingPlan.providerReferences.length === 0) {
      return undefined;
    }
    const providerReferenceHandleBindings = this.providerReferenceHandleBindings(bindingPlan);
    const primaryHandles = providerReferenceHandleBindings.filter((binding) =>
      /-> (identity|product|first_frame|last_frame)\//.test(binding)
    );
    const supportingHandles = providerReferenceHandleBindings.filter((binding) => !primaryHandles.includes(binding));
    return [
      `Reference handles: ${providerReferenceHandleBindings.join("; ")}.`,
      `Atlas aliases: ${this.providerReferenceAliasBindings(bindingPlan).join("; ")}. Use each @image/@video/@audio handle only for its listed input.`,
      primaryHandles.length > 0
        ? `Primary anchors: preserve ${primaryHandles.join("; ")} before style, motion, camera, audio, or source-video structure.`
        : "Primary anchors: none supplied; do not invent a specific real person, brand package, logo, or source-video frame.",
      // Reference disambiguation (proven Seedance technique): state what to take from each
      // anchor AND what to ignore, so its background/lighting/framing don't bleed in.
      primaryHandles.some((binding) => /-> identity\//.test(binding))
        ? "From identity references take only the person's face, hair, and features — not their background, lighting, wardrobe, or pose."
        : undefined,
      primaryHandles.some((binding) => /-> product\//.test(binding))
        ? "From product references take only the exact product shape, colour, logo, and label — not their background or lighting."
        : undefined,
      supportingHandles.length > 0
        ? `Supporting references: ${supportingHandles.join("; ")} guide rhythm, camera, style, and audio only after primary anchors are stable.`
        : undefined
    ].filter((line): line is string => Boolean(line)).join(" ");
  }

  private buildProviderModeContractSection(mode: ProviderMode, bindingPlan: PromptBindingPlan): string {
    const providerReferenceHandleBindings = this.providerReferenceHandleBindings(bindingPlan);
    const providerReferenceSummary = providerReferenceHandleBindings.length > 0
      ? providerReferenceHandleBindings.join("; ")
      : "none";
    const roles = new Set([
      ...bindingPlan.sortedReferences.flatMap((reference) => [reference.role, reference.providerReference.kind]),
      ...bindingPlan.providerReferences.flatMap((reference) =>
        [reference.kind, reference.role].filter((value): value is string => Boolean(value))
      )
    ]);
    const planningOnlyReferences = bindingPlan.roleScopes.filter((reference) => !reference.providerIncluded);
    const lines = [
      bindingPlan.providerReferences.length > 0
        ? `Seedance mode contract: ${this.providerModeLabel(mode)}. Provider reference map: ${providerReferenceSummary}.`
        : `Seedance mode contract: ${this.providerModeLabel(mode)}. Provider reference map: none.`,
      planningOnlyReferences.length > 0
        ? `Planning-only references: ${planningOnlyReferences.map((reference) => `${reference.role}/${reference.label} (${reference.providerFilterReason ?? "not sent to provider"})`).join("; ")}; treat them as scenario constraints, not as uploaded media.`
        : undefined,
      mode !== "text_to_video" && providerReferenceHandleBindings.length > 0
        ? `Use these handles exactly as listed: ${providerReferenceHandleBindings.join("; ")}. Never reuse a handle for an unlisted role.`
        : mode !== "text_to_video"
          ? "No provider media handles are available; keep reference-only logic in prose and do not invent @image/@video/@audio handles."
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

  private providerReferenceHandleBindings(bindingPlan: PromptBindingPlan): readonly string[] {
    return this.providerReferenceHandleDescriptors(bindingPlan).map((descriptor) => descriptor.handleBinding);
  }

  private providerReferenceAliasBindings(bindingPlan: PromptBindingPlan): readonly string[] {
    return this.providerReferenceHandleDescriptors(bindingPlan).map((descriptor) =>
      `${descriptor.handle}=${descriptor.atlasAlias}`
    );
  }

  private providerReferenceHandleDescriptors(bindingPlan: PromptBindingPlan): readonly {
    readonly handle: string;
    readonly atlasAlias: string;
    readonly handleBinding: string;
  }[] {
    const handleCounts: Record<"image" | "video" | "audio", number> = {
      image: 0,
      video: 0,
      audio: 0
    };
    return bindingPlan.providerReferences.map((reference) => {
      const handleKind = this.providerHandleKind(reference.kind);
      handleCounts[handleKind] += 1;
      const handle = `@${handleKind}${handleCounts[handleKind]}`;
      const atlasAlias = `${handleKind} ${handleCounts[handleKind]}`;
      const role = reference.role ?? reference.kind;
      const label = reference.label ? `=${reference.label}` : "";
      return {
        handle,
        atlasAlias,
        handleBinding: `${handle} -> ${role}/${reference.kind}${label}`
      };
    });
  }

  private providerHandleKind(kind: string): "image" | "video" | "audio" {
    if (kind === "audio") {
      return "audio";
    }
    if (kind === "video" || kind === "motion" || kind === "camera") {
      return "video";
    }
    return "image";
  }

  private providerModeRules(mode: ProviderMode): readonly string[] {
    switch (mode) {
      case "text_to_video":
        return [
          "No media reference is attached; make the subject, action, camera, lighting, physical motion, audio intent, and ending frame self-contained.",
          "Do not imply a supplied KOL likeness, exact product packaging, logo, source-video scene, or protected style when no such reference was provided."
        ];
      case "image_to_video":
        return [
          "Treat supplied image references as identity/product/endpoint anchors, not generic mood boards.",
          "Add controlled camera and body/product motion while preserving the anchor's geometry, pose logic, lighting direction, and recognizable details."
        ];
      case "reference_to_video":
        return [
          "Separate every reference by role, then apply identity/product/endpoints first, environment second, camera/motion/audio/style last.",
          "If multiple references conflict, preserve approved KOL identity and product fidelity before trend style, source-video energy, or cinematic polish."
        ];
      case "video_to_video":
        return [
          "Use the source video only as the editable base and keep all edits scoped to the approved shot.",
          "Preserve continuity handles and replace any unapproved subject, product, text, logo, music, or claim."
        ];
      case "extend":
        return [
          "Continue naturally from the supplied endpoint, matching motion direction, scale, lighting, room tone, and subject/product state.",
          "Do not restart the action, jump to a new scene, or introduce a new character/product identity unless the shot contract requires it."
        ];
      case "edit":
        return [
          "Change only the requested subject/action/setting detail while keeping all untouched identity, product, camera, light, and endpoint continuity stable.",
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
    const cliffhanger = this.isCliffhangerShot(shot);
    return [
      `Pacing contract: use the full ${shot.durationSeconds}s for a complete ${role} beat with a clear opening, middle action, and ${cliffhanger ? "an unresolved cliffhanger hold as the ending state" : "ending state"}.`,
      this.wholeVideoArcLine(shot, role),
      "Do not collapse the shot into one static product macro, one hand pose, or an unfinished setup.",
      hasTimeline
        ? "Follow the time-coded timeline exactly; each segment must add new visual information."
        : cliffhanger
          ? "Create at least three visible state changes: first-frame hook, action/proof, and an unresolved cliffhanger hold (cut before the payoff lands)."
          : "Create at least three visible state changes: first-frame hook, action/proof, and settled endpoint."
    ].filter((line): line is string => Boolean(line)).join(" ");
  }

  /** Whether this shot is the video's final shot with a requested cliffhanger ending. */
  private isCliffhangerShot(shot: ShotContract): boolean {
    return this.isCliffhangerEndingShot(shot, this.videoArcRole(shot));
  }

  /**
   * Full-runtime duration contract. When the shot has an explicit timeline, emit only the
   * sandwich runtime contract plus the video-level arc directive (the timeline already
   * carries beat timing); otherwise emit the complete timestamped beat plan so the model
   * receives hard timing instructions covering the entire clip.
   */
  private buildDurationScriptSection(shot: ShotContract): string {
    const arcRole = this.videoArcRole(shot);
    const cliffhanger = this.isCliffhangerEndingShot(shot, arcRole);
    const arcDirective = arcRole
      ? cliffhanger
        ? CLIFFHANGER_ENDING_ARC_DIRECTIVE
        : ARC_ROLE_DIRECTIVES[arcRole]
      : undefined;
    const finalBeatClause = cliffhanger
      ? `the final beat holds the unresolved cliffhanger frame at ${shot.durationSeconds}s`
      : `the final beat must still be purposeful motion that settles cleanly at ${shot.durationSeconds}s`;
    const hasTimeline = Boolean(shot.timeline?.length);
    if (hasTimeline) {
      const lines = [
        `Runtime contract: this clip runs exactly ${shot.durationSeconds} seconds and the action must fill the entire runtime; treat the time-coded timeline as hard editorial instructions.`,
        shot.durationSeconds > 9
          ? "Add a new visible state change at least every 3 seconds; never hold one pose, product macro, or camera position through the middle of the clip."
          : undefined,
        arcDirective,
        `Do not finish the action early, freeze on a static frame, loop, or pad; ${finalBeatClause}. Total: ${shot.durationSeconds}s.`
      ].filter((line): line is string => Boolean(line));
      return lines.join(" ");
    }
    return buildDurationScript({
      durationSeconds: shot.durationSeconds,
      ...(arcRole ? { arcRole } : {}),
      ...(cliffhanger ? { endingStyle: "cliffhanger" as const } : {})
    }).promptLines.join(" ");
  }

  /**
   * Controlled framing grammar. Fires only when shot metadata carries valid shotType/
   * shotAngle/shotPosition values so explicit framing never fights planner camera prose.
   */
  private buildShotGrammarSection(shot: ShotContract): string | undefined {
    const grammar = shotGrammarFromMetadata(shot.metadata);
    if (!grammar) {
      return undefined;
    }
    // With a per-beat timeline the grammar is the HOME framing (beats may cut away and
    // return); without one it is a strict lock. Keeps grammar from fighting beat cameras.
    const mode = shot.timeline && shot.timeline.length > 0 ? "home" : "strict";
    return shotGrammarPromptLine(grammar, { mode });
  }

  /** Cliffhanger endings apply only to the video's final shot (or a one-shot episode). */
  private isCliffhangerEndingShot(shot: ShotContract, arcRole: VideoArcRole | undefined): boolean {
    if (arcRole !== "closing_resolve" && arcRole !== "full_video") {
      return false;
    }
    return this.stringMetadata(shot, "videoEndingStyle") === "cliffhanger";
  }

  private videoArcRole(shot: ShotContract): VideoArcRole | undefined {
    const value = shot.metadata?.videoArcRole;
    if (
      value === "full_video" ||
      value === "opening_hook" ||
      value === "development" ||
      value === "climax" ||
      value === "closing_resolve"
    ) {
      return value;
    }
    return undefined;
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
      `Motion continuity: make the ${role} beat feel like one filmed moment, with cause-and-effect movement instead of disconnected poses.`,
      "First half-second must be readable immediately; final half-second must settle into a clean edit handle.",
      "Avoid teleporting hands, products, faces, props, camera direction, or lighting between timeline segments.",
      ...continuityPriority
    ].join(" ");
  }

  private buildFinalFrameSection(shot: ShotContract, bindingPlan: PromptBindingPlan): string {
    const hasNextState = Boolean(shot.continuity.nextShotStartState);
    const hasLastFrameReference = bindingPlan.providerReferences.some((reference) =>
      reference.role === "last_frame" || reference.kind === "last_frame"
    );
    const cliffhanger = this.isCliffhangerShot(shot);
    const clauses = [
      cliffhanger
        ? "Final-frame contract (cliffhanger): finish on a stable, legible frame of the UNRESOLVED moment — the confrontation frozen, the reveal half-seen, the reply unspoken; do not resolve the action."
        : "Final-frame contract: finish on a stable, usable frame with the main subject, product, and action result still legible.",
      hasNextState ? `The next shot expects: ${shot.continuity.nextShotStartState}.` : undefined,
      hasLastFrameReference ? "If a last-frame reference is present, move toward it without deforming identity or product details." : undefined,
      cliffhanger
        ? "Do not end on a blur, mid-blink, hidden product, cropped face, or empty frame; the final frame stays technically clean while the story stays unresolved."
        : "Do not end on a blur, mid-blink, hidden product, cropped face, empty frame, or unresolved camera whip unless explicitly requested."
    ].filter((line): line is string => Boolean(line));
    return clauses.join(" ");
  }

  /**
   * Niche and creative-mode prompt DNA. Fires only when the shot metadata carries a `niche`
   * or `creativeMode` so the final provider prompt gets category-specific physical direction
   * (e.g. macro skin texture for beauty, fit-in-motion for fashion). No-ops otherwise.
   */
  private buildNicheDnaSection(shot: ShotContract): string | undefined {
    // The short pipeline stamps niche/creative-mode onto shot metadata under these keys
    // (via the render handoff -> intake -> shot planner). Accept the direct keys too so
    // long-form/direct callers can opt in.
    const niche = this.stringMetadata(shot, "shortViralNiche") ?? this.stringMetadata(shot, "niche");
    const creativeMode =
      this.stringMetadata(shot, "shortViralCreativeMode") ??
      this.stringMetadata(shot, "shortDirectorCreativeMode") ??
      this.stringMetadata(shot, "creativeMode");
    if (!niche && !creativeMode) {
      return undefined;
    }
    const lines = resolveSeedanceDna({
      ...(niche ? { niche } : {}),
      ...(creativeMode ? { creativeMode } : {})
    }).promptLines;
    return lines.length > 0 ? lines.join(" ") : undefined;
  }

  /**
   * Reliable-Seedance cinematography line: focus/lens, lighting, colour grade, and lens
   * character chosen for the creative mode. This speaks Seedance's film-grammar language so
   * lens/light/grade are directed instead of left to chance — the top output-quality lift
   * once the CRAFT anatomy is complete. Mode-keyed; falls back to a grounded default.
   */
  private buildCinematicGrammarSection(shot: ShotContract): string {
    const creativeMode =
      this.stringMetadata(shot, "shortViralCreativeMode") ??
      this.stringMetadata(shot, "shortDirectorCreativeMode") ??
      this.stringMetadata(shot, "creativeMode");
    return cinematicGrammarPromptLine(creativeMode);
  }

  private stringMetadata(shot: ShotContract, key: string): string | undefined {
    const value = shot.metadata?.[key];
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  /**
   * Photoreal realism guardrails. This is the "anti-AI-slop" prompt anatomy distilled from
   * credited Seedance/ad/UGC prompt patterns (attribution lives in docs/CREDITS.md; original
   * wording, not copied): natural optics, physically based light, real material microtexture,
   * organic motion, and explicit artifact suppression. It targets the "does not look real"
   * failure mode that separates raw text-to-video from commercial-grade cinematic output.
   */
  private buildRealismGuardrailsSection(): string {
    return [
      "Realism guardrails: deliver a photoreal cinematic capture, not a CGI, cartoon, or obvious AI render.",
      "Optics: real lens depth-of-field with subtle focus falloff, true perspective, and motion blur consistent with the actual movement speed.",
      "Light physically: motivated key light with soft fill, accurate cast and contact shadows, and physically based reflections/specular roll-off on product and skin surfaces.",
      "Preserve real material microtexture (skin pores, fabric weave, brushed metal, glass, condensation, surface wear); avoid plastic, waxy, over-smoothed, or over-sharpened surfaces.",
      "Keep motion organic with natural weight and easing plus small secondary micro-movements; avoid floaty, rubbery, warping, sped-up, or looping-glitch motion.",
      "Suppress AI artifacts: no extra or fused fingers, morphing edges, temporal flicker, ghosting, melting geometry, warped logos/text, or duplicated features.",
      "No visible generated text, captions, subtitles, watermark, or fake UI unless explicitly requested."
    ].join(" ");
  }

  private buildInterShotBridgeSection(shot: ShotContract, bindingPlan: PromptBindingPlan): string | undefined {
    const previousState = shot.continuity.previousShotEndState;
    const nextState = shot.continuity.nextShotStartState;
    const hasEndpointReference = bindingPlan.providerReferences.some((reference) =>
      reference.role === "first_frame" ||
      reference.role === "last_frame" ||
      reference.kind === "first_frame" ||
      reference.kind === "last_frame"
    );
    if (!previousState && !nextState && !hasEndpointReference) {
      return undefined;
    }
    const bridgeLines = [
      "Inter-shot bridge: this clip must cut together with adjacent clips as one continuous film.",
      previousState ? `Start by matching the prior clip endpoint: ${previousState}.` : "Start with a clean readable first frame.",
      nextState ? `End by preparing the next clip start: ${nextState}.` : "End with a clean readable endpoint.",
      shot.transitionIntent ? `Transition intent: ${shot.transitionIntent}.` : undefined,
      "Keep screen direction, camera momentum, subject scale, lighting color, room tone, and action state consistent across the edit boundary.",
      "Do not create a new location, different product scale, different KOL face, sudden color shift, silent audio gap, or unrelated camera angle at the boundary."
    ].filter((line): line is string => Boolean(line));
    return bridgeLines.join(" ");
  }

  private buildBoundaryChoreographySection(shot: ShotContract, bindingPlan: PromptBindingPlan): string {
    const role = this.storyArcRole(shot);
    const hasPreviousState = Boolean(shot.continuity.previousShotEndState);
    const hasNextState = Boolean(shot.continuity.nextShotStartState);
    const referenceRoles = new Set(bindingPlan.providerReferences.map((reference) => reference.role ?? reference.kind));
    const sourceGuided = referenceRoles.has("source_video_structure") ||
      referenceRoles.has("video") ||
      referenceRoles.has("motion") ||
      referenceRoles.has("camera");
    const primaryAnchors = [
      referenceRoles.has("identity") ? "KOL/character identity" : undefined,
      referenceRoles.has("product") ? "product geometry and scale" : undefined,
      referenceRoles.has("environment") ? "background spatial layout" : undefined
    ].filter((anchor): anchor is string => Boolean(anchor));
    return [
      `Boundary choreography: stage this ${role} clip with a readable first frame, clear middle action, and stable final frame.`,
      hasPreviousState
        ? "Entry: match the prior endpoint before introducing new motion; keep the same screen direction, lens distance, subject scale, lighting color, and product/KOL state."
        : "Entry: open on a stable readable first frame before the camera or subject starts moving.",
      "Middle: add one concrete visible state change tied to the shot intent, not a repeated pose, idle product hold, or style-only flourish.",
      hasNextState
        ? "Exit: finish the action early enough to hold the final 0.5s as a clean next-shot handle with subject and product still visible."
        : this.isCliffhangerShot(shot)
          ? "Exit: hold the final 0.5s on the unresolved cliffhanger frame — technically clean (no whip, blur, blink, or crop) while the story stays deliberately unresolved."
          : "Exit: hold the final 0.5s as a clean review/delivery handle with no unresolved whip, blur, blink, or cropped product.",
      primaryAnchors.length > 0
        ? `Anchor lock during entry and exit: preserve ${primaryAnchors.join(", ")} before camera motion, style, source-video rhythm, or audio energy.`
        : undefined,
      sourceGuided
        ? "For source-video/remake guidance, inherit timing, motion grammar, and camera direction only after replacement KOL/product/background anchors are visible at both entry and exit."
        : undefined,
      "Do not rely on postproduction crossfade to hide inconsistent generated endpoints; the generated frames themselves should match the edit plan."
    ].filter((line): line is string => Boolean(line)).join(" ");
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
    if (startSecond <= 0 && endSecond >= targetDurationSeconds) {
      return `Story arc: this clip covers the full ${targetDurationSeconds}s video${positionLine}; open clearly, develop visibly, and resolve cleanly.`;
    }
    return `Story arc: this shot covers ${startSecond}-${endSecond}s of ${targetDurationSeconds}s${positionLine}; advance the ${role} movement and hand off cleanly to the next beat.`;
  }

  private buildReferenceSection(bindingPlan: PromptBindingPlan): string {
    if (bindingPlan.sortedReferences.length === 0) {
      return "References: none attached. Create the scene from the text brief only; do not invent a supplied KOL/product reference.";
    }
    const referenceLines = describeReferenceBindingsFromPlan(bindingPlan).map((item) => `- ${item}`);
    return `References:\n${referenceLines.join("\n")}`;
  }

  private buildContinuitySection(shot: ShotContract, bindingPlan: PromptBindingPlan): string {
    const continuity = shot.continuity;
    const clauses = [
      continuity.identity ? `Identity: preserve ${continuity.identity}.` : undefined,
      continuity.product ? `${this.productContinuityLabel(continuity.product, bindingPlan)}: preserve ${continuity.product}.` : undefined,
      continuity.wardrobe ? `Wardrobe: preserve ${continuity.wardrobe}.` : undefined,
      continuity.environment ? `Environment: preserve ${continuity.environment}.` : undefined,
      continuity.style ? `Visual continuity: maintain ${continuity.style}.` : undefined,
      continuity.previousShotEndState ? `Start state: ${continuity.previousShotEndState}.` : undefined,
      continuity.nextShotStartState ? `End state: ${continuity.nextShotStartState}.` : undefined
    ].filter((clause): clause is string => Boolean(clause));

    return clauses.length > 0 ? `Continuity:\n${clauses.map((clause) => `- ${clause}`).join("\n")}` : "Continuity: follow scene context with no unexplained changes.";
  }

  private buildTimelineSection(timeline: readonly TimelineSegment[], shot: ShotContract): string {
    const lines = timeline.map((segment, index) => {
      const segmentDuration = Math.max(0, segment.endSecond - segment.startSecond);
      const parts = [
        `Beat ${index + 1}, ${segment.startSecond}-${segment.endSecond}s: ${this.providerActionText(segment.action)}`,
        segment.camera ? `camera ${segment.camera}` : undefined,
        segment.audioCue
          ? `audio cue ${segment.audioCue}; keep spoken words within about ${this.voiceoverWordBudget(segmentDuration)} words for this beat`
          : undefined
      ].filter((part): part is string => Boolean(part));
      return parts.join("; ");
    });
    const cliffhangerOverride = this.isCliffhangerShot(shot)
      ? "\n- Ending-beat override: play the final timeline beat as a cliffhanger hold — drive tension to the last second and cut before the resolution lands; this override supersedes any 'resolves the story' or 'settled' wording in the beats above."
      : "";
    return `Timeline:\n${lines.map((line) => `- ${line}.`).join("\n")}${cliffhangerOverride}`;
  }

  private productContinuityLabel(value: string, bindingPlan: PromptBindingPlan): string {
    const hasProductReference = bindingPlan.providerReferences.some((reference) =>
      reference.role === "product" || reference.kind === "product"
    );
    if (hasProductReference) {
      return "Product";
    }
    return /outfit|wardrobe|clothes|blazer|trouser|dress|fashion|garment|fabric|accessor/i.test(value)
      ? "Wardrobe/result"
      : "Hero object/result";
  }

  private providerActionText(value: string): string {
    let normalized = value.replace(/\s+/g, " ").trim();
    const plannedActionIndex = normalized.toLowerCase().indexOf("planned action:");
    if (plannedActionIndex >= 0) {
      normalized = normalized.slice(plannedActionIndex + "planned action:".length).trim();
    }
    normalized = normalized
      .replace(/\bThen\b/g, "then")
      .replace(/\s+then\s+/gi, "; then ")
      .replace(/\s*;\s*/g, "; ")
      .replace(/\s+/g, " ")
      .trim();
    return this.compactProviderText(normalized, 1_100);
  }

  private compactProviderText(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }
    const clipped = value.slice(0, maxChars);
    const boundary = Math.max(clipped.lastIndexOf(";"), clipped.lastIndexOf("."), clipped.lastIndexOf(","));
    return `${clipped.slice(0, boundary > maxChars * 0.6 ? boundary : maxChars).trim()}...`;
  }

  private buildAudioProductionSection(shot: ShotContract): string | undefined {
    if (!shot.audioIntent) {
      return undefined;
    }
    const wordBudget = this.voiceoverWordBudget(shot.durationSeconds);
    return [
      `Audio production plan: ${shot.audioIntent}.`,
      `If native provider audio is enabled, generate only original ambience/music/voice that follows this shot timing; do not copy protected songs, melodies, transcripts, or voices.`,
      `If external voice/music is produced later, this prompt still defines the script timing: keep narration under about ${wordBudget} spoken words for ${shot.durationSeconds}s and leave micro-pauses around product contact, proof, or reaction moments.`,
      "The visual story must remain understandable without audio, while the audio rhythm should strengthen the hook, proof/demo, and final resolve."
    ].join(" ");
  }

  private voiceoverWordBudget(durationSeconds: number): number {
    const seconds = Number.isFinite(durationSeconds) ? Math.max(1, durationSeconds) : 4;
    return Math.max(3, Math.floor(seconds * 2.4));
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
    if (shot.continuity.previousShotEndState || shot.continuity.nextShotStartState) {
      expectations.add("boundary choreography supports seamless assembly without visible reset");
    }
    if (bindingPlan.sortedReferences.some((reference) =>
      reference.role === "source_video_structure" ||
      reference.role === "motion" ||
      reference.role === "camera"
    )) {
      expectations.add("source-video rhythm is transferred only after user anchors remain visible at entry and exit");
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
    const imageReferenceCount = bindingPlan.providerReferences.filter((reference) => reference.kind === "image").length;
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
    // A pinned first/last frame (keyframe-first / endpoint chaining) drives image_to_video: the
    // keyframe was generated FROM the identity+product refs, so the product is already baked in.
    if (roles.has("first_frame") || roles.has("last_frame")) {
      return "image_to_video";
    }
    // Multiple image references with no pinned frame (e.g. a KOL face + a product photo) must go
    // through reference_to_video so ALL of them reach the provider — image_to_video sends only the
    // first image, which would silently DROP the product/environment (final-audit gap V8).
    if (imageReferenceCount >= 2) {
      return "reference_to_video";
    }
    if (roles.has("identity") || roles.has("product")) {
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
