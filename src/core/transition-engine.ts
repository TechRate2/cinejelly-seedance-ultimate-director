/**
 * FFmpeg transition engine for smooth clip assembly.
 * It normalizes clip dimensions/timebase, applies xfade between video clips, and preserves audio
 * by crossfading real tracks while filling missing clip audio with silence.
 */

import type { MediaMetadata } from "../types/media.js";
import type { AspectRatio } from "../types/settings.js";
import type {
  ResolvedTransitionKind,
  TransitionArtifact,
  TransitionAssemblyInput,
  TransitionBoundaryPlan,
  TransitionSettings
} from "../types/transition.js";
import { readMediaToolCommand } from "../utils/media-tools.js";
import { runProcess } from "../utils/process.js";
import { MediaInspector } from "./media-inspector.js";

export const DEFAULT_TRANSITION_SETTINGS: TransitionSettings = {
  enabled: true,
  kind: "auto",
  durationSeconds: 0.35,
  fps: 30,
  preserveAudio: true
};

const TRANSITION_KINDS: readonly (TransitionSettings["kind"])[] = [
  "auto",
  "fade",
  "dissolve",
  "fadeblack",
  "fadewhite",
  "hblur",
  "zoomin",
  "wipeleft",
  "wiperight",
  "wipeup",
  "wipedown",
  "slideleft",
  "slideright",
  "slideup",
  "slidedown",
  "smoothleft",
  "smoothright",
  "circleopen",
  "circleclose"
];

export class TransitionEngine {
  private readonly mediaInspector: MediaInspector;

  public constructor(mediaInspector = new MediaInspector()) {
    this.mediaInspector = mediaInspector;
  }

  public async assemble(input: TransitionAssemblyInput, signal?: AbortSignal): Promise<TransitionArtifact> {
    if (input.inputPaths.length < 2) {
      throw new Error("Transition assembly requires at least two clips.");
    }
    this.validateSettings(input.settings);

    const metadata = await Promise.all(input.inputPaths.map((path) => this.mediaInspector.probe(path, signal)));
    const targetHeight = input.settings.targetHeight ?? this.firstVideoHeight(metadata) ?? 720;
    const targetWidth = this.targetWidth(targetHeight, input.settings.targetRatio, metadata);
    const transitionDurationSeconds = this.effectiveTransitionDurationSeconds(input.settings.durationSeconds, metadata);
    const usesFixedCanvas = Boolean(input.settings.targetRatio && input.settings.targetRatio !== "adaptive");
    const audioPresence = metadata.map((item) => this.hasAudio(item));
    const sourceAudioCount = audioPresence.filter(Boolean).length;
    const includeAudio = input.settings.preserveAudio && sourceAudioCount > 0;
    const silentAudioFillCount = includeAudio ? audioPresence.filter((hasAudio) => !hasAudio).length : 0;
    const boundaryPlans = this.buildBoundaryPlans(input, metadata, transitionDurationSeconds);
    const args = this.buildFfmpegArgs(input, metadata, targetHeight, targetWidth, boundaryPlans, usesFixedCanvas, includeAudio);
    await runProcess(readMediaToolCommand("ffmpeg"), args, signal);

    return {
      outputPath: input.outputPath,
      transitionCount: input.inputPaths.length - 1,
      boundaryPlans,
      usedAudioCrossfade: includeAudio,
      audioPreservationMode: includeAudio
        ? silentAudioFillCount > 0
          ? "crossfade_with_silence_fill"
          : "crossfade_all_source_audio"
        : "none",
      silentAudioFillCount,
      settings: {
        ...input.settings,
        durationSeconds: transitionDurationSeconds,
        targetHeight,
        ...(input.settings.targetRatio ? { targetRatio: input.settings.targetRatio } : {})
      },
      assembledAt: new Date()
    };
  }

