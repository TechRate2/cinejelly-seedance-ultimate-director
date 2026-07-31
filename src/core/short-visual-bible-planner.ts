import type {
  ProductUrlBrief,
  ShortMediaReferencePlan,
  ShortPipelineIntent,
  ShortPipelineScenePlan,
  ShortReferenceRemakeBlueprint,
  ShortVisualBibleAssetPlan,
  ShortVisualBibleDurationBand,
  ShortVisualBibleExecutionBlueprint,
  ShortVisualBibleExecutionMode,
  ShortVisualBibleImagePromptPack,
  ShortVisualBibleInput,
  ShortVisualBibleMode,
  ShortVisualBiblePlan,
  ShortVisualBibleRecommendedPipe,
  ShortVisualBibleSequencePlan,
  ShortVisualBibleStatus
} from "../types/short-pipeline.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  SHORT_VISUAL_BIBLE_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_VISUAL_BIBLE_SOURCE_PATTERN_IDS);

export interface ShortVisualBiblePlannerInput {
  readonly projectId: string;
  readonly requestId?: string;
  readonly prompt: string;
  readonly intent: ShortPipelineIntent;
  readonly productBrief?: ProductUrlBrief;
  readonly scenes: readonly ShortPipelineScenePlan[];
  readonly mediaReferencePlan: readonly ShortMediaReferencePlan[];
  readonly referenceRemakeBlueprint?: ShortReferenceRemakeBlueprint;
  readonly visualBible?: ShortVisualBibleInput;
}

export class ShortVisualBiblePlanner {
  public build(input: ShortVisualBiblePlannerInput): ShortVisualBiblePlan {
    const requestedMode = input.visualBible?.mode ?? "auto";
    const durationBand = durationBandFor(input.intent.targetDurationSeconds);
    const reasonCodes = reasonCodesFor(input, requestedMode);
    const status = statusFor(requestedMode, reasonCodes);
    const recommendedPipe = recommendedPipeFor(input, requestedMode, status, durationBand);
    const explicitBlocking = Boolean(input.visualBible?.requireBeforeRender) ||
      requestedMode === "reference_board" ||
      requestedMode === "storyboard_board" ||
      requestedMode === "production_bible";
    const blocksRenderUntilAssetsApproved = status === "required" &&
      explicitBlocking &&
      assetGapExists(input, requestedMode, durationBand);
    const sequencePlan = sequencePlanFor(input.intent.targetDurationSeconds, input.scenes.length, durationBand);
    const assetPlans = status === "not_needed"
      ? []
      : assetPlansFor(input, requestedMode, status, durationBand, sequencePlan);
    const seedanceBindingPlan = seedanceBindingPlanFor(assetPlans, input.mediaReferencePlan);
    const executionBlueprint = executionBlueprintFor(input, status, recommendedPipe, durationBand, sequencePlan, assetPlans);
    const promptContracts = promptContractsFor(status, durationBand, input.intent.targetDurationSeconds, input.scenes);
    const qualityGates = qualityGatesFor(status, durationBand, assetPlans);
    const warnings = warningsFor(input, status, blocksRenderUntilAssetsApproved);
    const planId = createStableId(
      "short_visual_bible",
      [
        input.projectId,
        input.requestId ?? "",
        requestedMode,
        recommendedPipe,
        durationBand,
        reasonCodes.join("|"),
        input.mediaReferencePlan.map((reference) => `${reference.promptTag}:${reference.promptRole}:${reference.status}`).join("|")
      ].join(":")
    );

    return {
      schemaVersion: "cinejelly.short-visual-bible-plan.v1",
      planId,
      status,
      requestedMode,
      recommendedPipe,
      durationBand,
      imageProviderPolicy: input.visualBible?.imageProviderPolicy ?? "provider_neutral",
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      reasonCodes,
      assetPlans,
      sequencePlan,
      executionBlueprint,
      seedanceBindingPlan,
      promptContracts,
      qualityGates,
      guardrails: guardrailsFor(status),
      warnings,
      releaseGateSummary: {
        canUseAsNoSpendVisualBibleEvidence: true,
        blocksRenderUntilAssetsApproved,
        releaseBlocker: blocksRenderUntilAssetsApproved
          ? "Visual-bible workflow was explicitly requested; render should wait until required reference-board/storyboard assets are generated or approved."
          : "Visual-bible plan is no-spend planning evidence; render still requires review approval, media rights, model routing, cost gates, and artifact validation."
      }
    };
  }
}

