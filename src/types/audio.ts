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
  readonly options: AudioMixOptions;
  readonly includeOriginalAudio: boolean;
}

export interface AudioMixArtifact {
  readonly outputPath: string;
  readonly trackCount: number;
  readonly mixedAt: Date;
  readonly mode: AudioMixOptions["mode"];
}
