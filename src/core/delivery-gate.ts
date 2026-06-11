/**
 * Delivery Gate blocks customer handoff when deterministic media checks fail.
 * It keeps final-output contract validation outside FFmpeg assembly mechanics.
 */

import type { AssembledDeliverable } from "../types/assembly.js";
import type { DeliveryGateFinding, DeliveryGateReport } from "../types/delivery.js";
import type { AspectRatio, FlexibleSeedanceSettings, Resolution } from "../types/settings.js";

const ASPECT_RATIO_TOLERANCE = 0.02;

export class DeliveryGate {
  public evaluate(input: {
    readonly deliverable: AssembledDeliverable;
    readonly settings: FlexibleSeedanceSettings;
  }): DeliveryGateReport {
    const findings: DeliveryGateFinding[] = [
      ...this.inspectDeliveryStatus(input.deliverable),
      ...this.inspectVideoContract(input.deliverable, input.settings),
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

  private expectedHeight(resolution: Resolution): 480 | 720 | 1080 {
    switch (resolution) {
      case "480p":
        return 480;
      case "720p":
        return 720;
      case "1080p":
        return 1080;
    }
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