function reasonCodesFor(input: ShortVisualBiblePlannerInput, requestedMode: ShortVisualBibleMode): readonly string[] {
  if (requestedMode === "off") {
    return ["visual_bible_off"];
  }
  const hasIdentity = input.mediaReferencePlan.some((reference) => reference.promptRole === "identity");
  const hasProduct = input.mediaReferencePlan.some((reference) => reference.promptRole === "product");
  const hasStyleOrEnvironment = input.mediaReferencePlan.some((reference) =>
    reference.promptRole === "style" || reference.promptRole === "environment"
  );
  const hasSourceVideo = Boolean(input.referenceRemakeBlueprint) ||
    input.mediaReferencePlan.some((reference) => reference.promptRole === "source_video_structure");
  const prompt = input.prompt.toLowerCase();
  const asksForCinematicConsistency = promptRequestsCinematicConsistency(prompt);
  return unique([
    requestedMode !== "auto" ? `requested_${requestedMode}` : undefined,
    hasIdentity ? "identity_reference_present" : undefined,
    hasProduct || input.productBrief ? "product_evidence_present" : undefined,
    hasStyleOrEnvironment ? "style_or_environment_reference_present" : undefined,
    hasSourceVideo ? "source_or_remake_structure_present" : undefined,
    input.intent.targetDurationSeconds > 15 ? "multishot_duration" : undefined,
    input.intent.targetDurationSeconds > 60 ? "sequence_duration" : undefined,
    input.scenes.length >= 4 ? "many_scene_beats" : undefined,
    asksForCinematicConsistency ? "cinematic_consistency_requested" : undefined
  ]);
}

function promptRequestsCinematicConsistency(prompt: string): boolean {
  const exactOrPhraseSignals = [
    "cinematic",
    "consistent",
    "character",
    "nhan vat",
    "nhân vật",
    "kol",
    "storyboard",
    "reference",
    "visual bible",
    "character sheet",
    "style sheet",
    "goc",
    "góc",
    "nhat quan",
    "nhất quán",
    "san pham",
    "sản phẩm"
  ];
  const vietnameseUnicodeSignals = ["nh\u00e2n v\u1eadt", "g\u00f3c", "nh\u1ea5t qu\u00e1n", "s\u1ea3n ph\u1ea9m"];
  return [...exactOrPhraseSignals, ...vietnameseUnicodeSignals].some((signal) => prompt.includes(signal)) ||
    /\bproduct\b/.test(prompt);
}

function statusFor(requestedMode: ShortVisualBibleMode, reasonCodes: readonly string[]): ShortVisualBibleStatus {
  if (requestedMode === "off") {
    return "not_needed";
  }
  if (requestedMode !== "auto") {
    return "required";
  }
  return reasonCodes.some((code) =>
    [
      "identity_reference_present",
      "product_evidence_present",
      "style_or_environment_reference_present",
      "source_or_remake_structure_present",
      "multishot_duration",
      "sequence_duration",
      "cinematic_consistency_requested"
    ].includes(code)
  )
    ? "recommended"
    : "not_needed";
}

function recommendedPipeFor(
  input: ShortVisualBiblePlannerInput,
  requestedMode: ShortVisualBibleMode,
  status: ShortVisualBibleStatus,
  durationBand: ShortVisualBibleDurationBand
): ShortVisualBibleRecommendedPipe {
  if (status === "not_needed") {
    return "normal_short_pipe";
  }
  if (input.referenceRemakeBlueprint) {
    return "video_remake_pipe";
  }
  if (requestedMode === "storyboard_board") {
    return "storyboard_board_pipe";
  }
  if (requestedMode === "production_bible" || durationBand === "midform_sequence_60_180" || durationBand === "long_sequence_180_480") {
    return "long_sequence_bible_pipe";
  }
  const hasIdentityOrProduct = input.mediaReferencePlan.some((reference) =>
    reference.promptRole === "identity" || reference.promptRole === "product"
  ) || Boolean(input.productBrief);
  if (hasIdentityOrProduct) {
    return requestedMode === "reference_board" ? "reference_board_pipe" : "product_kol_reference_pipe";
  }
  return "storyboard_board_pipe";
}

function assetGapExists(
  input: ShortVisualBiblePlannerInput,
  requestedMode: ShortVisualBibleMode,
  durationBand: ShortVisualBibleDurationBand
): boolean {
  if (requestedMode === "off" || requestedMode === "auto") {
    return false;
  }
  const readyRoles = new Set(input.mediaReferencePlan.filter((reference) => reference.status === "ready").map((reference) => reference.promptRole));
  if (requestedMode === "storyboard_board" && !readyRoles.has("first_frame") && !readyRoles.has("style")) {
    return true;
  }
  if (requestedMode === "reference_board" && !readyRoles.has("identity") && !readyRoles.has("product")) {
    return true;
  }
  return requestedMode === "production_bible" || durationBand === "midform_sequence_60_180" || durationBand === "long_sequence_180_480";
}

