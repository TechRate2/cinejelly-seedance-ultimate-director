/**
 * Assembly types for turning rendered clips into a final deliverable.
 * The engine uses local media files or provider output URLs and produces a customer-facing video file.
 */

export interface AssemblyClip {
  readonly clipId: string;
  readonly sourceUrlOrPath: string;
  readonly order: number;
}

export interface AssemblyInput {
  readonly projectId: string;
  readonly clips: readonly AssemblyClip[];
  readonly outputPath: string;
  readonly workDirectory: string;
}

export interface AssembledDeliverable {
  readonly projectId: string;
  readonly outputPath: string;
  readonly clipCount: number;
  readonly assembledAt: Date;
}
