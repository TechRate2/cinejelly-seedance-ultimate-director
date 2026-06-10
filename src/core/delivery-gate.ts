/**
 * Delivery Gate blocks customer handoff when deterministic media checks fail.
 * It keeps final-output contract validation outside FFmpeg assembly mechanics.
 */

import type { AssembledDeliverable } from "../types/assembly.js";
import type { DeliveryGateFinding, DeliveryGateReport } from "../types/delivery.js";
import type { FlexibleSeedanceSettings, Resolution } from "../types/settings.js";

export class DeliveryGate {
  public evaluate(input: {
    readonly deliverable: AssembledDeliverable;
    readonly settings: FlexibleSeedanceSettings;
  }): DeliveryGateReport {
    const findings: DeliveryGateFinding[] = [
      ...this.inspectDeliveryStatus(input.deliverable),
      ...this.inspectVideoContract(input.deliverable, input.settings.resolution),
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

  private inspectVideoContract(deliverable: AssembledDeliverable, resolution: Resolution): readonly DeliveryGateFinding[] {
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

    const expectedHeight = this.expectedHeight(resolution);
    if (videoStream.height !== expectedHeight) {
      findings.push({
        status: "block",
        checkpoint: "selected_resolution",
        evidence: `Expected ${resolution} output height ${expectedHeight}px but found ${videoStream.height ?? "unknown"}px.`,
        repair: "Run postproduction scaling with the selected resolution before delivery."
      });
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

  private rollup(findings: readonly DeliveryGateFinding[]): DeliveryGateReport["status"] {
    if (findings.some((finding) => finding.status === "block")) {
      return "block";
    }
    return findings.length > 0 ? "warn" : "pass";
  }
}