function assetPlansFor(
  input: ShortVisualBiblePlannerInput,
  requestedMode: ShortVisualBibleMode,
  status: ShortVisualBibleStatus,
  durationBand: ShortVisualBibleDurationBand,
  sequencePlan: ShortVisualBibleSequencePlan
): readonly ShortVisualBibleAssetPlan[] {
  const plans: ShortVisualBibleAssetPlan[] = [];
  const required = status === "required";
  const hasIdentity = input.mediaReferencePlan.some((reference) => reference.promptRole === "identity");
  const hasProduct = input.mediaReferencePlan.some((reference) => reference.promptRole === "product");
  const hasEnvironment = input.mediaReferencePlan.some((reference) => reference.promptRole === "environment");
  const hasStyle = input.mediaReferencePlan.some((reference) => reference.promptRole === "style");
  const hasFirstFrame = input.mediaReferencePlan.some((reference) => reference.promptRole === "first_frame");

  if (hasIdentity || requestedMode === "reference_board" || requestedMode === "production_bible") {
    plans.push(assetPlan(input, "identity_sheet", "KOL/character identity sheet", hasIdentity ? "derive_from_existing_reference" : "generate_before_seedance", required, "identity", "identity", "@image1", 3, 3, [
      "same face identity across front, side, and three-quarter views",
      "consistent hair, wardrobe, skin texture, lens, and lighting",
      "neutral expression plus one natural creator reaction for UGC motion"
    ]));
  }
  if (hasProduct || input.productBrief || requestedMode === "reference_board" || requestedMode === "production_bible") {
    plans.push(assetPlan(input, "product_sheet", "Product geometry and packaging sheet", hasProduct ? "derive_from_existing_reference" : "generate_before_seedance", required, "product", "product", hasIdentity ? "@image2" : "@image1", 2, 4, [
      "front hero product, angled product, texture/material close-up, packaging scale next to hand",
      "lock logo placement and label shape without adding new text",
      "show use-context proof without unsupported before/after claims"
    ]));
  }
  if (hasEnvironment || durationBand !== "single_clip_5_15" || requestedMode === "production_bible") {
    plans.push(assetPlan(input, "environment_board", "Scene background and set board", hasEnvironment ? "derive_from_existing_reference" : "optional_quality_upgrade", false, "environment", "environment", undefined, 1, 3, [
      "room/set layout, depth, props, background color, lens distance",
      "keep product and KOL anchors higher priority than background mood"
    ]));
  }
  if (hasStyle || requestedMode === "storyboard_board" || requestedMode === "production_bible") {
    plans.push(assetPlan(input, "style_board", "Lighting, palette, and camera mood board", hasStyle ? "derive_from_existing_reference" : "optional_quality_upgrade", false, "style", "style", undefined, 1, 3, [
      "lighting source, contrast, color palette, lens language, material mood",
      "style guides the video after identity and product geometry are preserved"
    ]));
  }
  if (!hasFirstFrame && (requestedMode === "storyboard_board" || requestedMode === "production_bible" || sequencePlan.targetClipCount <= 1)) {
    plans.push(assetPlan(input, "first_frame_board", "Opening frame lock", "generate_before_seedance", required && requestedMode !== "reference_board", "first_frame", "first_frame", undefined, 1, 1, [
      "first frame must communicate the hook without audio",
      "product or human tension visible immediately",
      "composition leaves room for motion without visible captions"
    ]));
  }
  if (requestedMode === "storyboard_board" || requestedMode === "production_bible" || durationBand !== "single_clip_5_15") {
    plans.push(assetPlan(input, durationBand === "single_clip_5_15" ? "storyboard_board" : "sequence_board", "Storyboard panel board", requestedMode === "auto" ? "optional_quality_upgrade" : "generate_before_seedance", required && requestedMode !== "auto", "style", "style", undefined, Math.min(8, Math.max(3, input.scenes.length)), Math.min(9, Math.max(4, input.scenes.length)), [
      "panel grid covers hook, setup, proof/demo, transition, and payoff",
      "each panel has second-by-second camera/action/SFX note",
      "Seedance receives board as planning/reference guidance, not copied captions"
    ]));
  }
  return plans;
}

function assetPlan(
  input: ShortVisualBiblePlannerInput,
  role: ShortVisualBibleAssetPlan["role"],
  label: string,
  sourcePolicy: ShortVisualBibleAssetPlan["sourcePolicy"],
  requiredBeforeRender: boolean,
  promptRole: NonNullable<ShortVisualBibleAssetPlan["promptRole"]>,
  providerKind: NonNullable<ShortVisualBibleAssetPlan["providerKind"]>,
  preferredPromptTag: string | undefined,
  minimumViewCount: number,
  maximumImageCount: number,
  promptLines: readonly string[]
): ShortVisualBibleAssetPlan {
  return {
    schemaVersion: "cinejelly.short-visual-bible-asset.v1",
    assetPlanId: createStableId("short_visual_asset", [input.projectId, input.requestId ?? "", role, label, sourcePolicy].join(":")),
    role,
    label,
    sourcePolicy,
    requiredBeforeRender,
    ...(promptRole ? { promptRole } : {}),
    ...(providerKind ? { providerKind } : {}),
    ...(preferredPromptTag ? { preferredPromptTag } : {}),
    minimumViewCount,
    maximumImageCount,
    promptBrief: promptLines.join(" "),
    imagePromptPack: imagePromptPackFor(input, {
      role,
      label,
      sourcePolicy,
      promptRole,
      providerKind,
      preferredPromptTag,
      minimumViewCount,
      maximumImageCount,
      promptLines
    }),
    seedanceBindingPriority: promptRole === "identity" || promptRole === "product" || promptRole === "first_frame" ? "primary" : "supporting",
    sourceEvidence: unique([
      input.productBrief?.title ? `product=${input.productBrief.title}` : undefined,
      `duration=${input.intent.targetDurationSeconds}s`,
      `platform=${input.intent.platform}`,
      `sceneCount=${input.scenes.length}`
    ])
  };
}

