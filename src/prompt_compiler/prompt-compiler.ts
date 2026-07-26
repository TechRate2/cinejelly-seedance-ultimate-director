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
  VOICEOVER_WORDS_PER_SECOND,
  type VideoArcRole
} from "../core/duration-scripting.js";
import { resolveSeedanceDna } from "../core/seedance-dna.js";
import {
  DIALOGUE_LIGHT_LANGUAGE_CLAUSE,
  DIALOGUE_LIGHT_VERBATIM_CLAUSE,
  GEAR_ANCHOR_BY_REGISTER,
  registerForCreativeMode,
  registerGrammarPromptLine,
  TALKING_HEAD_NATURALNESS_CLAUSE,
  type RegisterAxis,
  type StyleRegister
} from "../core/register-grammar.js";
import { cinematicGrammarPromptLine } from "../core/seedance-cinematic-grammar.js";
import { shotGrammarFromMetadata, shotGrammarPromptLine } from "../core/shot-grammar.js";
import { BEAT_CONTINUATION_SENTINEL, CONTINUATION_AUDIO_MARKER } from "../core/shot-planner.js";
import { containsVietnameseDiacritics } from "../core/spoken-language.js";
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

  /**
   * Compact prompt anatomy (post live-render forensics). The first paid renders shipped
   * 1,400-1,600-word prompts — longer than every prompt in the 106-example battle-tested corpus and
   * 5.5x the official ~2,000-char guidance — with ~78% duplicated contract boilerplate burying the
   * ~22% creative signal. This layout states every functional signal EXACTLY ONCE: one reference
   * map, one camera statement (timeline emits deltas only), one transition, one continuity handoff
   * per boundary, and three tight merged contracts (runtime, boundary, realism).
   *
   * SECTION ORDER IS DELIBERATE — do not reorder without a paid A/B. An audit proposed front-loading
   * subject/action/camera ahead of the mode/continuity/runtime contracts (Seedance weights early
   * tokens). Assessed and DEFERRED: the reference map must precede anything that uses its handles,
   * the creative-intent line already leads, this order was tuned from live-render forensics, and a
   * reorder changes every prompt while no offline test can measure the visual effect. Revisit only
   * during a paid acceptance session by A/B-ing a reordered prompt against this one on the same brief.
   */
  private buildPrompt(shot: ShotContract, bindingPlan: PromptBindingPlan, providerMode: ProviderMode): string {
    // Resolved ONCE so the register frame and the realism guardrails can never disagree.
    const register = this.resolveStyleRegister(shot);
    const sections = [
      this.buildReferenceHandlePrelude(bindingPlan, providerMode),
      `Video brief: ${shot.durationSeconds}s ${this.providerModeLabel(providerMode)} clip.`,
      this.buildCreativeIntentLine(shot),
      this.buildProviderModeContractSection(providerMode, bindingPlan),
      this.buildContinuitySection(shot, bindingPlan),
      this.buildRuntimeSection(shot, bindingPlan),
      this.buildBoundarySection(shot, bindingPlan),
      `Scene subject: ${shot.subject}.`,
      `Action: ${this.providerActionText(shot.action)}.`,
      shot.emotionalTurn
        ? `Emotional turn: ${this.stripTerminalPunctuation(shot.emotionalTurn)} — play the shift visibly (face, hands, posture) within this clip.`
        : undefined,
      `Camera: ${shot.camera}.`,
      this.buildShotGrammarSection(shot),
      `Lighting: ${shot.lighting}.`,
      shot.style ? `Style: ${shot.style}.` : undefined,
      shot.timeline && shot.timeline.length > 0 ? this.buildTimelineSection(shot.timeline, shot) : undefined,
      this.buildAudioProductionSection(shot, register),
      this.buildRegisterSection(shot, register),
      this.buildFinalFrameSection(shot, bindingPlan),
      this.buildRealismGuardrailsSection(register)
    ];

    return sections.filter((section): section is string => Boolean(section && section.trim())).join("\n");
  }

  /**
   * The "Creative intent" line sits at the TOP of the prompt where Seedance weights early tokens
   * heavily. shot.intent is often the beat's internal production purpose ("advance the story with a
   * clear commercial beat") — bland filler. When the beat authored an emotional turn, lead with THAT
   * (the real creative goal of the shot) instead of the pipeline purpose (audit).
   */
  private buildCreativeIntentLine(shot: ShotContract): string {
    if (shot.emotionalTurn && shot.emotionalTurn.trim()) {
      return `Creative intent: land the shift ${this.stripTerminalPunctuation(shot.emotionalTurn)} so the viewer feels it.`;
    }
    return `Creative intent: ${shot.intent}.`;
  }

  private buildReferenceHandlePrelude(bindingPlan: PromptBindingPlan, providerMode: ProviderMode): string | undefined {
    if (providerMode === "text_to_video" || bindingPlan.providerReferences.length === 0) {
      return undefined;
    }
    const providerReferenceHandleBindings = this.providerReferenceHandleBindings(bindingPlan);
    const descriptors = this.providerReferenceHandleDescriptors(bindingPlan);
    const primaryHandles = providerReferenceHandleBindings.filter((binding) =>
      /-> (identity|product|first_frame|last_frame)\//.test(binding)
    );
    const supportingHandleNames = descriptors
      .filter((descriptor) => !primaryHandles.includes(descriptor.handleBinding))
      .map((descriptor) => descriptor.handle);
    // The handle→role map is stated HERE exactly once; every later section refers to it without
    // re-printing (the old format repeated it 4x per prompt, drowning the creative content).
    return [
      `Reference handles: ${providerReferenceHandleBindings.join("; ")}.`,
      primaryHandles.length > 0
        ? "Primary anchors: lock identity, product, and endpoint references before style, motion, camera, audio, or source-video structure."
        : "Primary anchors: none supplied; do not invent a specific real person, brand package, logo, or source-video frame.",
      // Reference disambiguation (proven Seedance technique): state what to take from each
      // anchor AND what to ignore, so its background/lighting/framing don't bleed in.
      primaryHandles.some((binding) => /-> identity\//.test(binding))
        ? "From identity references take only the person's face, hair, and features — not their background, lighting, wardrobe, or pose."
        : undefined,
      primaryHandles.some((binding) => /-> product\//.test(binding))
        ? "From product references take only the exact product shape, colour, logo, and label — not their background or lighting."
        : undefined,
      supportingHandleNames.length > 0
        ? `Supporting references (${supportingHandleNames.join(", ")}) guide rhythm, camera, style, and audio only after primary anchors are stable.`
        : undefined
    ].filter((line): line is string => Boolean(line)).join(" ");
  }

  private buildProviderModeContractSection(mode: ProviderMode, bindingPlan: PromptBindingPlan): string {
    const roles = new Set([
      ...bindingPlan.sortedReferences.flatMap((reference) => [reference.role, reference.providerReference.kind]),
      ...bindingPlan.providerReferences.flatMap((reference) =>
        [reference.kind, reference.role].filter((value): value is string => Boolean(value))
      )
    ]);
    const planningOnlyReferences = bindingPlan.roleScopes.filter((reference) => !reference.providerIncluded);
    // Compact: the handle map lives ONLY in the prelude; identity/product take-only rules live there
    // too. This section keeps just the mode rules and the boundaries with no prelude analog.
    const lines = [
      `Seedance mode contract: ${this.providerModeLabel(mode)}.`,
      planningOnlyReferences.length > 0
        ? `Planning-only references: ${planningOnlyReferences.map((reference) => `${reference.role}/${reference.label} (${reference.providerFilterReason ?? "not sent to provider"})`).join("; ")}; treat them as scenario constraints, not as uploaded media.`
        : undefined,
      mode !== "text_to_video" && bindingPlan.providerReferences.length === 0
        ? "No provider media handles are available; keep reference-only logic in prose and do not invent @image/@video/@audio handles."
        : undefined,
      ...this.providerModeRules(mode),
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

  /**
   * Merged timing contract (was three sections: Pacing + Runtime + Motion continuity, ~230 words of
   * overlapping boilerplate). One paragraph now carries: exact runtime, the whole-video arc position,
   * the state-change cadence, and one-continuous-moment motion physics.
   */
  private buildRuntimeSection(shot: ShotContract, bindingPlan: PromptBindingPlan): string {
    const role = this.storyArcRole(shot);
    const arcRole = this.videoArcRole(shot);
    const cliffhanger = this.isCliffhangerEndingShot(shot, arcRole);
    const hasTimeline = Boolean(shot.timeline?.length);
    if (!hasTimeline) {
      // No per-beat timeline: fall back to the full timestamped duration script (it IS the timing).
      return buildDurationScript({
        durationSeconds: shot.durationSeconds,
        ...(arcRole ? { arcRole } : {}),
        ...(cliffhanger ? { endingStyle: "cliffhanger" as const } : {})
      }).promptLines.join(" ");
    }
    const arcDirective = arcRole
      ? cliffhanger
        ? CLIFFHANGER_ENDING_ARC_DIRECTIVE
        : ARC_ROLE_DIRECTIVES[arcRole]
      : undefined;
    // Mirror buildFinalFrameSection's continuation detection: a mid-beat clip must NOT be told to
    // settle while the final-frame contract tells it to end mid-motion (audit: self-contradiction
    // on every continuation clip in long-form videos).
    const continuationExit = this.isContinuationExit(shot);
    const finalBeatClause = cliffhanger
      ? `the final beat holds the unresolved cliffhanger frame at ${shot.durationSeconds}s`
      : continuationExit
        ? `the final beat keeps the action visibly in progress at ${shot.durationSeconds}s — this clip hands off mid-motion to the next clip, so do not settle or resolve`
        : `the final beat must still be purposeful motion that settles cleanly at ${shot.durationSeconds}s`;
    const referenceRoles = new Set(bindingPlan.providerReferences.map((reference) => reference.role ?? reference.kind));
    const sourceGuided = referenceRoles.has("source_video_structure") ||
      referenceRoles.has("video") ||
      referenceRoles.has("motion") ||
      referenceRoles.has("camera");
    return [
      `Runtime contract: exactly ${shot.durationSeconds}s — fill the entire runtime; the time-coded timeline is hard editorial instruction.`,
      this.wholeVideoArcLine(shot, role),
      shot.durationSeconds > 9
        ? "Add a new visible state change at least every 3 seconds; never hold one pose or product macro through the middle."
        : undefined,
      arcDirective,
      `Play the ${role} beat as ONE continuous filmed moment with cause-and-effect motion — no teleporting hands, products, faces, or lighting between segments; do not finish early, freeze, loop, or pad; ${finalBeatClause}.`,
      sourceGuided
        ? "Use source/reference video only for rhythm, camera grammar, motion timing, and endpoint framing; replace script, faces, product, background, music, and claims with approved inputs."
        : undefined
    ].filter((line): line is string => Boolean(line)).join(" ");
  }

  /** Whether this shot is the video's final shot with a requested cliffhanger ending. */
  private isCliffhangerShot(shot: ShotContract): boolean {
    return this.isCliffhangerEndingShot(shot, this.videoArcRole(shot));
  }

  /**
   * Whether this clip ends mid-beat (the next clip continues the same unbroken action). The shot
   * planner marks it in the last timeline segment; runtime and final-frame contracts must agree.
   */
  private isContinuationExit(shot: ShotContract): boolean {
    return Boolean(shot.timeline?.[shot.timeline.length - 1]?.action?.includes(BEAT_CONTINUATION_SENTINEL));
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


  private buildFinalFrameSection(shot: ShotContract, bindingPlan: PromptBindingPlan): string {
    const hasLastFrameReference = bindingPlan.providerReferences.some((reference) =>
      reference.role === "last_frame" || reference.kind === "last_frame"
    );
    const cliffhanger = this.isCliffhangerShot(shot);
    // A mid-beat continuation clip must NOT settle (the next clip continues the same unbroken
    // action) — emitting "finish on a stable frame" for it contradicted the phasing plan and read
    // as one instruction the model could not reconcile (live-render forensics finding).
    const continuationExit = this.isContinuationExit(shot);
    const headline = cliffhanger
      ? "Final-frame contract (cliffhanger): finish on a stable, legible frame of the UNRESOLVED moment — the confrontation frozen, the reveal half-seen, the reply unspoken; do not resolve the action."
      : continuationExit
        ? "Final-frame contract: end mid-motion on a clean continuation handle — subject and product legible, the action visibly still in progress for the next clip."
        : "Final-frame contract: finish on a stable, usable frame with the main subject, product, and action result still legible.";
    const clauses = [
      headline,
      hasLastFrameReference ? "If a last-frame reference is present, move toward it without deforming identity or product details." : undefined,
      "Do not end on a blur, mid-blink, hidden product, cropped face, or empty frame."
    ].filter((line): line is string => Boolean(line));
    return clauses.join(" ");
  }

  /**
   * Two-register style engine (final-upgrade design): the REGISTER_GRAMMAR block is the invariant
   * frame (professional_cinematic vs natural_phone_kol, anti-AI-look guards built in); the
   * LLM-authored StyleDna supplies ALL per-request niche specifics as axis overrides; the legacy
   * CREATIVE_MODE_DNA/NICHE_DNA lookups fire ONLY when no styleDna/register exists (fallback path,
   * preserving old behavior for callers that do not author style).
   */
  private buildRegisterSection(shot: ShotContract, register: StyleRegister | undefined): string | undefined {
    const dna = shot.styleDna;
    if (!register) {
      // Legacy fallback: exactly the two sections this engine replaced.
      return [this.buildNicheDnaSection(shot), this.buildCinematicGrammarSection(shot)]
        .filter((line): line is string => Boolean(line && line.trim()))
        .join("\n");
    }
    // Each override line ends with a period so the axes never run together as one run-on sentence.
    const axis = (label: string, value: string | undefined): string | undefined =>
      value ? `${label}: ${this.stripTerminalPunctuation(value)}.` : undefined;
    const overrides = dna
      ? [
          axis("Optics (this video)", dna.optics),
          axis("Lighting look", dna.lighting),
          axis("Palette", dna.palette),
          axis("Motion", dna.motion),
          axis("Performance", dna.performance),
          axis("Audio-feel", dna.audioFeel),
          dna.moodWords?.length ? `Mood: ${dna.moodWords.join(", ")}.` : undefined,
          dna.avoid?.length ? `Avoid: ${dna.avoid.join(", ")}.` : undefined
        ].filter((line): line is string => Boolean(line))
      : [];
    // Authored AXES silence the legacy tables; a register-only DNA (register resolved upstream but
    // no axes written) still gets legacy niche color under the register frame, so threading the
    // register through the plan never costs category detail (audit #2). The resolved register is the
    // single source of truth for STYLE (audit #12): a keyword-classified creative mode that maps to
    // the OPPOSITE register (e.g. keyword "premium"->product_ad under an analyst-chosen phone-KOL
    // register) is dropped from the DNA lookup, so its cinematic/UGC style language can never sit
    // under a contradicting register frame — niche texture is kept either way.
    const hasAuthoredAxes = overrides.length > 0;
    const legacy = hasAuthoredAxes
      ? []
      : [this.buildNicheDnaSection(shot, register)].filter((line): line is string => Boolean(line && line.trim()));
    // Craft FLOOR: the professional_cinematic register frame carries a deliberately GENERIC optics/color
    // ("shallow depth of field", "cohesive palette"). The Seedance-reliable film vocabulary (rack focus,
    // anamorphic character, teal-and-orange / bleach-bypass grade, 35mm grain) lived only in the legacy
    // !register branch, so the main path lost it (audit #4). Re-attach it as a floor for cinematic —
    // ONLY when styleDna authored NO part of the look (optics/lighting/palette), so an authored grade
    // still wins and the two never stack. The floor follows the REGISTER, not the keyword mode.
    const authoredCinematicLook = Boolean(dna?.optics || dna?.lighting || dna?.palette);
    const cinematicCraftFloor = register === "professional_cinematic" && !authoredCinematicLook
      ? cinematicGrammarPromptLine(this.registerAgreedCreativeMode(shot, register) ?? "cinematic")
      : undefined;
    // Every axis the DNA overrides is dropped from the register frame so it is stated ONCE (the
    // override wins), never twice with a possibly-conflicting register default (audit). AND when the
    // cinematic craft floor fires it already carries optics+lighting+colour-grade in SPECIFIC film
    // vocabulary, so drop the register frame's GENERIC optics/lighting/color too — otherwise a
    // cinematic shot printed those axes twice (~600-900 chars of redundancy; the single biggest bloat
    // source measured on a real multi-reference cinematic prompt — cross-audit #5).
    const omitAxes: RegisterAxis[] = [
      ...(dna
        ? ([
            dna.optics ? "optics" : undefined,
            dna.lighting ? "lighting" : undefined,
            dna.palette ? "color" : undefined,
            dna.motion ? "motion" : undefined,
            dna.performance ? "performance" : undefined,
            dna.audioFeel ? "audioFeel" : undefined
          ].filter(Boolean) as RegisterAxis[])
        : []),
      ...(cinematicCraftFloor ? (["optics", "lighting", "color"] as RegisterAxis[]) : [])
    ];
    const spokenLanguage = this.stringMetadata(shot, "shortAudioLanguage")
      ?? this.stringMetadata(shot, "voiceLanguage")
      ?? this.stringMetadata(shot, "analystVoiceLanguage");
    const weakLipSyncLanguage = spokenLanguage === "vi" || containsVietnameseDiacritics(shot.spokenLine);
    return [
      // Real camera+lens gear anchor (mined, Seedance-tuned): named gear binds the model to genuine
      // film/phone imagery better than the word "cinematic". Emitted once, ahead of the axes.
      GEAR_ANCHOR_BY_REGISTER[register],
      // Each authored axis REPLACES the register default (omitted above) instead of stacking a
      // second, possibly-contradicting sentence on top of it (audit).
      registerGrammarPromptLine(register, { omit: omitAxes }),
      ...overrides,
      ...legacy,
      cinematicCraftFloor,
      // Verbatim scripted lines must not receive the "keep it short" instruction — that fought the
      // do-not-shorten mandate in the audio section (audit #17).
      weakLipSyncLanguage
        ? (shot.spokenLine ? DIALOGUE_LIGHT_VERBATIM_CLAUSE : DIALOGUE_LIGHT_LANGUAGE_CLAUSE)
        : undefined
    ].filter((line): line is string => Boolean(line)).join(" ");
  }

  /** The shot's effective style register: authored DNA first, then the legacy creative-mode map. */
  private resolveStyleRegister(shot: ShotContract): StyleRegister | undefined {
    return shot.styleDna?.register ?? registerForCreativeMode(this.creativeModeMetadata(shot));
  }

  /**
   * The shot's creative mode, but ONLY when it does not contradict the resolved register (audit #12).
   * A mode with no register mapping (unknown/neutral) passes through; a mode bound to the OPPOSITE
   * register (keyword classifier vs analyst disagreement) returns undefined so the register frame
   * stays the single stylistic voice.
   */
  private registerAgreedCreativeMode(shot: ShotContract, register: StyleRegister): string | undefined {
    const mode = this.creativeModeMetadata(shot);
    if (!mode) {
      return undefined;
    }
    const modeRegister = registerForCreativeMode(mode);
    return modeRegister === undefined || modeRegister === register ? mode : undefined;
  }

  /** The one metadata-key chain for creative mode — every section resolves it identically. */
  private creativeModeMetadata(shot: ShotContract): string | undefined {
    return (
      this.stringMetadata(shot, "shortViralCreativeMode") ??
      this.stringMetadata(shot, "shortDirectorCreativeMode") ??
      this.stringMetadata(shot, "creativeMode")
    );
  }

  /**
   * Niche and creative-mode prompt DNA. Fires only when the shot metadata carries a `niche`
   * or `creativeMode` so the final provider prompt gets category-specific physical direction
   * (e.g. macro skin texture for beauty, fit-in-motion for fashion). No-ops otherwise.
   */
  private buildNicheDnaSection(shot: ShotContract, register?: StyleRegister): string | undefined {
    // The short pipeline stamps niche/creative-mode onto shot metadata under these keys
    // (via the render handoff -> intake -> shot planner). Accept the direct keys too so
    // long-form/direct callers can opt in. When a register is resolved it is the single source of
    // truth for style (audit #12): a keyword mode bound to the opposite register is dropped here so
    // its style language never contradicts the register frame (legacy !register callers pass none —
    // unchanged behavior).
    const niche = this.stringMetadata(shot, "shortViralNiche") ?? this.stringMetadata(shot, "niche");
    const creativeMode = register
      ? this.registerAgreedCreativeMode(shot, register)
      : this.creativeModeMetadata(shot);
    if (!niche && !creativeMode) {
      return undefined;
    }
    const lines = resolveSeedanceDna({
      ...(niche ? { niche } : {}),
      ...(creativeMode ? { creativeMode } : {})
    }).promptLines;
    // The creative MODE is register-gated above, but the NICHE directive used to pass through
    // unconditionally — handing the phone-KOL register cinematic niche language in the same
    // paragraph ("filmic premium look, color grade" beside "NO film grade"; "smooth walkthrough
    // parallax" beside "NO gimbal smoothness"; "cuts synced to beats" beside "NO scored music") —
    // contradiction-probe #3. Under the phone register, drop a NICHE line whose vocabulary is
    // inherently cinematic/scored/stabilized. Two deliberate bounds: (1) only "Niche DNA" lines are
    // filtered — the mode line was already register-AGREED above, and its text legitimately NAMES
    // the forbidden looks in negations ("never slow-motion pacing"); (2) negated phrases are
    // stripped before matching, so prohibition language never counts as cinematic vocabulary.
    // Compatible niche texture (subject matter, macro detail, ingredients) passes untouched; the
    // cinematic register keeps everything.
    const phoneIncompatible =
      /\b(cinematic|filmic|film grade|color grade|graded|bokeh|shallow depth|anamorphic|gimbal|dolly|crane|jib|parallax|slow[- ]?motion|speed ramp|synced to beats|beat-?sync\w*|scored?\b|orchestral)/i;
    const affirmativeText = (line: string): string => line.replace(/\b(?:never|no|not)\b[^,;.]*/gi, "");
    const keptLines = register === "natural_phone_kol"
      ? lines.filter((line) => !line.startsWith("Niche DNA (") || !phoneIncompatible.test(affirmativeText(line)))
      : lines;
    return keptLines.length > 0 ? keptLines.join(" ") : undefined;
  }

  /**
   * Reliable-Seedance cinematography line: focus/lens, lighting, colour grade, and lens
   * character chosen for the creative mode. This speaks Seedance's film-grammar language so
   * lens/light/grade are directed instead of left to chance — the top output-quality lift
   * once the CRAFT anatomy is complete. Mode-keyed; falls back to a grounded default.
   */
  private buildCinematicGrammarSection(shot: ShotContract): string {
    return cinematicGrammarPromptLine(this.creativeModeMetadata(shot));
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
  private buildRealismGuardrailsSection(register: StyleRegister | undefined): string {
    // Compact 3-sentence form (was a 7-sentence wall duplicating the negative prompt — the
    // exhaustive banned-artifact list lives in negativePrompt, per live-render forensics).
    // The capture sentence is register-aware: the cinematic wording (motivated light, cinematic
    // capture, speculars) actively fought the natural_phone_kol register's anti-cinematic guards
    // (audit #8); the artifact-suppression sentences are register-neutral and always apply.
    // Three-way, not binary: an UNRESOLVED register used to fall through to the CINEMATIC capture
    // wording (motivated speculars, cinematic depth), which imposes a glossy film look on an unlabeled
    // UGC/phone brief and fails the "is this real?" test (audit #9). Cinematic gloss is the wording most
    // likely to read as an AI ad, so an unknown register gets a NEUTRAL photoreal sentence instead —
    // committing to neither cinematic speculars nor phone-sensor character.
    const captureSentence = register === "natural_phone_kol"
      ? "Realism guardrails: photoreal phone-camera capture, not CGI, cartoon, or an obvious AI render — real phone-sensor depth and motion blur, unshaped available light with accurate contact shadows, true material microtexture (skin pores, fabric weave, glass, condensation)."
      : register === "professional_cinematic"
        ? "Realism guardrails: photoreal cinematic capture, not CGI, cartoon, or an obvious AI render — real lens depth-of-field and motion blur, motivated light with accurate contact shadows and physically based speculars, true material microtexture (skin pores, fabric weave, glass, condensation)."
        : "Realism guardrails: photoreal camera capture, not CGI, cartoon, or an obvious AI render — real lens depth and natural motion blur, physically motivated light with accurate contact shadows, true material microtexture (skin pores, fabric weave, glass, condensation).";
    return [
      captureSentence,
      "Motion stays organic with natural weight and small secondary micro-movements; no extra or fused fingers, morphing edges, temporal flicker, warped logos/text, or melting geometry.",
      // The loudest human AI-tells are waxy skin and dead eyes (research: pxz.ai negative-prompt study,
      // "In Ictu Oculi" blink forensics). State them as a POSITIVE floor since Seedance weights the
      // prompt over the negative field, always-on regardless of register.
      "Any person keeps natural skin with visible pores, fine lines and subtle asymmetry — never waxy, plastic, over-smoothed, airbrushed, or doll-like — and living eyes with a true catchlight and natural blink, never dead, glassy, or vacant.",
      "No visible generated text, captions, subtitles, watermark, or fake UI unless explicitly requested."
    ].join(" ");
  }

  /**
   * Merged boundary contract (was three sections: Inter-shot bridge + Boundary choreography + a
   * standalone Transition line, with the transition intent printed twice and the continuity anchors
   * re-printed — all stated once now; the anchors live only in the Continuity section).
   */
  private buildBoundarySection(shot: ShotContract, bindingPlan: PromptBindingPlan): string | undefined {
    const previousState = shot.continuity.previousShotEndState;
    const nextState = shot.continuity.nextShotStartState;
    // A whole-video-in-one-clip shot has NO adjacent clips: telling it to "cut together with adjacent
    // clips" and hand off "to the next proof beat" (a transitionIntent leaked from the shot template)
    // is contradictory bookkeeping that pushes the ending to feel unresolved (single-clip audit). The
    // final-frame contract already governs how a full video ends.
    if (this.videoArcRole(shot) === "full_video" && !previousState && !nextState) {
      return undefined;
    }
    const hasEndpointReference = bindingPlan.providerReferences.some((reference) =>
      reference.role === "first_frame" ||
      reference.role === "last_frame" ||
      reference.kind === "first_frame" ||
      reference.kind === "last_frame"
    );
    if (!previousState && !nextState && !hasEndpointReference && !shot.transitionIntent) {
      return undefined;
    }
    const bridgeLines = [
      "Boundary: this clip must cut together with adjacent clips as one continuous film.",
      // A mid-video clip must ENTER ALREADY IN MOTION, continuing the previous clip's momentum —
      // opening each clip on a static pose before moving is the #1 cause of the stiff, slow,
      // "posed AI ad" rhythm; real creator footage never resets between cuts (live-render feedback).
      previousState
        ? "Entry: enter ALREADY MID-MOTION, continuing the previous clip's action, camera momentum, screen direction, lens distance, subject scale, lighting color, and product/KOL state exactly (see Continuity) — do NOT pause on a static opening pose or restart the action."
        : "Entry: open mid-action on the strongest readable instant — the subject already moving or reacting, never settling into position first.",
      nextState
        ? "Exit: keep the action's energy alive into the final 0.5s — a clean next-shot handle with subject and product visible, still breathing with natural micro-movement, never a frozen pose."
        : this.isCliffhangerShot(shot)
          ? "Exit: hold the final 0.5s on the unresolved cliffhanger frame — technically clean (no whip, blur, blink, or crop) while the story stays deliberately unresolved."
          : "Exit: settle the final 0.5s as a clean delivery handle with natural micro-movement (breathing, small gesture), no frozen mannequin pose, no unresolved whip, blur, blink, or cropped product.",
      shot.transitionIntent ? `Transition: ${this.stripTerminalPunctuation(shot.transitionIntent)}.` : undefined,
      "Do not create a new location, different product scale, different KOL face, sudden color shift, or unrelated camera angle at the boundary; do not rely on postproduction crossfade to hide mismatched endpoints."
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
    if (startSecond <= 0 && endSecond >= targetDurationSeconds) {
      return `Story arc: this clip covers the full ${targetDurationSeconds}s video${positionLine}; open clearly, develop visibly, and resolve cleanly.`;
    }
    return `Story arc: this shot covers ${startSecond}-${endSecond}s of ${targetDurationSeconds}s${positionLine}; advance the ${role} movement and hand off cleanly to the next beat.`;
  }

  private buildContinuitySection(shot: ShotContract, bindingPlan: PromptBindingPlan): string {
    const continuity = shot.continuity;
    // Boundary labels are phrased to match their content: the previous shot's END is what this clip's
    // first frame continues from; the next shot's START is what the last frame hands off to. (The old
    // "Start state: end on identity=Mai" inversion read as a directive to end THIS shot on Mai —
    // confirmed against the real paid-run prompts.)
    const clauses = [
      continuity.identity ? `Identity: preserve ${continuity.identity}.` : undefined,
      continuity.product ? `${this.productContinuityLabel(continuity.product, bindingPlan)}: preserve ${continuity.product}.` : undefined,
      continuity.wardrobe ? `Wardrobe: preserve ${continuity.wardrobe}.` : undefined,
      continuity.environment ? `Environment: preserve ${continuity.environment}.` : undefined,
      continuity.style ? `Visual continuity: maintain ${continuity.style}.` : undefined,
      continuity.previousShotEndState
        ? `Continue from the previous shot's end: ${continuity.previousShotEndState}.`
        : undefined,
      continuity.nextShotStartState
        ? `Hand off to the next shot's start: ${continuity.nextShotStartState}.`
        : undefined
    ].filter((clause): clause is string => Boolean(clause));

    return clauses.length > 0 ? `Continuity:\n${clauses.map((clause) => `- ${clause}`).join("\n")}` : "Continuity: follow scene context with no unexplained changes.";
  }

  private buildTimelineSection(timeline: readonly TimelineSegment[], shot: ShotContract): string {
    const lines = timeline.map((segment, index) => {
      const segmentDuration = Math.max(0, segment.endSecond - segment.startSecond);
      // Camera and audio are DELTAS: only stated when the beat departs from the shot's home camera /
      // base audio intent. Repeating identical lines in every beat (the old behavior) tripled the
      // text with zero signal — the base audio plan lives once in the audio section.
      const cameraDelta = segment.camera && segment.camera.trim() !== shot.camera.trim()
        ? `camera ${segment.camera}`
        : undefined;
      const audioDelta = this.timelineAudioDelta(segment.audioCue, shot.audioIntent);
      // The planner embeds the FULL shot action inside the middle beat's template text; the Action
      // line already states it verbatim, so the timeline refers back instead of repeating ~40 words.
      const dedupedAction = this.dedupeEmbeddedShotAction(segment.action, shot.action);
      const parts = [
        `Beat ${index + 1}, ${segment.startSecond}-${segment.endSecond}s: ${this.providerActionText(dedupedAction)}`,
        cameraDelta,
        audioDelta,
        // Per-beat word caps are for model-authored narration only: with a VERBATIM spokenLine the
        // caps would contradict the do-not-shorten mandate (the merged single-clip line spans beats)
        // — and a continuation sub-clip of that beat is STILL delivering the scripted line, so it
        // gets no cap either (contradiction-probe #5).
        segment.audioCue && !shot.spokenLine && !shot.spokenLineContinuation
          ? `keep spoken words within about ${this.voiceoverWordBudget(segmentDuration)} words for this beat`
          : undefined
      ].filter((part): part is string => Boolean(part));
      return parts.join("; ");
    });
    const cliffhangerOverride = this.isCliffhangerShot(shot)
      ? "\n- Ending-beat override: play the final timeline beat as a cliffhanger hold — drive tension to the last second and cut before the resolution lands; this override supersedes any 'resolves the story' or 'settled' wording in the beats above."
      : "";
    return `Timeline:\n${lines.map((line) => `- ${line}.`).join("\n")}${cliffhangerOverride}`;
  }

  /** Replace a verbatim copy of the shot action embedded in a timeline beat with a back-reference. */
  private dedupeEmbeddedShotAction(segmentAction: string, shotAction: string): string {
    const canonical = shotAction.replace(/[.\s]+$/u, "").trim();
    if (canonical.length < 40 || !segmentAction.includes(canonical)) {
      return segmentAction;
    }
    return segmentAction.replace(canonical, "the planned Action above");
  }

  /**
   * Per-beat audio as a delta against the shot's base audio intent: the planner builds each beat cue
   * as "<base audio intent>; <phase-specific note>", so re-printing the base in all three beats says
   * nothing new. Emit only the phase-specific tail; the base lives once in the audio section.
   */
  private timelineAudioDelta(audioCue: string | undefined, audioIntent: string | undefined): string | undefined {
    if (!audioCue?.trim()) {
      return undefined;
    }
    // On continuation sub-clips the SHOT's audio intent carries the planner's CONTINUATION suffix
    // while the timeline cues were built from the un-suffixed BEAT intent — compare against the
    // suffix-free base or the dedup never matches and the full base is re-printed in every beat
    // (contradiction-probe #5: ~600 wasted chars per continuation shot, one real shot blew the
    // 8,000-char ceiling).
    const rawBase = audioIntent?.trim();
    const markerIndex = rawBase ? rawBase.indexOf(CONTINUATION_AUDIO_MARKER) : -1;
    const base = markerIndex >= 0 ? rawBase!.slice(0, markerIndex).trim() : rawBase;
    if (base && audioCue.startsWith(base)) {
      const tail = audioCue.slice(base.length).replace(/^\s*;\s*/, "").trim();
      return tail ? `audio: ${tail}` : undefined;
    }
    return `audio cue ${audioCue}`;
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

  /** Trim trailing sentence terminators so appending the section's own "." never yields "..". */
  private stripTerminalPunctuation(value: string): string {
    return value.replace(/[.\s]+$/u, "").trim();
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
    return this.stripTerminalPunctuation(this.compactProviderText(normalized, 1_100));
  }

  private compactProviderText(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }
    const clipped = value.slice(0, maxChars);
    const boundary = Math.max(clipped.lastIndexOf(";"), clipped.lastIndexOf("."), clipped.lastIndexOf(","));
    return `${clipped.slice(0, boundary > maxChars * 0.6 ? boundary : maxChars).trim()}...`;
  }

  private buildAudioProductionSection(shot: ShotContract, register?: StyleRegister): string | undefined {
    // Seedance never leaves audio blank: when generate_audio is on and the prompt says nothing about
    // sound, the model invents a generic library score (the "scored like a car advert" default). So a
    // silent-intent b-roll shot with no audioIntent MUST still state its intended sound — otherwise
    // Seedance dubs stock music over a "filmed on a phone" clip and breaks the natural register
    // (research: fal.ai Seedance 2.0 prompting guide). Emit a register-appropriate sound design floor.
    if (!shot.audioIntent && !shot.spokenLine) {
      const soundFloor = register === "natural_phone_kol"
        ? "Audio design: real in-camera phone sound only — room tone and natural contact noise, NO added or background music, no scored bed; it must sound recorded on the phone, not dubbed."
        : register === "professional_cinematic"
          ? "Audio design: motivated diegetic ambience and light foley sized to the action; no library/stock music bed unless specified, and any score stays subtle under the moment."
          : "Audio design: natural diegetic ambience and foley for this action; no added background music unless specified.";
      return `${soundFloor} Generate only original ambience/sound on this shot's timing — no protected songs, melodies, transcripts, or voices.`;
    }
    const wordBudget = this.voiceoverWordBudget(shot.durationSeconds);
    return [
      // Verbatim scripted line first, quoted and marked do-not-change, emitted exactly as authored
      // (never through providerActionText's normalizer/truncator) so script-first dialogue survives.
      shot.spokenLine
        ? `Dialogue is in the character's own language; keep it exactly as written and keep all other direction in English. Spoken line (VERBATIM — deliver word-for-word, do not paraphrase, translate, or shorten): "${shot.spokenLine}".`
        : undefined,
      // Anti-AI-tell for talking shots: small mouth movement, steady head/camera, no music under the
      // line (micro-drama naturalness, #5 upgrade). Only when the shot actually has a spoken line.
      shot.spokenLine ? TALKING_HEAD_NATURALNESS_CLAUSE : undefined,
      shot.audioIntent ? `Audio production plan: ${this.stripTerminalPunctuation(shot.audioIntent)}.` : undefined,
      // A VERBATIM scripted line must not also receive a word CAP — "do not shorten" next to "keep
      // under N words" is a direct self-contradiction whenever the line is longer (single-clip merge
      // audit): with a spokenLine the pacing guidance drops the cap; the cap applies only to free
      // narration the model authors itself. A continuation sub-clip of a spokenLine beat is STILL
      // delivering that scripted narration (the line rides the first sub-clip), so it gets the
      // continuation pacing sentence, never the cap (contradiction-probe #5).
      shot.spokenLine
        ? `Generate only original ambience/music/voice on this shot's timing — no protected songs, melodies, transcripts, or voices. Pace the scripted line naturally across the ${shot.durationSeconds}s with micro-pauses around product contact or reactions; the visual story must read without audio.`
        : shot.spokenLineContinuation
          ? `Generate only original ambience/music/voice on this shot's timing — no protected songs, melodies, transcripts, or voices. Continue the beat's scripted narration seamlessly across the ${shot.durationSeconds}s without repeating lines already spoken; the visual story must read without audio.`
          : `Generate only original ambience/music/voice on this shot's timing — no protected songs, melodies, transcripts, or voices. Keep narration under about ${wordBudget} spoken words for ${shot.durationSeconds}s with micro-pauses around product contact or reactions; the visual story must read without audio.`
    ]
      .filter((line): line is string => Boolean(line))
      .join(" ");
  }

  private voiceoverWordBudget(durationSeconds: number): number {
    const seconds = Number.isFinite(durationSeconds) ? Math.max(1, durationSeconds) : 4;
    return Math.max(3, Math.floor(seconds * VOICEOVER_WORDS_PER_SECOND));
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
