/**
 * Core short video pipe planner.
 * This is product workflow logic, not UI logic: future screens can render these
 * five pipe options without re-deriving routing, duration, or input rules.
 */

import type {
  ShortMediaReferencePlan,
  ShortPipelineIntent,
  ShortReferenceRemakeBlueprint,
  ShortSeedanceRoutingPlan,
  ShortVideoBackendPipe,
  ShortVideoPipeCapabilityPolicy,
  ShortVideoPipeCatalog,
  ShortVideoPipeCatalogItem,
  ShortVideoPipeDurationClass,
  ShortVideoPipeNavigationGroup,
  ShortVideoPipeSelectionReasonCode,
  ShortVideoPipeMode,
  ShortVideoPipeOption,
  ShortVideoPipePlan,
  ShortVideoPipeSetting,
  ShortVideoPipeSettingOption,
  ShortVideoPipeUiLayout,
  ShortVideoPipeVisualBibleAlignment,
  ShortVisualBibleMode,
  ShortVisualBiblePlan
} from "../types/short-pipeline.js";
import type { ShortDirectorPlan } from "../types/short-director.js";
import { createStableId } from "../utils/ids.js";
import {
  internalSourcePatternOrigins,
  SHORT_VIDEO_PIPE_SOURCE_PATTERN_IDS
} from "./private-source-pattern-registry.js";

const SOURCE_PATTERN_ORIGINS = internalSourcePatternOrigins(SHORT_VIDEO_PIPE_SOURCE_PATTERN_IDS);

type PipeDefinition = Omit<
  ShortVideoPipeCatalogItem,
  | "uiLayout"
  | "capabilityPolicy"
  | "durationSupport"
  | "settings"
  | "defaultResolution"
  | "audioDefault"
  | "returnLastFrameDefault"
> & {
  readonly durationSupport: readonly [number, number, number, number, boolean];
};

const DEFAULT_PIPE_CATALOG_RESOLUTION = "720p" as const;
const DEFAULT_PIPE_CATALOG_AUDIO = "hybrid" as const;
const DEFAULT_PIPE_CATALOG_RETURN_LAST_FRAME = true as const;
const DEFAULT_PROVIDER_CLIP_MAX_SECONDS = 15 as const;
const STANDARD_RESOLUTION_OPTIONS = ["480p", "720p", "1080p", "720p-SR", "1080p-SR"] as const;
const PRODUCTION_RESOLUTION_OPTIONS = ["720p", "1080p", "720p-SR", "1080p-SR", "1440p-SR"] as const;
const STANDARD_MODEL_TIER_OPTIONS = ["mini", "fast", "standard"] as const;
const QUALITY_MODEL_TIER_OPTIONS = ["fast", "standard"] as const;