function imagePromptPackFor(
  input: ShortVisualBiblePlannerInput,
  asset: {
    readonly role: ShortVisualBibleAssetPlan["role"];
    readonly label: string;
    readonly sourcePolicy: ShortVisualBibleAssetPlan["sourcePolicy"];
    readonly promptRole: NonNullable<ShortVisualBibleAssetPlan["promptRole"]>;
    readonly providerKind: NonNullable<ShortVisualBibleAssetPlan["providerKind"]>;
    readonly preferredPromptTag: string | undefined;
    readonly minimumViewCount: number;
    readonly maximumImageCount: number;
    readonly promptLines: readonly string[];
  }
): ShortVisualBibleImagePromptPack {
  const sceneArc = input.scenes
    .slice(0, 6)
    .map((scene) => `${scene.order}:${scene.role}:${scene.goal}`)
    .join(" | ");
  const contextLines = unique([
    input.productBrief?.title ? `Product anchor: ${input.productBrief.title}.` : undefined,
    input.productBrief?.category ? `Product category: ${input.productBrief.category}.` : undefined,
    `Platform: ${input.intent.platform}; aspect ratio: ${input.intent.aspectRatio}; target duration: ${input.intent.targetDurationSeconds}s.`,
    `Story arc: ${sceneArc || "hook, setup, proof/demo, payoff"}.`,
    input.referenceRemakeBlueprint
      ? `Source-video remake context: preserve beat structure only; replace people, product, background, audio, claims, captions, and marks with approved user assets.`
      : undefined
  ]);
  const layout = imagePromptLayoutFor(asset.role);
  const referenceTag = asset.preferredPromptTag ?? `${asset.role}`;
  const prompt = [
    `Create one original ${asset.label.toLowerCase()} as a single image reference sheet for a Seedance reference-to-video workflow.`,
    `Layout: ${layout}; include ${asset.minimumViewCount}-${asset.maximumImageCount} clear view(s) or panel(s) in one image.`,
    `Source policy: ${asset.sourcePolicy}. If approved user reference assets exist, preserve their identity/product facts; if they do not exist, create only an original generic production guide and do not invent real brand claims or a real person's likeness.`,
    ...contextLines,
    `Production requirements: ${asset.promptLines.join(" ")}`,
    roleSpecificImagePrompt(asset.role),
    "No written labels are needed; communicate timing, motion, scale, lighting, and panel order through composition only.",
    "The image must be useful as a Seedance reference, with clean framing, stable identity/product geometry, readable action states, and no distracting design decoration."
  ].join(" ");
  return {
    schemaVersion: "cinejelly.short-visual-bible-image-prompt.v1",
    provider: "provider_neutral_image_model",
    layout,
    outputPolicy: "single_image_reference_sheet",
    minPanelOrViewCount: asset.minimumViewCount,
    maxPanelOrViewCount: asset.maximumImageCount,
    prompt,
    negativePrompt: imagePromptNegativePromptFor(asset.role),
    seedanceBindingInstruction: seedanceBindingInstructionFor(asset, referenceTag),
    approvalChecklist: imagePromptApprovalChecklistFor(asset.role, referenceTag)
  };
}

function imagePromptLayoutFor(role: ShortVisualBibleAssetPlan["role"]): ShortVisualBibleImagePromptPack["layout"] {
  switch (role) {
    case "identity_sheet":
      return "identity_multi_view_sheet";
    case "product_sheet":
      return "product_geometry_sheet";
    case "environment_board":
      return "environment_set_board";
    case "style_board":
      return "style_light_camera_board";
    case "first_frame_board":
      return "first_frame_lock";
    case "storyboard_board":
      return "storyboard_panel_grid";
    case "sequence_board":
      return "sequence_panel_grid";
    case "audio_timing_board":
      return "audio_timing_board";
  }
}

