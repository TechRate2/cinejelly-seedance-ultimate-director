/**
 * Postproduction asset planner.
 * Inspired by MoneyPrinterTurbo subtitle/audio/BGM stage planning and VibeFrame review artifacts,
 * rewritten as CineJelly-owned deterministic planning evidence.
 */

import type { AudioMixOptions, AudioMixTrack, AudioTrackRole } from "../types/audio.js";
import type { CaptionCue, CaptionOptions } from "../types/caption.js";
import type {
  PostproductionAssetIssue,
  PostproductionAssetIssueCode,
  PostproductionAssetIssueSeverity,
  PostproductionAssetPlan,
  PostproductionAudioRoleCount
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
}

export class PostproductionAssetPlanner {
  public plan(input: PostproductionAssetPlannerInput): PostproductionAssetPlan {
    const captionCues = input.captionCues ?? [];
    const captionOptions = input.captionOptions ?? { enabled: false, burnIn: false };
    const audioTracks = input.audioTracks ?? [];
    const audioMixOptions = input.audioMixOptions ?? {
      ...DEFAULT_AUDIO_MIX_OPTIONS,
      enabled: audioTracks.length > 0
    };
    const issues = this.issues({
      captionCues,
      captionOptions,
      audioTracks,
      audioMixOptions
    });
    const captionEnabled = captionOptions.enabled && captionCues.length > 0;
    const audioEnabled = audioMixOptions.enabled && audioTracks.length > 0;
    const status = issues.some((issue) => issue.severity === "warn" || issue.severity === "block")
      ? "review_required"
      : captionEnabled || audioEnabled
        ? "planned"
        : "disabled";

    return {
      planId: createStableId(
        "postproduction_assets",
        `${input.projectId}:${captionCues.length}:${audioTracks.map((track) => `${track.trackId}:${track.role}`).join("|")}`
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
      issueCount: issues.length,
      issues
    };
  }

  private issues(input: {
    readonly captionCues: readonly CaptionCue[];
    readonly captionOptions: CaptionOptions;
    readonly audioTracks: readonly AudioMixTrack[];
    readonly audioMixOptions: AudioMixOptions;
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
}