const PIPE_DEFINITIONS: readonly PipeDefinition[] = [
  {
    mode: "smart_short",
    label: "Smart Short",
    backendPipe: "normal_short_pipe",
    durationSupport: [5, 20, 8, 15, false],
    seedanceModes: ["text_to_video", "image_to_video"],
    defaultSeedanceMode: "text_to_video",
    preferredTier: "mini",
    requiredInputs: ["brief_or_idea"],
    optionalInputs: ["product_facts", "brand_kit", "channel_style"],
    outputStrategy: "One compact text-to-video or image-to-video idea with hook, proof/demo, payoff, hybrid model audio plus TTS-ready script cues, and review gates.",
    reason: "Best when the user has only a rough idea and does not need identity/product continuity across many clips."
  },
  {
    mode: "product_kol_ugc",
    label: "Product/KOL UGC",
    backendPipe: "product_kol_reference_pipe",
    durationSupport: [15, 60, 20, 45, false],
    seedanceModes: ["reference_to_video", "image_to_video"],
    defaultSeedanceMode: "reference_to_video",
    preferredTier: "standard",
    requiredInputs: ["product_reference", "kol_or_creator_reference"],
    optionalInputs: ["background_reference", "wardrobe_reference", "brand_kit", "channel_style"],
    outputStrategy: "Reference-to-video UGC/product flow with role-scoped @image tags, identity/product preservation, proof beats, and conservative claims.",
    reason: "Best for serum, fashion, food, app, SaaS, ecommerce, or creator-led ads where product and KOL consistency matter."
  },
  {
    mode: "storyboard_multishot",
    label: "Storyboard Multishot",
    backendPipe: "storyboard_board_pipe",
    durationSupport: [15, 60, 25, 60, false],
    seedanceModes: ["reference_to_video", "image_to_video", "text_to_video"],
    defaultSeedanceMode: "reference_to_video",
    preferredTier: "fast",
    requiredInputs: ["brief_or_idea"],
    optionalInputs: ["product_reference", "kol_reference", "style_reference", "first_frame_reference"],
    outputStrategy: "A timed storyboard sequence where every clip has first frame, action/proof middle, endpoint, audio intent, and last-frame continuity.",
    reason: "Best when the video needs a full beginning, middle, and ending across multiple Seedance clips."
  },
  {
    mode: "video_remake",
    label: "Video Remake",
    backendPipe: "video_remake_pipe",
    durationSupport: [5, 60, 15, 45, false],
    seedanceModes: ["reference_to_video"],
    defaultSeedanceMode: "reference_to_video",
    preferredTier: "standard",
    requiredInputs: ["rights_cleared_source_video", "replacement_product_or_kol"],
    optionalInputs: ["background_reference", "voice_direction", "brand_kit"],
    outputStrategy: "Learn source rhythm, acting beats, camera grammar, and payoff structure, then replace creator/product/background/audio/claims with approved inputs.",
    reason: "Best when the user uploads a trend/reference video and wants the same structure without copying protected identity, music, text, or marks."
  },
  {
    mode: "production_bible",
    label: "Production Bible",
    backendPipe: "long_sequence_bible_pipe",
    durationSupport: [60, 480, 60, 180, true],
    seedanceModes: ["reference_to_video"],
    defaultSeedanceMode: "reference_to_video",
    preferredTier: "standard",
    requiredInputs: ["character_or_kol_sheet", "product_or_world_reference", "sequence_goal"],
    optionalInputs: ["storyboard_board", "style_board", "audio_timing_board", "long_form_outline"],
    outputStrategy: "Use multiple sequence boards, recurring identity/product anchors, and last-frame chaining for longer sequences or serial content.",
    reason: "Best for 60s+ sequences, mini episodes, branded series, or any flow that must preserve character/product identity beyond one short."
  }
] as const;

export function buildShortVideoPipeCatalog(): ShortVideoPipeCatalog {
  return {
    schemaVersion: "cinejelly.short-video-pipe-catalog.v1",
    generatedAt: new Date(),
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    pipeCount: 5,
    defaultResolution: DEFAULT_PIPE_CATALOG_RESOLUTION,
    defaultAudioMode: DEFAULT_PIPE_CATALOG_AUDIO,
    defaultReturnLastFrame: DEFAULT_PIPE_CATALOG_RETURN_LAST_FRAME,
    pipes: PIPE_DEFINITIONS.map((definition) => ({
      mode: definition.mode,
      label: definition.label,
      backendPipe: definition.backendPipe,
      uiLayout: uiLayoutFor(definition.mode),
      capabilityPolicy: capabilityPolicyFor(definition),
      durationSupport: durationSupportFor(definition.durationSupport),
      seedanceModes: definition.seedanceModes,
      defaultSeedanceMode: definition.defaultSeedanceMode,
      preferredTier: definition.preferredTier,
      defaultResolution: DEFAULT_PIPE_CATALOG_RESOLUTION,
      audioDefault: DEFAULT_PIPE_CATALOG_AUDIO,
      returnLastFrameDefault: DEFAULT_PIPE_CATALOG_RETURN_LAST_FRAME,
      requiredInputs: definition.requiredInputs,
      optionalInputs: definition.optionalInputs,
      settings: catalogSettingsFor(definition),
      outputStrategy: definition.outputStrategy,
      reason: definition.reason
    })),
    releaseGateSummary: {
      canUseAsUiNavigationEvidence: true,
      canSubmitToProviderNow: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: "Video pipe catalog is no-spend backend UI-navigation evidence only; selected plan review, rights approval, cost gates, provider validation, and manual media review are still required before customer traffic."
    }
  };
}