function roleSpecificImagePrompt(role: ShortVisualBibleAssetPlan["role"]): string {
  switch (role) {
    case "identity_sheet":
      return "Show the same creator/KOL identity across front, side, and three-quarter views with consistent face, hair, wardrobe, skin texture, lens distance, and lighting; include one natural UGC reaction pose for motion.";
    case "product_sheet":
      return "Show product hero front, angled view, hand-scale view, texture/material close-up, packaging geometry, and logo/label placement only when supplied by the user or product evidence.";
    case "environment_board":
      return "Show stable set geometry, background depth, prop placement, lens distance, and movement lanes so the product and KOL can move without spatial jumps.";
    case "style_board":
      return "Show lighting source, contrast, palette, lens language, material mood, and camera energy as broad production guidance after identity and product anchors are locked.";
    case "first_frame_board":
      return "Show the exact opening composition: subject/product visible immediately, hook readable without captions, and enough space for camera or hand motion to begin.";
    case "storyboard_board":
      return "Show a compact hook-to-payoff panel grid: opening hook, setup/problem, proof/demo, transition, and payoff, with clear action changes and no text labels.";
    case "sequence_board":
      return "Show a sequence board grid with recurring anchors, escalating action, boundary handoff frames, and final payoff so long sequences can render in chained Seedance clips.";
    case "audio_timing_board":
      return "Show visual rhythm cues for beats, pauses, product contact SFX, voiceover emphasis, and final resolve without using waveform text or written labels.";
  }
}

function imagePromptNegativePromptFor(role: ShortVisualBibleAssetPlan["role"]): string {
  const common = [
    "visible text",
    "captions",
    "subtitles",
    "CTA cards",
    "fake UI labels",
    "watermarks",
    "random letters",
    "private marks",
    "copied public creator likeness",
    "unapproved celebrity identity",
    "unsupported product claims",
    "unapproved logos",
    "distorted hands",
    "extra fingers",
    "face inconsistency",
    "product deformation",
    "packaging drift",
    "cropped product",
    "dark unreadable panels"
  ];
  const roleSpecific = role === "storyboard_board" || role === "sequence_board"
    ? ["repeated identical panels", "missing beginning middle ending", "unclear panel order", "static product macro only"]
    : role === "identity_sheet"
      ? ["different faces across views", "different hair or wardrobe across views"]
      : role === "product_sheet"
        ? ["invented label text", "wrong scale", "melted packaging"]
        : [];
  return [...common, ...roleSpecific].join(", ");
}

function seedanceBindingInstructionFor(
  asset: {
    readonly role: ShortVisualBibleAssetPlan["role"];
    readonly promptRole: NonNullable<ShortVisualBibleAssetPlan["promptRole"]>;
    readonly providerKind: NonNullable<ShortVisualBibleAssetPlan["providerKind"]>;
    readonly preferredPromptTag: string | undefined;
  },
  referenceTag: string
): string {
  const priority = asset.promptRole === "identity" || asset.promptRole === "product" || asset.promptRole === "first_frame"
    ? "Bind before style, source-video rhythm, camera, and audio references."
    : "Bind after identity/product anchors and use as supporting guidance.";
  return `${referenceTag} should be uploaded as a ${asset.providerKind}/${asset.promptRole} reference for ${asset.role}. ${priority} Seedance should preserve concrete visual anchors while animating motion from the shot prompt; do not treat this board as visible text or final edit graphics.`;
}

function imagePromptApprovalChecklistFor(
  role: ShortVisualBibleAssetPlan["role"],
  referenceTag: string
): readonly string[] {
  return [
    `${referenceTag} has no visible captions, labels, CTA cards, watermark, random text, or private marks.`,
    "Identity/product/style anchors match approved user evidence or remain clearly original when no reference exists.",
    "Panels or views cover the requested count and the full hook/setup/proof/demo/payoff job for the asset role.",
    role === "storyboard_board" || role === "sequence_board"
      ? "Panel order and action progression are visually clear enough to map into Seedance clip prompts."
      : "The board is clean enough to act as a stable Seedance reference, not just mood decoration.",
    "No unsupported product claim, copied source-video expression, unapproved logo, music cue, caption, or public creator likeness is present."
  ];
}

function sequencePlanFor(
  targetDurationSeconds: number,
  sceneCount: number,
  durationBand: ShortVisualBibleDurationBand
): ShortVisualBibleSequencePlan {
  const targetClipCount = Math.max(1, Math.ceil(targetDurationSeconds / 15), sceneCount);
  const boardCount = durationBand === "single_clip_5_15"
    ? 1
    : durationBand === "short_multishot_15_60"
      ? Math.min(4, Math.max(1, Math.ceil(targetDurationSeconds / 30)))
      : Math.min(8, Math.max(3, Math.ceil(targetDurationSeconds / 45)));
  const continuityStrategy = durationBand === "single_clip_5_15"
    ? "single_reference_board"
    : durationBand === "short_multishot_15_60"
      ? "multi_board_sequence"
      : "sequence_bible_with_last_frame_chaining";
  return {
    boardCount,
    targetClipCount,
    maxSecondsPerBoard: Math.min(30, Math.max(15, Math.ceil(targetDurationSeconds / boardCount))),
    seedanceClipDurationSeconds: { min: 4, max: 15 },
    continuityStrategy,
    durationGuidance: durationGuidanceFor(targetDurationSeconds, durationBand, boardCount, targetClipCount)
  };
}

