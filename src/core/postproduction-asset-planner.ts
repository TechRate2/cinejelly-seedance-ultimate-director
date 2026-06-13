/**
 * Postproduction asset planner.
 * Inspired by MoneyPrinterTurbo subtitle/audio/BGM stage planning and VibeFrame review artifacts,
 * rewritten as CineJelly-owned deterministic planning evidence.
 */

import { GeneratedAudioExecutionPlanner } from "./generated-audio-execution-planner.js";
import type {
  AudioMixOptions,
  AudioMixTrack,
  AudioTrackRole,
  GeneratedAudioIntent,
  GeneratedAudioIntentKind
} from "../types/audio.js";
import type { CaptionCue, CaptionOptions } from "../types/caption.js";
import type { AudioGenerationCapability, AudioGenerationOutputFormat } from "../types/provider.js";
import type {
  PostproductionAssetIssue,
  PostproductionAssetIssueCode,
  PostproductionAssetIssueSeverity,
  PostproductionAssetPlan,
  PostproductionAudioRoleCount,
  PostproductionGeneratedAudioKindCount
} from "../types/postproduction-assets.js";
import { createStableId } from "../utils/ids.js";

const SOURCE_PATTERN_ORIGINS = ["harry0703/MoneyPrinterTurbo", "vericontext/vibeframe"] as const;

const DEFAULT_AUDIO_MIX_OPTIONS: AudioMixOptions = {
  enabled: false,
  mode: "mix",
  originalVolume: 1,
  outputBitrate: "192k"
};

export interface PostproductionAssetPlannerInput {
  readonly projectId: string;
  readonly captionCues?: readonly CaptionCue[];
  readonly captionOptions?: CaptionOptions;
  readonly audioTracks?: readonly AudioMixTrack[];
  readonly audioMixOptions?: AudioMixOptions;
  readonly generatedAudioIntents?: readonly GeneratedAudioIntent[];
  readonly audioGenerationCapabilities?: readonly AudioGenerationCapability[];
  readonly generatedAudioOutputFormat?: AudioGenerationOutputFormat;
  readonly generatedAudioExecutionMode?: "planned_only" | "execute";
}

export class PostproductionAssetPlanner {
  private readonly generatedAudioExecutionPlanner = new GeneratedAudioExecutionPlanner();

  public plan(input: PostproductionAssetPlannerInput): PostproductionAssetPlan {
    const captionCues = input.captionCues ?? [];
    const captionOptions = input.captionOptions ?? { enabled: false, burnIn: false };
    const audioTracks = input.audioTracks ?? [];
    const generatedAudioIntents = input.generatedAudioIntents ?? [];
    const audioMixOptions = input.audioMixOptions ?? {
      ...DEFAULT_AUDIO_MIX_OPTIONS,
      enabled: audioTracks.length > 0
    };
    const generatedAudioExecutionPlan = this.generatedAudioExecutionPlanner.plan({
      intents: generatedAudioIntents,
      capabilities: input.audioGenerationCapabilities ?? [],
      ...(input.generatedAudioOutputFormat
        ? { options: { outputFormat: input.generatedAudioOutputFormat } }
        : {})
    });
    const issues = this.issues({
      captionCues,
      captionOptions,
      audioTracks,
      audioMixOptions,
      generatedAudioIntents,
      generatedAudioExecutionPlan,
      generatedAudioExecutionMode: input.generatedAudioExecutionMode ?? "planned_only"
    });
    const captionEnabled = captionOptions.enabled && captionCues.length > 0;
    const audioEnabled = audioMixOptions.enabled && audioTracks.length > 0;
    const generatedAudioPlanned = generatedAudioIntents.length > 0;
    const status = issues.some((issue) => issue.severity === "warn" || issue.severity === "block")
      ? "review_required"
      : captionEnabled || audioEnabled || generatedAudioPlanned
        ? "planned"
        : "disabled";

    return {
      planId: createStableId(
        "postproduction_assets",
        [
          input.projectId,
          captionCues.length,
          audioTracks.map((track) => `${track.trackId}:${track.role}`).join("|"),
          generatedAudioIntents.map((intent) => `${intent.intentId}:${intent.kind}`).join("|")
        ].join(":")
      ),
      projectId: input.projectId,
      sourcePatternOrigins: SOURCE_PATTERN_ORIGINS,
      status,
      caption: {
        enabled: captionEnabled,
        cueCount: captionCues.length,
        burnIn: captionOptions.burnIn,
        deliveryMode: captionEnabled ? (captionOptions.burnIn ? "burn_in" : "sidecar") : "disabled",
        totalCaptionSeconds: this.totalCaptionSeconds(captionCues),
        ...(captionOptions.language ? { language: captionOptions.language } : {})
      },
      audio: {
        enabled: audioEnabled,
        mode: audioMixOptions.mode,
        trackCount: audioTracks.length,
        roleCounts: this.roleCounts(audioTracks),
        originalAudioPolicy: audioEnabled ? "detect_at_assembly" : "not_used",
        outputBitrate: audioMixOptions.outputBitrate
      },
      generatedAudio: {
        status: generatedAudioExecutionPlan.status,
        intentCount: generatedAudioIntents.length,
        readyIntentCount: generatedAudioExecutionPlan.readyCount,
        blockedIntentCount: generatedAudioExecutionPlan.blockedCount,
        kindCounts: this.generatedAudioKindCounts(generatedAudioIntents),
        requestedDurationSeconds: generatedAudioExecutionPlan.requestedDurationSeconds,
        providerConfigured: (input.audioGenerationCapabilities ?? []).length > 0,
        executionPlan: generatedAudioExecutionPlan
      },
      issueCount: issues.length,
      issues
    };
  }