export class ShortVideoPipePlanner {
  public build(input: {
    readonly projectId: string;
    readonly requestId?: string;
    readonly intent: ShortPipelineIntent;
    readonly mediaReferencePlan: readonly ShortMediaReferencePlan[];
    readonly visualBiblePlan: ShortVisualBiblePlan;
    readonly seedanceRouting: ShortSeedanceRoutingPlan;
    readonly directorPlan: ShortDirectorPlan;
    readonly referenceRemakeBlueprint?: ShortReferenceRemakeBlueprint;
  }): ShortVideoPipePlan {
    const selectedMode = selectedPipeMode(input);
    const selectedBackendPipe = backendPipeForMode(selectedMode);
    const pipeOptions = pipeOptionsFor(input, selectedMode);
    const selected = pipeOptions.find((option) => option.mode === selectedMode) ?? pipeOptions[0];
    const selectionReasonCodes = selectionReasonCodesFor(input, selectedMode);
    const visualBibleAlignment = visualBibleAlignmentFor(input, selectedMode, selectedBackendPipe);
    const pipePlanId = createStableId(
      "short_video_pipe",
      [
        input.projectId,
        input.requestId ?? "",
        input.intent.targetDurationSeconds,
        selectedMode,
        selectedBackendPipe,
        input.visualBiblePlan.planId,
        input.seedanceRouting.routingId
      ].join(":")
    );

    return {
      schemaVersion: "cinejelly.short-video-pipe-plan.v1",
      pipePlanId,
      selectedMode,
      selectedBackendPipe,
      selectedReason: selectedReasonFor(selected, visualBibleAlignment),
      selectionReasonCodes,
      visualBibleAlignment,
      pipeOptions,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      releaseGateSummary: {
        canUseAsNoSpendPipeEvidence: true,
        canSubmitToProviderNow: false,
        releaseBlocker: "Video pipe plan is no-spend backend routing evidence only; provider spend still requires review approvals, cost gates, and render confirmation."
      }
    };
  }
}

function selectedPipeMode(input: {
  readonly intent: ShortPipelineIntent;
  readonly mediaReferencePlan: readonly ShortMediaReferencePlan[];
  readonly visualBiblePlan: ShortVisualBiblePlan;
  readonly directorPlan: ShortDirectorPlan;
  readonly referenceRemakeBlueprint?: ShortReferenceRemakeBlueprint;
}): ShortVideoPipeMode {
  if (input.referenceRemakeBlueprint || input.visualBiblePlan.recommendedPipe === "video_remake_pipe") {
    return "video_remake";
  }
  if (input.visualBiblePlan.recommendedPipe === "long_sequence_bible_pipe" || input.intent.targetDurationSeconds > 60) {
    return "production_bible";
  }
  if (
    input.intent.targetDurationSeconds <= 15 &&
    input.visualBiblePlan.requestedMode === "auto" &&
    !hasProductOrKolReference(input.mediaReferencePlan)
  ) {
    return "smart_short";
  }
  if (input.visualBiblePlan.recommendedPipe === "storyboard_board_pipe" || (
    input.directorPlan.recommendedWorkflowMode === "storyboard_multishot" &&
    !hasProductOrKolReference(input.mediaReferencePlan)
  )) {
    return "storyboard_multishot";
  }
  if (
    input.visualBiblePlan.recommendedPipe === "product_kol_reference_pipe" ||
    input.visualBiblePlan.recommendedPipe === "reference_board_pipe" ||
    hasProductOrKolReference(input.mediaReferencePlan)
  ) {
    return "product_kol_ugc";
  }
  return "smart_short";
}

function pipeOptionsFor(
  input: {
    readonly intent: ShortPipelineIntent;
    readonly mediaReferencePlan: readonly ShortMediaReferencePlan[];
    readonly visualBiblePlan: ShortVisualBiblePlan;
    readonly seedanceRouting: ShortSeedanceRoutingPlan;
  },
  selectedMode: ShortVideoPipeMode
): readonly ShortVideoPipeOption[] {
  return PIPE_DEFINITIONS.map((definition) => pipeOption({
    ...definition,
    selectedMode,
    enabled: true,
    input,
    settings: pipeSettingsFor(definition, input)
  }));
}