function durationGuidanceFor(
  targetDurationSeconds: number,
  durationBand: ShortVisualBibleDurationBand,
  boardCount: number,
  targetClipCount: number
): readonly string[] {
  if (durationBand === "single_clip_5_15") {
    return [
      "Use one compact board: first-frame hook, proof/action middle, resolved endpoint.",
      "Seedance should receive one image/reference board and one dense 4-15s prompt."
    ];
  }
  if (durationBand === "short_multishot_15_60") {
    return [
      `Use ${boardCount} board(s) and about ${targetClipCount} Seedance clip(s) to cover all ${targetDurationSeconds}s.`,
      "Each board should carry a different retention job: hook, setup, proof/demo, payoff.",
      "Use returnLastFrame or first-frame references between clips when no stronger shot-specific board exists."
    ];
  }
  return [
    `Use ${boardCount} sequence boards because ${targetDurationSeconds}s exceeds a single-board short workflow.`,
    "Create a recurring character/product/style bible, then per-sequence boards.",
    "Render sequentially with last-frame chaining and review drift at sequence boundaries."
  ];
}

function seedanceBindingPlanFor(
  assetPlans: readonly ShortVisualBibleAssetPlan[],
  mediaReferencePlan: readonly ShortMediaReferencePlan[]
): readonly string[] {
  if (!assetPlans.length && !mediaReferencePlan.length) {
    return ["No visual bible is needed; compile original text-to-video prompts from niche and story evidence."];
  }
  return [
    "Bind identity and product board references before style, motion, camera, and source-video structure.",
    "Use @image identity/product/storyboard tags as scoped references; do not let a storyboard board override product geometry or face identity.",
    "Use first-frame board or prior last-frame output to anchor clip starts when the sequence spans multiple Seedance clips.",
    "Keep source-video structure references below user-owned KOL/product/reference-board assets."
  ];
}

function executionBlueprintFor(
  input: ShortVisualBiblePlannerInput,
  status: ShortVisualBibleStatus,
  recommendedPipe: ShortVisualBibleRecommendedPipe,
  durationBand: ShortVisualBibleDurationBand,
  sequencePlan: ShortVisualBibleSequencePlan,
  assetPlans: readonly ShortVisualBibleAssetPlan[]
): ShortVisualBibleExecutionBlueprint {
  const mode = executionModeFor(status, recommendedPipe);
  const targetSecondsPerClip = Math.min(
    sequencePlan.seedanceClipDurationSeconds.max,
    Math.max(sequencePlan.seedanceClipDurationSeconds.min, Math.ceil(input.intent.targetDurationSeconds / Math.max(1, sequencePlan.targetClipCount)))
  );
  const referenceTagBindingOrder = referenceBindingOrderFor(assetPlans, input.mediaReferencePlan);
  const clipExecutionStrategy = durationBand === "single_clip_5_15"
    ? "single_clip"
    : durationBand === "short_multishot_15_60"
      ? "multi_clip_last_frame_chaining"
      : "sequence_bible_last_frame_chaining";
  const seedanceSubmissionMode = mode === "text_only_no_board" ? "text_to_video" : "reference_to_video";
  return {
    schemaVersion: "cinejelly.short-visual-bible-execution-blueprint.v1",
    mode,
    imageProviderRole: mode === "text_only_no_board" ? "none" : "provider_neutral_reference_board_generator",
    seedanceSubmissionMode,
    clipExecutionStrategy,
    referenceTagBindingOrder,
    durationCoverage: {
      targetDurationSeconds: input.intent.targetDurationSeconds,
      targetClipCount: sequencePlan.targetClipCount,
      targetSecondsPerClip,
      requiresStartMiddleEnd: input.intent.targetDurationSeconds >= 15,
      coverageRule: durationCoverageRuleFor(input.intent.targetDurationSeconds, durationBand, sequencePlan.targetClipCount)
    },
    steps: executionStepsFor(mode, seedanceSubmissionMode, assetPlans, sequencePlan, input.intent.targetDurationSeconds),
    handoffSummary: handoffSummaryFor(mode, sequencePlan, referenceTagBindingOrder)
  };
}

function executionModeFor(
  status: ShortVisualBibleStatus,
  recommendedPipe: ShortVisualBibleRecommendedPipe
): ShortVisualBibleExecutionMode {
  if (status === "not_needed" || recommendedPipe === "normal_short_pipe") {
    return "text_only_no_board";
  }
  switch (recommendedPipe) {
    case "product_kol_reference_pipe":
    case "reference_board_pipe":
      return "reference_board_to_seedance";
    case "storyboard_board_pipe":
      return "storyboard_board_to_seedance";
    case "video_remake_pipe":
      return "video_remake_to_seedance";
    case "long_sequence_bible_pipe":
      return "production_bible_to_seedance";
  }
}