  private issues(input: {
    readonly captionCues: readonly CaptionCue[];
    readonly captionOptions: CaptionOptions;
    readonly audioTracks: readonly AudioMixTrack[];
    readonly audioMixOptions: AudioMixOptions;
    readonly generatedAudioIntents: readonly GeneratedAudioIntent[];
    readonly generatedAudioExecutionPlan: ReturnType<GeneratedAudioExecutionPlanner["plan"]>;
    readonly generatedAudioExecutionMode: "planned_only" | "execute";
  }): readonly PostproductionAssetIssue[] {
    const issues: PostproductionAssetIssue[] = [];
    if (input.captionOptions.enabled && input.captionCues.length === 0) {
      issues.push(this.issue(
        "caption_enabled_without_cues",
        "warn",
        "Caption rendering is enabled but no caption cues were supplied.",
        "Add caption cues or disable caption rendering for this request."
      ));
    }
    if (input.captionCues.length > 0 && !input.captionOptions.enabled) {
      issues.push(this.issue(
        "caption_cues_not_rendered",
        "warn",
        "Caption cues were supplied but caption rendering is disabled.",
        "Enable caption options or remove the unused cues."
      ));
    }
    if (input.audioTracks.length > 0 && !input.audioMixOptions.enabled) {
      issues.push(this.issue(
        "audio_tracks_not_mixed",
        "warn",
        "Audio tracks were supplied but audio mixing is disabled.",
        "Enable audio mix options or remove the unused tracks."
      ));
    }
    if (input.audioMixOptions.enabled && input.audioTracks.length === 0) {
      issues.push(this.issue(
        "audio_mix_enabled_without_tracks",
        "warn",
        "Audio mixing is enabled but no audio tracks were supplied.",
        "Add narration, music, ambience, or SFX tracks, or disable audio mixing."
      ));
    }
    if (input.audioTracks.some((track) => track.role === "narration")) {
      issues.push(this.issue(
        "tts_generation_not_configured",
        "info",
        "Narration tracks are treated as supplied audio; CineJelly is not generating TTS in this planner.",
        "Use an explicit narration track now, or add a provider-backed TTS module through a separate Reference Implementation."
      ));
    }
    if (input.audioTracks.some((track) => track.role === "music")) {
      issues.push(this.issue(
        "bgm_generation_not_configured",
        "info",
        "Music tracks are treated as supplied BGM; CineJelly is not searching or generating BGM in this planner.",
        "Use an explicit licensed music track now, or add provider-backed BGM sourcing through a separate Reference Implementation."
      ));
    }
    if (input.generatedAudioExecutionPlan.readyCount > 0 && input.generatedAudioExecutionMode !== "execute") {
      issues.push(this.issue(
        "generated_audio_execution_not_run",
        "warn",
        "Generated-audio intents are ready for provider execution, but this planning stage has not generated audio files.",
        "Run a verified provider-backed audio execution stage before claiming generated narration, BGM, ambience, or SFX in the final mix."
      ));
    }
    if (input.generatedAudioExecutionPlan.blockedCount > 0 && input.generatedAudioExecutionPlan.readyCount > 0) {
      issues.push(this.issue(
        "generated_audio_provider_conflict",
        "warn",
        "Some generated-audio intents are ready for provider execution, but others are blocked by provider capability conflicts.",
        "Resolve blocked generated-audio intents or approve partial generated-audio execution before final assembly."
      ));
    }
    if (input.generatedAudioExecutionPlan.blockedCount > 0 && input.generatedAudioExecutionPlan.readyCount === 0) {
      issues.push(this.issue(
        "generated_audio_provider_not_configured",
        "warn",
        "Generated-audio intents were supplied, but no verified provider capability can execute them.",
        "Provide explicit licensed audio tracks for this run, configure verified audio-generation capabilities, or adjust the generated-audio intents before claiming generated narration, BGM, ambience, or SFX."
      ));
    }
    return issues;
  }

  private issue(
    code: PostproductionAssetIssueCode,
    severity: PostproductionAssetIssueSeverity,
    message: string,
    repair: string
  ): PostproductionAssetIssue {
    return { code, severity, message, repair };
  }

  private totalCaptionSeconds(cues: readonly CaptionCue[]): number {
    return cues.reduce((sum, cue) => sum + Math.max(0, cue.endSecond - cue.startSecond), 0);
  }

  private roleCounts(tracks: readonly AudioMixTrack[]): readonly PostproductionAudioRoleCount[] {
    const counts = new Map<AudioTrackRole, number>();
    for (const track of tracks) {
      counts.set(track.role, (counts.get(track.role) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([role, count]) => ({ role, count }))
      .sort((left, right) => left.role.localeCompare(right.role));
  }

  private generatedAudioKindCounts(intents: readonly GeneratedAudioIntent[]): readonly PostproductionGeneratedAudioKindCount[] {
    const counts = new Map<GeneratedAudioIntentKind, number>();
    for (const intent of intents) {
      counts.set(intent.kind, (counts.get(intent.kind) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((left, right) => left.kind.localeCompare(right.kind));
  }

}