function pipeOption(input: {
  readonly mode: ShortVideoPipeMode;
  readonly label: string;
  readonly selectedMode: ShortVideoPipeMode;
  readonly enabled: boolean;
  readonly backendPipe: ShortVideoBackendPipe;
  readonly durationSupport: readonly [number, number, number, number, boolean];
  readonly seedanceModes: readonly ShortVideoPipeCatalogItem["seedanceModes"][number][];
  readonly defaultSeedanceMode: ShortVideoPipeCatalogItem["defaultSeedanceMode"];
  readonly preferredTier: ShortVideoPipeCatalogItem["preferredTier"];
  readonly input: {
    readonly seedanceRouting: ShortSeedanceRoutingPlan;
  };
  readonly requiredInputs: readonly string[];
  readonly optionalInputs: readonly string[];
  readonly settings: readonly ShortVideoPipeSetting[];
  readonly outputStrategy: string;
  readonly reason: string;
}): ShortVideoPipeOption {
  const [minSeconds, maxSeconds, idealMinSeconds, idealMaxSeconds, supportsLongSequence] = input.durationSupport;
  return {
    mode: input.mode,
    label: input.label,
    recommended: input.mode === input.selectedMode,
    enabled: input.enabled,
    backendPipe: input.backendPipe,
    uiLayout: uiLayoutFor(input.mode),
    capabilityPolicy: capabilityPolicyFor(input),
    ...(input.mode === input.selectedMode ? {
      effectiveSettings: effectiveSettingsFor(input.input.seedanceRouting)
    } : {}),
    durationSupport: {
      minSeconds,
      maxSeconds,
      idealRangeSeconds: [idealMinSeconds, idealMaxSeconds],
      supportsLongSequence
    },
    seedanceMode: input.defaultSeedanceMode,
    preferredTier: input.preferredTier,
    defaultResolution: DEFAULT_PIPE_CATALOG_RESOLUTION,
    audioDefault: input.input.seedanceRouting.generatedAudioMode,
    returnLastFrameDefault: input.input.seedanceRouting.returnLastFrame,
    requiredInputs: input.requiredInputs,
    optionalInputs: input.optionalInputs,
    settings: input.settings,
    outputStrategy: input.outputStrategy,
    reason: input.reason
  };
}

function effectiveSettingsFor(routing: ShortSeedanceRoutingPlan): NonNullable<ShortVideoPipeOption["effectiveSettings"]> {
  return {
    resolvedForCurrentPlan: true,
    providerMode: routing.recommendedProviderMode,
    tier: routing.preferredTier,
    resolution: routing.resolution,
    bitrateMode: routing.bitrateMode,
    superResolution: routing.superResolution,
    audioMode: routing.generatedAudioMode,
    returnLastFrame: routing.returnLastFrame,
    promptRecipeName: routing.promptRecipe.name
  };
}