function referenceBindingOrderFor(
  assetPlans: readonly ShortVisualBibleAssetPlan[],
  mediaReferencePlan: readonly ShortMediaReferencePlan[]
): readonly string[] {
  const mediaBindings = mediaReferencePlan
    .filter((reference) => reference.status !== "blocked")
    .map((reference) => `${reference.promptTag}:${reference.promptRole}`);
  const assetBindings = assetPlans.map((asset) =>
    asset.preferredPromptTag
      ? `${asset.preferredPromptTag}:${asset.promptRole ?? asset.role}`
      : `${asset.role}:${asset.promptRole ?? "planning"}`
  );
  return unique([
    ...mediaBindings.filter(isPrimaryReferenceBinding),
    ...assetBindings.filter(isPrimaryReferenceBinding),
    ...mediaBindings.filter((item) => !isPrimaryReferenceBinding(item)),
    ...assetBindings.filter((item) => !isPrimaryReferenceBinding(item))
  ]);
}

function isPrimaryReferenceBinding(value: string): boolean {
  return /identity|product|first_frame|last_frame/.test(value);
}

function executionStepsFor(
  mode: ShortVisualBibleExecutionMode,
  seedanceSubmissionMode: ShortVisualBibleExecutionBlueprint["seedanceSubmissionMode"],
  assetPlans: readonly ShortVisualBibleAssetPlan[],
  sequencePlan: ShortVisualBibleSequencePlan,
  targetDurationSeconds: number
): readonly ShortVisualBibleExecutionBlueprint["steps"][number][] {
  const steps: ShortVisualBibleExecutionBlueprint["steps"][number][] = [];
  if (mode !== "text_only_no_board") {
    for (const asset of assetPlans.filter((item) => item.sourcePolicy === "generate_before_seedance" || item.requiredBeforeRender)) {
      steps.push({
        order: steps.length + 1,
        stage: "reference_asset_planning",
        title: `Prepare ${asset.role}`,
        provider: asset.sourcePolicy === "generate_before_seedance" ? "image_model" : "operator",
        inputAssetRoles: [],
        outputAssetRole: asset.role,
        ...(asset.preferredPromptTag ? { outputReferenceTag: asset.preferredPromptTag } : {}),
        requiresHumanApproval: true,
        instruction: imageAssetStepInstructionFor(asset)
      });
    }
  }
  steps.push({
    order: steps.length + 1,
    stage: "seedance_reference_binding",
    title: mode === "text_only_no_board" ? "Compile original text-to-video prompt" : "Bind reference-board assets before Seedance prompt prose",
    provider: "seedance",
    providerMode: seedanceSubmissionMode,
    inputAssetRoles: assetPlans.map((asset) => asset.role),
    requiresHumanApproval: mode !== "text_only_no_board",
    instruction: mode === "text_only_no_board"
      ? "No reference board is required; produce one concrete original prompt from the user brief, niche strategy, duration arc, audio plan, and constraints."
      : "Bind identity, product, first-frame, and storyboard assets before style/motion/camera so Seedance preserves anchors while animating each timed clip."
  });
  steps.push({
    order: steps.length + 1,
    stage: "seedance_clip_rendering",
    title: sequencePlan.targetClipCount === 1 ? "Render one complete Seedance clip" : `Render ${sequencePlan.targetClipCount} Seedance clips with continuity`,
    provider: "seedance",
    providerMode: seedanceSubmissionMode,
    inputAssetRoles: assetPlans.map((asset) => asset.role),
    requiresHumanApproval: false,
    instruction: `Cover the full ${targetDurationSeconds}s plan with ${sequencePlan.targetClipCount} clip(s), each ${sequencePlan.seedanceClipDurationSeconds.min}-${sequencePlan.seedanceClipDurationSeconds.max}s, preserving first-frame, action/proof middle, endpoint, and audio intent.`
  });
  steps.push({
    order: steps.length + 1,
    stage: "continuity_review",
    title: "Review drift, claims, audio timing, and final frame continuity",
    provider: "review_gate",
    inputAssetRoles: assetPlans.map((asset) => asset.role),
    requiresHumanApproval: true,
    instruction: "Approve only if face/product geometry, product claims, shot order, audio timing, no-visible-text policy, and final-frame continuity match the plan."
  });
  return steps;
}

function imageAssetStepInstructionFor(asset: ShortVisualBibleAssetPlan): string {
  const pack = asset.imagePromptPack;
  return [
    `Image prompt: ${pack.prompt}`,
    `Negative prompt: ${pack.negativePrompt}`,
    `Seedance binding: ${pack.seedanceBindingInstruction}`,
    `Approval checklist: ${pack.approvalChecklist.join(" | ")}`
  ].join(" ");
}

