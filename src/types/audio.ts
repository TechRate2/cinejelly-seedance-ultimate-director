/**
 * Audio mix types for postproduction.
 * Tracks may represent background music, narration, ambience, or SFX produced by future agents.
 */

export type AudioTrackRole = "music" | "narration" | "ambience" | "sfx";

export type GeneratedAudioIntentKind = "tts_narration" | "bgm" | "ambience" | "sfx";

export interface AudioMixTrack {
  readonly trackId: string;
  readonly sourceUrlOrPath: string;
  readonly role: AudioTrackRole;
  readonly volume: number;
  /** When this track should start in the mix (seconds from 0). Omitted/0 = from the beginning.
   * Applied as an ffmpeg adelay so timed narration/SFX/ambience cues land at their planned moment
   * instead of all stacking at 0:00. */
  readonly startSeconds?: number;
  /**
   * Optional playback-tempo multiplier (ffmpeg atempo), used by dubbing duration-fit: a synthesized
   * narration segment that runs longer than its timing window is sped up (capped upstream at a
   * natural-sounding ratio) so it never overlaps the next segment. 1/undefined = unchanged.
   * Valid range (single ffmpeg atempo instance): 0.5–2.
   */
  readonly tempo?: number;
}

export interface GeneratedAudioIntent {
  readonly intentId: string;
  readonly kind: GeneratedAudioIntentKind;
  readonly prompt: string;
  readonly startSecond?: number;
  readonly endSecond?: number;
  readonly durationSeconds?: number;
  readonly language?: string;
  readonly voiceStyle?: string;
  readonly mood?: string;
  readonly volume?: number;
  readonly providerPreference?: string;
}

export interface AudioMixOptions {
  readonly enabled: boolean;
  readonly mode: "mix" | "replace";
  readonly originalVolume: number;
  readonly outputBitrate: string;
}

export interface AudioMixInput {
  readonly projectId: string;
  readonly inputVideoPath: string;
  readonly outputVideoPath: string;
  readonly workDirectory: string;
  readonly tracks: readonly AudioMixTrack[];
  /**
   * Already-downloaded local file per track (same order as `tracks`). When provided the engine skips
   * its own download step — used by callers that must probe/pre-process the files first (dubbing
   * duration-fit measures each synthesized segment before mixing).
   */
  readonly materializedTrackPaths?: readonly string[];
  readonly options: AudioMixOptions;
  readonly includeOriginalAudio: boolean;
}

export interface AudioMixArtifact {
  readonly outputPath: string;
  readonly trackCount: number;
  readonly mixedAt: Date;
  readonly mode: AudioMixOptions["mode"];
}