function pipeSettingsFor(input: {
  readonly mode: ShortVideoPipeMode;
  readonly durationSupport: readonly [number, number, number, number, boolean];
  readonly seedanceModes: readonly ShortVideoPipeCatalogItem["seedanceModes"][number][];
  readonly defaultSeedanceMode: ShortVideoPipeCatalogItem["defaultSeedanceMode"];
  readonly preferredTier: ShortVideoPipeCatalogItem["preferredTier"];
}, runtime: {
  readonly intent: ShortPipelineIntent;
  readonly visualBiblePlan: ShortVisualBiblePlan;
  readonly seedanceRouting: ShortSeedanceRoutingPlan;
}): readonly ShortVideoPipeSetting[] {
  const support = durationSupportFor(input.durationSupport);
  const capabilityPolicy = capabilityPolicyFor(input);
  return [
    pipeSetting("duration_seconds", "Duration", runtime.intent.targetDurationSeconds, true, false, {
      group: "creative",
      control: "slider",
      scope: "primary",
      helperText: `This pipe supports ${support.minSeconds}-${support.maxSeconds}s; ideal range is ${support.idealRangeSeconds[0]}-${support.idealRangeSeconds[1]}s.`
    }),
    pipeSetting("aspect_ratio", "Aspect ratio", runtime.seedanceRouting.ratio, true, false, {
      group: "creative",
      control: "select",
      scope: "primary",
      options: settingOptions(["9:16", "1:1", "16:9", "adaptive"], runtime.seedanceRouting.ratio),
      helperText: "Use 9:16 for TikTok, Douyin, Reels, and Shorts unless the target platform requires another format."
    }),
    pipeSetting("resolution", "Resolution", runtime.seedanceRouting.resolution, true, false, {
      group: "render",
      control: "select",
      scope: "primary",
      options: settingOptions(capabilityPolicy.resolutionOptions, runtime.seedanceRouting.resolution),
      helperText: "720p is the default cost/quality baseline; higher or SR variants are explicit user quality choices."
    }),
    pipeSetting("seedance_tier", "Seedance tier", input.preferredTier, true, true, {
      group: "model",
      control: "select",
      scope: "advanced",
      options: settingOptions(capabilityPolicy.modelTierOptions, input.preferredTier),
      helperText: "User chooses quality tier only; backend maps it to the allowed AtlasCloud Seedance model ID."
    }),
    pipeSetting("provider_mode", "Provider mode", input.defaultSeedanceMode, false, true, {
      group: "model",
      control: "backend_auto",
      scope: "backend_only",
      options: settingOptions(input.seedanceModes, input.defaultSeedanceMode),
      helperText: "Backend chooses text-to-video, image-to-video, or reference-to-video from supplied inputs and pipe capabilities."
    }),
    pipeSetting("return_last_frame", "Return last frame", runtime.seedanceRouting.returnLastFrame, true, true, {
      group: "render",
      control: "toggle",
      scope: "advanced",
      helperText: "Keep on for multishot continuity, scene chaining, and production-bible handoff."
    }),
    pipeSetting("last_frame_chaining", "Last-frame chaining", capabilityPolicy.supportsLastFrameChaining, true, true, {
      group: "render",
      control: "toggle",
      scope: "advanced",
      helperText: "Used by storyboard, remake, and production sequence pipes to preserve continuity across Seedance clips."
    }),
    pipeSetting("audio_mode", "Audio", runtime.seedanceRouting.generatedAudioMode, true, true, {
      group: "audio",
      control: "select",
      scope: "primary",
      options: settingOptions(["hybrid", "native", "guided", "none"], runtime.seedanceRouting.generatedAudioMode),
      helperText: "Hybrid is default: use Seedance native audio when supported and keep TTS-ready script cues for external voice/audio providers."
    }),
    pipeSetting("visual_bible_mode", "Visual Bible", visualBibleModeForCatalog(input.mode), true, true, {
      group: "input",
      control: capabilityPolicy.supportsVisualBible ? "select" : "backend_auto",
      scope: capabilityPolicy.supportsVisualBible ? "primary" : "backend_only",
      options: settingOptions(["auto", "off", "reference_board", "storyboard_board", "production_bible"], visualBibleModeForCatalog(input.mode)),
      helperText: "Backend plans character/product/storyboard boards when references or longer duration make them valuable."
    }),
    pipeSetting("input_assets", "Input assets", `${inputRequiredLabel(input.mode)}`, false, true, {
      group: "input",
      control: capabilityPolicy.supportsReferenceAssets ? "asset_picker" : "backend_auto",
      scope: "primary",
      helperText: "UI can show the exact required input slots for this pipe while backend keeps provider reference tags scoped."
    }),
    pipeSetting("review_before_spend", "Review before spend", true, false, true, {
      group: "review",
      control: "review_gate",
      scope: "primary",
      helperText: "Every pipe remains paused until review approvals and explicit render confirmation are present."
    })
  ];
}

function catalogSettingsFor(definition: PipeDefinition): readonly ShortVideoPipeSetting[] {
  const durationSupport = durationSupportFor(definition.durationSupport);
  const capabilityPolicy = capabilityPolicyFor(definition);
  return [
    pipeSetting("duration_seconds", "Duration", `${durationSupport.idealRangeSeconds[0]}-${durationSupport.idealRangeSeconds[1]}`, true, false, {
      group: "creative",
      control: "slider",
      scope: "primary",
      helperText: `Supports ${durationSupport.minSeconds}-${durationSupport.maxSeconds}s.`
    }),
    pipeSetting("aspect_ratio", "Aspect ratio", "9:16", true, false, {
      group: "creative",
      control: "select",
      scope: "primary",
      options: settingOptions(["9:16", "1:1", "16:9", "adaptive"], "9:16")
    }),
    pipeSetting("resolution", "Resolution", DEFAULT_PIPE_CATALOG_RESOLUTION, true, false, {
      group: "render",
      control: "select",
      scope: "primary",
      options: settingOptions(capabilityPolicy.resolutionOptions, DEFAULT_PIPE_CATALOG_RESOLUTION)
    }),
    pipeSetting("seedance_tier", "Seedance tier", definition.preferredTier, true, true, {
      group: "model",
      control: "select",
      scope: "advanced",
      options: settingOptions(capabilityPolicy.modelTierOptions, definition.preferredTier)
    }),
    pipeSetting("provider_mode", "Provider mode", definition.defaultSeedanceMode, false, true, {
      group: "model",
      control: "backend_auto",
      scope: "backend_only",
      options: settingOptions(definition.seedanceModes, definition.defaultSeedanceMode)
    }),
    pipeSetting("return_last_frame", "Return last frame", DEFAULT_PIPE_CATALOG_RETURN_LAST_FRAME, true, true, {
      group: "render",
      control: "toggle",
      scope: "advanced"
    }),
    pipeSetting("last_frame_chaining", "Last-frame chaining", capabilityPolicy.supportsLastFrameChaining, true, true, {
      group: "render",
      control: "toggle",
      scope: "advanced"
    }),
    pipeSetting("audio_mode", "Audio", DEFAULT_PIPE_CATALOG_AUDIO, true, true, {
      group: "audio",
      control: "select",
      scope: "primary",
      options: settingOptions(["hybrid", "native", "guided", "none"], DEFAULT_PIPE_CATALOG_AUDIO)
    }),
    pipeSetting("visual_bible_mode", "Visual Bible", visualBibleModeForCatalog(definition.mode), true, true, {
      group: "input",
      control: capabilityPolicy.supportsVisualBible ? "select" : "backend_auto",
      scope: capabilityPolicy.supportsVisualBible ? "primary" : "backend_only",
      options: settingOptions(["auto", "off", "reference_board", "storyboard_board", "production_bible"], visualBibleModeForCatalog(definition.mode))
    }),
    pipeSetting("input_assets", "Input assets", inputRequiredLabel(definition.mode), false, true, {
      group: "input",
      control: capabilityPolicy.supportsReferenceAssets ? "asset_picker" : "backend_auto",
      scope: "primary"
    }),
    pipeSetting("review_before_spend", "Review before spend", true, false, true, {
      group: "review",
      control: "review_gate",
      scope: "primary"
    })
  ];
}