function durationCoverageRuleFor(
  targetDurationSeconds: number,
  durationBand: ShortVisualBibleDurationBand,
  targetClipCount: number
): string {
  if (durationBand === "single_clip_5_15") {
    return "One clip must still contain a visible first-frame hook, concrete action/proof middle, and controlled endpoint.";
  }
  if (durationBand === "short_multishot_15_60") {
    return `Use all ${targetClipCount} clip beat(s) to cover beginning, setup, proof/demo, and payoff without compressing the middle.`;
  }
  return `Use sequence boards and last-frame chaining so the full ${targetDurationSeconds}s has recurring anchors, escalation, payoff, and boundary reviews.`;
}

function handoffSummaryFor(
  mode: ShortVisualBibleExecutionMode,
  sequencePlan: ShortVisualBibleSequencePlan,
  referenceTagBindingOrder: readonly string[]
): string {
  if (mode === "text_only_no_board") {
    return "Text-only short: no board generation; route directly to original prompt compilation with standard review gates.";
  }
  return `Board-driven workflow: ${mode}; boards=${sequencePlan.boardCount}; clips=${sequencePlan.targetClipCount}; continuity=${sequencePlan.continuityStrategy}; bind=${referenceTagBindingOrder.join(" > ") || "planned assets before Seedance"}.`;
}

function promptContractsFor(
  status: ShortVisualBibleStatus,
  durationBand: ShortVisualBibleDurationBand,
  targetDurationSeconds: number,
  scenes: readonly ShortPipelineScenePlan[]
): readonly string[] {
  if (status === "not_needed") {
    return ["No reference-board contract required for this plan."];
  }
  return [
    `Visual-bible contract: cover the full ${targetDurationSeconds}s arc with ${scenes.length} scene beat(s), not a static product macro.`,
    "Reference-board prompt must define character/product identity, camera language, light source, movement intensity, SFX/audio energy, and final frame.",
    durationBand === "single_clip_5_15"
      ? "Single board may cover all action; keep the first frame legible without audio."
      : "Multiple boards must preserve recurring identity/product/style while changing visual information every 1-3 seconds."
  ];
}

function qualityGatesFor(
  status: ShortVisualBibleStatus,
  durationBand: ShortVisualBibleDurationBand,
  assetPlans: readonly ShortVisualBibleAssetPlan[]
): readonly string[] {
  if (status === "not_needed") {
    return ["Standard prompt, media-reference, and delivery gates apply."];
  }
  return [
    "Reference-board assets must not contain visible captions, watermarks, private marks, or unsupported claims.",
    "Rendered output must preserve face/wardrobe/product geometry across clips.",
    "Storyboard-board panels must map to the actual shot order and target duration.",
    durationBand === "single_clip_5_15"
      ? "One output clip should have visible hook, action/proof, and endpoint."
      : "Sequence outputs should pass continuity review at each board or last-frame boundary.",
    assetPlans.some((asset) => asset.sourcePolicy === "generate_before_seedance")
      ? "Generated image/reference assets need rights, likeness, and brand review before paid Seedance submission."
      : "Operator-supplied reference assets need rights and provider-asset readiness before paid Seedance submission."
  ];
}

function guardrailsFor(status: ShortVisualBibleStatus): readonly string[] {
  if (status === "not_needed") {
    return ["Do not invent a real KOL likeness or exact packaging if no approved reference exists."];
  }
  return [
    "Generated reference boards are original production assets, not copies of public creator identities.",
    "Do not transfer protected source-video captions, music, voice likeness, watermarks, brand marks, or exact edit expression.",
    "Use style boards as broad production mood only; identity/product/first-frame anchors have higher priority.",
    "Treat no-drift as a QA target, not a guaranteed model property; surface drift risk for review."
  ];
}

function warningsFor(
  input: ShortVisualBiblePlannerInput,
  status: ShortVisualBibleStatus,
  blocksRenderUntilAssetsApproved: boolean
): readonly string[] {
  return unique([
    status !== "not_needed" && !input.mediaReferencePlan.some((reference) => reference.status === "ready")
      ? "visual_bible_needs_generated_or_approved_assets_before_provider_handoff"
      : undefined,
    blocksRenderUntilAssetsApproved ? "explicit_visual_bible_mode_blocks_render_until_assets_approved" : undefined,
    input.intent.targetDurationSeconds > 60 ? "longer_than_short_reference_board_requires_sequence_bible" : undefined
  ]);
}

function durationBandFor(targetDurationSeconds: number): ShortVisualBibleDurationBand {
  if (targetDurationSeconds <= 15) {
    return "single_clip_5_15";
  }
  if (targetDurationSeconds <= 60) {
    return "short_multishot_15_60";
  }
  if (targetDurationSeconds <= 180) {
    return "midform_sequence_60_180";
  }
  return "long_sequence_180_480";
}

function unique(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}
