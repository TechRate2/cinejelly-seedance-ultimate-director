/**
 * Delivery Gate blocks customer handoff when deterministic media checks fail.
 * It keeps final-output contract validation outside FFmpeg assembly mechanics.
 */

import type { AssembledDeliverable } from "../types/assembly.js";
import type { DeliveryGateFinding, DeliveryGateReport } from "../types/delivery.js";
import type { AspectRatio, FlexibleSeedanceSettings, Resolution } from "../types/settings.js";
import { seedanceResolutionHeight } from "../config/seedance-settings.js";

const ASPECT_RATIO_TOLERANCE = 0.02;
const DURATION_WARN_TOLERANCE = 0.05;
const DURATION_BLOCK_TOLERANCE = 0.15;
/**
 * Undershoot blocks earlier than overshoot: a video shorter than requested is the
 * "thiếu thời lượng" defect customers notice immediately, while modest overshoot is
 * usually acceptable padding.
 */
/**
 * Short-side block threshold for the DELIVERED video. Exported as the SINGLE source of truth: any
 * pre-spend predictor that stops a job early must use this exact number, or it either blocks jobs
 * delivery would have accepted (lost revenue) or lets doomed jobs burn the full render (lost money).
 */
export const DURATION_SHORT_BLOCK_TOLERANCE = 0.1;

export class DeliveryGate {
  public evaluate(input: {
    readonly deliverable: AssembledDeliverable;
    readonly settings: FlexibleSeedanceSettings;
  }): DeliveryGateReport {
    const findings: DeliveryGateFinding[] = [
      ...this.inspectDeliveryStatus(input.deliverable),
      ...this.inspectVideoContract(input.deliverable, input.settings),
      ...this.inspectDurationContract(input.deliverable, input.settings),
      ...this.inspectAudioContract(input.deliverable, input.settings)
    ];

    return {
      status: this.rollup(findings),
      findings
    };
  }

  public assertPass(report: DeliveryGateReport): void {
    if (report.status !== "block") {
      return;
    }
    const details = report.findings
      .filter((finding) => finding.status === "block")
      .slice(0, 5)
      .map((finding) => `${finding.checkpoint}: ${finding.evidence} ${finding.repair}`)
      .join("; ");
    throw new Error(`Delivery gate blocked final output. ${details}`);
  }

  private inspectDeliveryStatus(deliverable: AssembledDeliverable): readonly DeliveryGateFinding[] {
    if (deliverable.inspection.status !== "fail") {
      return [];
    }
    return deliverable.inspection.findings.map((finding) => ({
      status: "block",
      checkpoint: "ffprobe_delivery_status",
      evidence: finding,
      repair: "Rebuild assembly or inspect source clips before customer delivery."
    }));
  }

  private inspectVideoContract(
    deliverable: AssembledDeliverable,
    settings: FlexibleSeedanceSettings
  ): readonly DeliveryGateFinding[] {
    const findings: DeliveryGateFinding[] = [];
    const videoStream = deliverable.inspection.metadata.streams.find((stream) => stream.type === "video");
    if (!videoStream) {
      findings.push({
        status: "block",
        checkpoint: "video_stream_presence",
        evidence: "Final deliverable has no video stream.",
        repair: "Block delivery and rebuild the timeline from selected rendered clips."
      });
      return findings;
    }

    const expectedHeight = this.expectedHeight(settings.resolution);
    if (videoStream.height !== expectedHeight) {
      findings.push({
        status: "block",
        checkpoint: "selected_resolution",
        evidence: `Expected ${settings.resolution} output height ${expectedHeight}px but found ${videoStream.height ?? "unknown"}px.`,
        repair: "Run postproduction scaling with the selected resolution before delivery."
      });
    }
    const expectedAspectRatio = this.expectedAspectRatio(settings.ratio);
    if (expectedAspectRatio !== undefined && videoStream.width && videoStream.height) {
      const actualAspectRatio = videoStream.width / videoStream.height;
      const drift = Math.abs(actualAspectRatio - expectedAspectRatio) / expectedAspectRatio;
      if (drift > ASPECT_RATIO_TOLERANCE) {
        findings.push({
          status: "block",
          checkpoint: "selected_aspect_ratio",
          evidence: `Expected ${settings.ratio} aspect ratio but found ${videoStream.width}x${videoStream.height}.`,
          repair: "Regenerate or scale the final timeline to the selected aspect ratio before delivery."
        });
      }
    }
    return findings;
  }

  private inspectDurationContract(
    deliverable: AssembledDeliverable,
    settings: FlexibleSeedanceSettings
  ): readonly DeliveryGateFinding[] {
    const actualDurationSeconds = deliverable.inspection.metadata.durationSeconds;
    const targetDurationSeconds = settings.durationTargetSeconds;
    if (
      actualDurationSeconds === undefined ||
      !Number.isFinite(actualDurationSeconds) ||
      !Number.isFinite(targetDurationSeconds) ||
      targetDurationSeconds <= 0
    ) {
      return [];
    }

    const drift = Math.abs(actualDurationSeconds - targetDurationSeconds) / targetDurationSeconds;
    if (drift <= DURATION_WARN_TOLERANCE) {
      return [];
    }

    const isShort = actualDurationSeconds < targetDurationSeconds;
    const blockTolerance = isShort ? DURATION_SHORT_BLOCK_TOLERANCE : DURATION_BLOCK_TOLERANCE;
    const driftPercent = Number((drift * 100).toFixed(2));
    const evidence = `Expected approximately ${targetDurationSeconds}s but final deliverable is ${Number(actualDurationSeconds.toFixed(3))}s (${driftPercent}% drift${isShort ? ", short side" : ""}).`;
    if (drift > blockTolerance) {
      return [
        {
          status: "block",
          checkpoint: "target_duration",
          evidence,
          repair: "Replan shot durations or transition overlap before customer delivery."
        }
      ];
    }
    return [
      {
        status: "warn",
        checkpoint: "target_duration",
        evidence,
        repair: "Review transition overlap and timing before approving the artifact."
      }
    ];
  }

  private inspectAudioContract(
    deliverable: AssembledDeliverable,
    settings: FlexibleSeedanceSettings
  ): readonly DeliveryGateFinding[] {
    if (settings.audioMode === "none" || deliverable.inspection.audio.hasAudio) {
      return [];
    }
    return [
      {
        status: "warn",
        checkpoint: "audio_presence",
        evidence: `Audio mode is ${settings.audioMode} but final deliverable has no audio stream.`,
        repair: "Use provider audio or postproduction audio mix if the customer requires sound."
      }
    ];
  }

  private expectedHeight(resolution: Resolution): 480 | 720 | 1080 | 1440 {
    return seedanceResolutionHeight(resolution);
  }

  private expectedAspectRatio(ratio: AspectRatio): number | undefined {
    switch (ratio) {
      case "adaptive":
        return undefined;
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

  private rollup(findings: readonly DeliveryGateFinding[]): DeliveryGateReport["status"] {
    if (findings.some((finding) => finding.status === "block")) {
      return "block";
    }
    return findings.length > 0 ? "warn" : "pass";
  }
}