function uiLayoutFor(mode: ShortVideoPipeMode): ShortVideoPipeUiLayout {
  const navigationGroup = navigationGroupFor(mode);
  const navigationOrder = navigationOrderFor(mode);
  return {
    navigationGroup,
    navigationOrder,
    displayStyle: "navigation_tab",
    primarySettingIds: [
      "duration_seconds",
      "aspect_ratio",
      "resolution",
      "audio_mode",
      "visual_bible_mode",
      "input_assets",
      "review_before_spend"
    ],
    advancedSettingIds: [
      "seedance_tier",
      "provider_mode",
      "return_last_frame",
      "last_frame_chaining"
    ]
  };
}

function capabilityPolicyFor(definition: {
  readonly mode: ShortVideoPipeMode;
  readonly seedanceModes: readonly ShortVideoPipeCatalogItem["seedanceModes"][number][];
  readonly preferredTier: ShortVideoPipeCatalogItem["preferredTier"];
}): ShortVideoPipeCapabilityPolicy {
  const supportsReferenceAssets = definition.mode !== "smart_short";
  const supportsLastFrameChaining = ["storyboard_multishot", "video_remake", "production_bible", "product_kol_ugc"].includes(definition.mode);
  const supportsProductionSequence = definition.mode === "production_bible";
  return {
    durationClass: durationClassFor(definition.mode),
    providerClipMaxSeconds: DEFAULT_PROVIDER_CLIP_MAX_SECONDS,
    providerModes: definition.seedanceModes,
    modelTierOptions: modelTierOptionsFor(definition.mode),
    defaultTier: definition.preferredTier,
    resolutionOptions: definition.mode === "production_bible" ? PRODUCTION_RESOLUTION_OPTIONS : STANDARD_RESOLUTION_OPTIONS,
    defaultResolution: DEFAULT_PIPE_CATALOG_RESOLUTION,
    autoRouteProviderMode: true,
    userCannotPickRawProviderModel: true,
    supportsReferenceAssets,
    supportsSourceVideoLearning: definition.mode === "video_remake",
    supportsVisualBible: definition.mode !== "smart_short",
    supportsLastFrameChaining,
    supportsProductionSequence,
    requiresReviewBeforeSpend: true
  };
}

function navigationGroupFor(mode: ShortVideoPipeMode): ShortVideoPipeNavigationGroup {
  if (mode === "video_remake") {
    return "remake";
  }
  if (mode === "production_bible") {
    return "production";
  }
  return "short";
}

function navigationOrderFor(mode: ShortVideoPipeMode): number {
  switch (mode) {
    case "smart_short":
      return 1;
    case "product_kol_ugc":
      return 2;
    case "storyboard_multishot":
      return 3;
    case "video_remake":
      return 4;
    case "production_bible":
      return 5;
  }
}