  private buildFfmpegArgs(
    input: TransitionAssemblyInput,
    metadata: readonly MediaMetadata[],
    targetHeight: number,
    targetWidth: number,
    boundaryPlans: readonly TransitionBoundaryPlan[],
    usesFixedCanvas: boolean,
    includeAudio: boolean
  ): readonly string[] {
    const args: string[] = ["-y"];
    for (const path of input.inputPaths) {
      args.push("-i", path);
    }

    const filters: string[] = [];
    for (let index = 0; index < input.inputPaths.length; index += 1) {
      filters.push(
        `[${index}:v]setpts=PTS-STARTPTS,${this.canvasFilter(targetWidth, targetHeight, usesFixedCanvas)},setsar=1,fps=${input.settings.fps},format=yuv420p[v${index}]`
      );
      if (includeAudio) {
        filters.push(this.audioFilterFor(index, metadata[index]));
      }
    }

    let currentVideoLabel = "v0";
    for (const boundary of boundaryPlans) {
      const nextVideoLabel = `vx${boundary.toInputIndex}`;
      filters.push(
        `[${currentVideoLabel}][v${boundary.toInputIndex}]xfade=transition=${boundary.kind}:duration=${boundary.durationSeconds}:offset=${boundary.offsetSeconds.toFixed(3)}[${nextVideoLabel}]`
      );
      currentVideoLabel = nextVideoLabel;
    }

    let currentAudioLabel: string | undefined;
    if (includeAudio) {
      currentAudioLabel = "a0";
      for (const boundary of boundaryPlans) {
        const nextAudioLabel = `ax${boundary.toInputIndex}`;
        filters.push(
          `[${currentAudioLabel}][a${boundary.toInputIndex}]acrossfade=d=${boundary.durationSeconds}:c1=tri:c2=tri[${nextAudioLabel}]`
        );
        currentAudioLabel = nextAudioLabel;
      }
    }

    args.push("-filter_complex", filters.join(";"), "-map", `[${currentVideoLabel}]`);
    if (currentAudioLabel) {
      args.push("-map", `[${currentAudioLabel}]`);
    }
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      ...(currentAudioLabel ? ["-c:a", "aac", "-b:a", "192k"] : []),
      "-movflags",
      "+faststart",
      input.outputPath
    );
    return args;
  }

  private buildBoundaryPlans(
    input: TransitionAssemblyInput,
    metadata: readonly MediaMetadata[],
    transitionDurationSeconds: number
  ): readonly TransitionBoundaryPlan[] {
    const plans: TransitionBoundaryPlan[] = [];
    let cumulativeDuration = this.durationFor(metadata[0]);
    for (let index = 1; index < input.inputPaths.length; index += 1) {
      const intent = cleanIntent(input.transitionIntents?.[index - 1]);
      const selection = this.selectBoundaryTransition(input.settings.kind, intent);
      const durationSeconds = this.boundaryDurationSeconds(transitionDurationSeconds, selection.durationScale);
      const offsetSeconds = Math.max(0, cumulativeDuration - durationSeconds);
      plans.push({
        boundaryIndex: index - 1,
        fromInputIndex: index - 1,
        toInputIndex: index,
        kind: selection.kind,
        durationSeconds,
        offsetSeconds,
        ...(intent ? { intent } : {}),
        reasonCodes: selection.reasonCodes
      });
      cumulativeDuration = cumulativeDuration + this.durationFor(metadata[index]) - durationSeconds;
    }
    return plans;
  }

  private selectBoundaryTransition(
    requestedKind: TransitionSettings["kind"],
    intent: string | undefined
  ): {
    readonly kind: ResolvedTransitionKind;
    readonly durationScale: number;
    readonly reasonCodes: readonly string[];
  } {
    if (requestedKind !== "auto") {
      return {
        kind: requestedKind,
        durationScale: 1,
        reasonCodes: ["operator_fixed_transition_kind"]
      };
    }
    const normalizedIntent = intent?.toLowerCase() ?? "";
    // Native hard cut for UGC/creator rhythm: an explicit editorial cut instruction beats every soft
    // transition — a visible dissolve between handheld clips reads as slow, produced, and fake
    // (live-render feedback). The 0.08s floor in boundaryDurationSeconds yields ~2 frames:
    // perceptually a straight cut while still masking a 1-frame endpoint mismatch.
    // Negation guard: "without a jump cut" / "avoid hard cuts" must NOT trigger this branch — the
    // intra-beat continuity intent says exactly that and needs a soft boundary (diff-review fix).
    const cutPhrase = /(?:hard|jump|native|direct|quick|snap) cut/;
    const negatedCutPhrase = /(?:no|not|without|avoid|never)(?:\s+\w+){0,2}\s+(?:hard|jump|native|direct|quick|snap) cuts?/;
    if (cutPhrase.test(normalizedIntent) && !negatedCutPhrase.test(normalizedIntent)) {
      return {
        kind: "fade",
        durationScale: 0.12,
        reasonCodes: ["auto_transition", "intent_native_hard_cut"]
      };
    }
    if (/whip|blur|rush|fast pan|snap pan|speed ramp|motion smear|camera whip/.test(normalizedIntent)) {
      return {
        kind: "hblur",
        durationScale: 0.58,
        reasonCodes: ["auto_transition", "intent_whip_or_motion_blur"]
      };
    }
    if (/flash|flare|strobe|light burst|white out|bright/.test(normalizedIntent)) {
      return {
        kind: "fadewhite",
        durationScale: 0.5,
        reasonCodes: ["auto_transition", "intent_light_flash"]
      };
    }
    if (/black|dark|night|fade to black|lights? off/.test(normalizedIntent)) {
      return {
        kind: "fadeblack",
        durationScale: 0.75,
        reasonCodes: ["auto_transition", "intent_dark_transition"]
      };
    }
    if (/zoom|push in|push-in|macro|rush in|punch in/.test(normalizedIntent)) {
      return {
        kind: "zoomin",
        durationScale: 0.7,
        reasonCodes: ["auto_transition", "intent_zoom_or_macro_push"]
      };
    }
    if (/iris|circle|spotlight|portal/.test(normalizedIntent)) {
      return {
        kind: /close|out|away/.test(normalizedIntent) ? "circleclose" : "circleopen",
        durationScale: 0.85,
        reasonCodes: ["auto_transition", "intent_iris_or_spotlight"]
      };
    }
    if (/wipe|swipe|reveal|cover|object pass|hand cover|product pass/.test(normalizedIntent)) {
      return {
        kind: verticalDirectionKind(normalizedIntent, "wipe") ??
          (/right|rtl|back/.test(normalizedIntent) ? "wiperight" : "wipeleft"),
        durationScale: 0.85,
        reasonCodes: ["auto_transition", "intent_wipe_reveal"]
      };
    }
    if (/slide|push|pan|tracking|truck|dolly|move|camera drift/.test(normalizedIntent)) {
      return {
        kind: verticalDirectionKind(normalizedIntent, "slide") ??
          (/right|rtl|back/.test(normalizedIntent) ? "smoothright" : "smoothleft"),
        durationScale: 0.9,
        reasonCodes: ["auto_transition", "intent_camera_motion"]
      };
    }
    if (/match cut|seamless|continuous|continuity|last-frame|first-frame|xfade|bridge|clean start|clean end|same frame|stable transition/.test(normalizedIntent)) {
      return {
        kind: "dissolve",
        durationScale: 0.62,
        reasonCodes: ["auto_transition", "continuity_dissolve"]
      };
    }
    return {
      kind: "fade",
      durationScale: 1,
      reasonCodes: ["auto_transition", "default_invisible_dissolve"]
    };
  }

  private boundaryDurationSeconds(baseDurationSeconds: number, scale: number): number {
    const scaled = Math.max(0.08, Math.min(baseDurationSeconds, baseDurationSeconds * scale));
    return Number(scaled.toFixed(3));
  }

  private durationFor(metadata: MediaMetadata | undefined): number {
    if (!metadata?.durationSeconds || metadata.durationSeconds <= 0) {
      throw new Error("Transition assembly requires valid clip durations from ffprobe.");
    }
    return metadata.durationSeconds;
  }

  private hasAudio(metadata: MediaMetadata | undefined): boolean {
    return Boolean(metadata?.streams.some((stream) => stream.type === "audio"));
  }

  private audioFilterFor(index: number, metadata: MediaMetadata | undefined): string {
    const durationSeconds = this.durationFor(metadata).toFixed(3);
    const normalizedFormat = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";
    if (this.hasAudio(metadata)) {
      return `[${index}:a]asetpts=PTS-STARTPTS,aresample=48000,${normalizedFormat},apad,atrim=duration=${durationSeconds}[a${index}]`;
    }
    return `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${durationSeconds},asetpts=PTS-STARTPTS,${normalizedFormat}[a${index}]`;
  }

  private effectiveTransitionDurationSeconds(requestedDurationSeconds: number, metadata: readonly MediaMetadata[]): number {
    const shortestClipDuration = Math.min(...metadata.map((item) => this.durationFor(item)));
    const safeMaximum = Math.max(0.08, shortestClipDuration / 3);
    return Number(Math.min(requestedDurationSeconds, safeMaximum).toFixed(3));
  }

  private firstVideoHeight(metadata: readonly MediaMetadata[]): 480 | 720 | 1080 | 1440 | undefined {
    const height = metadata[0]?.streams.find((stream) => stream.type === "video")?.height;
    if (height === 480 || height === 720 || height === 1080 || height === 1440) {
      return height;
    }
    return undefined;
  }

  private targetWidth(
    targetHeight: 480 | 720 | 1080 | 1440,
    targetRatio: AspectRatio | undefined,
    metadata: readonly MediaMetadata[]
  ): number {
    if (targetRatio && targetRatio !== "adaptive") {
      return this.evenWidthForRatio(targetHeight, targetRatio);
    }
    const firstVideo = metadata[0]?.streams.find((stream) => stream.type === "video");
    if (firstVideo?.width && firstVideo.height && firstVideo.width > 0 && firstVideo.height > 0) {
      return this.nearestEven((targetHeight * firstVideo.width) / firstVideo.height);
    }
    return this.evenWidthForRatio(targetHeight, "16:9");
  }

  private evenWidthForRatio(targetHeight: 480 | 720 | 1080 | 1440, ratio: Exclude<AspectRatio, "adaptive">): number {
    return this.nearestEven(targetHeight * this.ratioValue(ratio));
  }

  private nearestEven(value: number): number {
    const rounded = Math.max(2, Math.round(value));
    return rounded % 2 === 0 ? rounded : rounded + 1;
  }

  private ratioValue(ratio: Exclude<AspectRatio, "adaptive">): number {
    switch (ratio) {
      case "21:9":
        return 21 / 9;
      case "16:9":
        return 16 / 9;
      case "4:3":
        return 4 / 3;
      case "1:1":
        return 1;
      case "3:4":
        return 3 / 4;
      case "9:16":
        return 9 / 16;
    }
  }

  private canvasFilter(targetWidth: number, targetHeight: number, usesFixedCanvas: boolean): string {
    return usesFixedCanvas
      ? `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}`
      : `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`;
  }

  private validateSettings(settings: TransitionSettings): void {
    if (!settings.enabled) {
      throw new Error("Transition settings must be enabled before transition assembly.");
    }
    if (!TRANSITION_KINDS.includes(settings.kind)) {
      throw new Error(`Transition kind must be one of: ${TRANSITION_KINDS.join(", ")}.`);
    }
    if (!Number.isFinite(settings.durationSeconds) || settings.durationSeconds <= 0 || settings.durationSeconds > 3) {
      throw new Error("Transition duration must be between 0 and 3 seconds.");
    }
    if (!Number.isFinite(settings.fps) || settings.fps < 12 || settings.fps > 60) {
      throw new Error("Transition FPS must be between 12 and 60.");
    }
  }
}

function cleanIntent(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

function verticalDirectionKind(
  normalizedIntent: string,
  family: "wipe" | "slide"
): ResolvedTransitionKind | undefined {
  if (/up|rise|lift/.test(normalizedIntent)) {
    return family === "wipe" ? "wipeup" : "slideup";
  }
  if (/down|drop|fall/.test(normalizedIntent)) {
    return family === "wipe" ? "wipedown" : "slidedown";
  }
  return undefined;
}