function durationClassFor(mode: ShortVideoPipeMode): ShortVideoPipeDurationClass {
  switch (mode) {
    case "smart_short":
      return "single_clip_short";
    case "product_kol_ugc":
    case "storyboard_multishot":
    case "video_remake":
      return "multi_shot_short";
    case "production_bible":
      return "production_sequence";
  }
}

function modelTierOptionsFor(mode: ShortVideoPipeMode): readonly ShortVideoPipeCatalogItem["preferredTier"][] {
  switch (mode) {
    case "smart_short":
      return STANDARD_MODEL_TIER_OPTIONS;
    case "product_kol_ugc":
    case "storyboard_multishot":
    case "video_remake":
    case "production_bible":
      return QUALITY_MODEL_TIER_OPTIONS;
  }
}

function inputRequiredLabel(mode: ShortVideoPipeMode): string {
  switch (mode) {
    case "smart_short":
      return "brief_or_idea";
    case "product_kol_ugc":
      return "product_reference + kol_or_creator_reference";
    case "storyboard_multishot":
      return "brief_or_idea + optional reference board";
    case "video_remake":
      return "rights_cleared_source_video + replacement assets";
    case "production_bible":
      return "character_or_kol_sheet + product_or_world_reference + sequence_goal";
  }
}

function durationSupportFor(durationSupport: readonly [number, number, number, number, boolean]): ShortVideoPipeOption["durationSupport"] {
  const [minSeconds, maxSeconds, idealMinSeconds, idealMaxSeconds, supportsLongSequence] = durationSupport;
  return {
    minSeconds,
    maxSeconds,
    idealRangeSeconds: [idealMinSeconds, idealMaxSeconds],
    supportsLongSequence
  };
}

function visualBibleModeForCatalog(mode: ShortVideoPipeMode): ShortVisualBibleMode {
  switch (mode) {
    case "smart_short":
      return "auto";
    case "product_kol_ugc":
      return "reference_board";
    case "storyboard_multishot":
      return "storyboard_board";
    case "video_remake":
      return "auto";
    case "production_bible":
      return "production_bible";
  }
}

function pipeSetting(
  settingId: string,
  label: string,
  value: string | number | boolean,
  userAdjustable: boolean,
  backendManaged: boolean,
  metadata: Pick<ShortVideoPipeSetting, "group" | "control" | "scope" | "options" | "helperText"> = {}
): ShortVideoPipeSetting {
  return {
    settingId,
    label,
    value,
    userAdjustable,
    backendManaged,
    ...(metadata.group ? { group: metadata.group } : {}),
    ...(metadata.control ? { control: metadata.control } : {}),
    ...(metadata.scope ? { scope: metadata.scope } : {}),
    ...(metadata.options ? { options: metadata.options } : {}),
    ...(metadata.helperText ? { helperText: metadata.helperText } : {})
  };
}

function settingOptions(
  values: readonly (string | number | boolean)[],
  recommendedValue: string | number | boolean
): readonly ShortVideoPipeSettingOption[] {
  return values.map((value) => ({
    value,
    label: String(value),
    recommended: value === recommendedValue
  }));
}

function hasProductOrKolReference(references: readonly ShortMediaReferencePlan[]): boolean {
  return references.some((reference) =>
    reference.inputRole === "kol" ||
    reference.inputRole === "creator" ||
    reference.inputRole === "product"
  );
}

function selectionReasonCodesFor(
  input: {
    readonly intent: ShortPipelineIntent;
    readonly mediaReferencePlan: readonly ShortMediaReferencePlan[];
    readonly visualBiblePlan: ShortVisualBiblePlan;
    readonly referenceRemakeBlueprint?: ShortReferenceRemakeBlueprint;
  },
  selectedMode: ShortVideoPipeMode
): readonly ShortVideoPipeSelectionReasonCode[] {
  const codes = new Set<ShortVideoPipeSelectionReasonCode>();
  if (selectedMode === "smart_short") {
    codes.add("smart_short_text_only");
  }
  if (hasProductOrKolReference(input.mediaReferencePlan)) {
    codes.add("product_or_kol_reference_present");
  }
  if (selectedMode === "storyboard_multishot") {
    codes.add("storyboard_needed_for_duration_or_missing_references");
  }
  if (input.referenceRemakeBlueprint || input.visualBiblePlan.recommendedPipe === "video_remake_pipe") {
    codes.add("video_remake_blueprint_present");
  }
  if (input.visualBiblePlan.recommendedPipe === "long_sequence_bible_pipe" || input.intent.targetDurationSeconds > 60) {
    codes.add("production_bible_or_long_duration");
  }
  if (input.visualBiblePlan.recommendedPipe === "reference_board_pipe") {
    codes.add("visual_bible_reference_board_asset_workflow");
  }
  if (
    input.visualBiblePlan.recommendedPipe === "product_kol_reference_pipe" &&
    selectedMode === "storyboard_multishot" &&
    !hasProductOrKolReference(input.mediaReferencePlan)
  ) {
    codes.add("visual_bible_product_reference_needs_assets");
  }
  return [...codes].sort();
}

function selectedReasonFor(
  selected: ShortVideoPipeOption | undefined,
  visualBibleAlignment: ShortVideoPipeVisualBibleAlignment
): string {
  const baseReason = selected?.reason ?? "Backend selected the safest available short-video pipe from duration, references, and model routing.";
  return `${baseReason} ${visualBibleAlignment.explanation}`;
}

function visualBibleAlignmentFor(
  input: {
    readonly intent: ShortPipelineIntent;
    readonly mediaReferencePlan: readonly ShortMediaReferencePlan[];
    readonly visualBiblePlan: ShortVisualBiblePlan;
  },
  selectedMode: ShortVideoPipeMode,
  selectedBackendPipe: ShortVideoBackendPipe
): ShortVideoPipeVisualBibleAlignment {
  const visualBibleRecommendedPipe = input.visualBiblePlan.recommendedPipe;
  const canonicalPipe = canonicalBackendPipeForVisualBiblePipe(visualBibleRecommendedPipe);
  if (canonicalPipe === selectedBackendPipe) {
    return {
      status: "aligned",
      visualBibleRecommendedPipe,
      selectedBackendPipe,
      explanation: "Visual Bible recommendation and canonical video pipe are aligned."
    };
  }
  if (visualBibleRecommendedPipe === "reference_board_pipe") {
    return {
      status: "reference_board_asset_workflow",
      visualBibleRecommendedPipe,
      selectedBackendPipe,
      explanation: "Reference-board mode is treated as a Visual Bible asset workflow while the canonical video pipe remains product or storyboard navigation."
    };
  }
  if (
    visualBibleRecommendedPipe === "product_kol_reference_pipe" &&
    selectedMode === "storyboard_multishot" &&
    !hasProductOrKolReference(input.mediaReferencePlan)
  ) {
    return {
      status: "storyboard_until_references",
      visualBibleRecommendedPipe,
      selectedBackendPipe,
      explanation: "Product/KOL reference assets are useful, but no KOL/product reference is ready yet, so backend routes to storyboard multishot until references are supplied or approved."
    };
  }
  if (selectedBackendPipe === "long_sequence_bible_pipe" && input.intent.targetDurationSeconds > 60) {
    return {
      status: "duration_override",
      visualBibleRecommendedPipe,
      selectedBackendPipe,
      explanation: "Duration exceeds the short multishot range, so backend promotes the request to the long sequence bible pipe."
    };
  }
  return {
    status: "canonical_backend_override",
    visualBibleRecommendedPipe,
    selectedBackendPipe,
    explanation: "Backend selected the canonical video pipe from duration, references, and workflow evidence while retaining Visual Bible as asset planning context."
  };
}

function canonicalBackendPipeForVisualBiblePipe(pipe: ShortVisualBiblePlan["recommendedPipe"]): ShortVideoBackendPipe {
  switch (pipe) {
    case "normal_short_pipe":
      return "normal_short_pipe";
    case "product_kol_reference_pipe":
    case "reference_board_pipe":
      return "product_kol_reference_pipe";
    case "storyboard_board_pipe":
      return "storyboard_board_pipe";
    case "video_remake_pipe":
      return "video_remake_pipe";
    case "long_sequence_bible_pipe":
      return "long_sequence_bible_pipe";
  }
}

function backendPipeForMode(mode: ShortVideoPipeMode): ShortVideoBackendPipe {
  switch (mode) {
    case "smart_short":
      return "normal_short_pipe";
    case "product_kol_ugc":
      return "product_kol_reference_pipe";
    case "storyboard_multishot":
      return "storyboard_board_pipe";
    case "video_remake":
      return "video_remake_pipe";
    case "production_bible":
      return "long_sequence_bible_pipe";
  }
}
