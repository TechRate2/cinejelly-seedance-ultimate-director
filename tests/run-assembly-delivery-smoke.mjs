#!/usr/bin/env node
/**
 * No-spend regression for THE STEP THAT ACTUALLY PRODUCES THE CUSTOMER'S VIDEO.
 *
 * Every other stage produces a plan, a prompt, or a clip URL. AssemblyEngine.assemble is the one
 * that turns those into the single .mp4 the customer downloads. It was, until this file, the only
 * major stage with no check that ran it — the suite proved the plan was right and never proved the
 * file came out.
 *
 * It is also the stage with the most branching: which of concat / transitions / postproduction /
 * captions / audio-mix runs decides WHICH stage writes the requested output path, and every stage
 * that does not run shifts the deliverable onto a different file. An audit of that logic found a
 * combination where the last stage to run writes an intermediate, that intermediate IS the returned
 * deliverable, and the cleanup pass then deleted it — the method returns a size, a SHA-256 and a
 * path to a file that no longer exists. Reachable when a caller disables postproduction with
 * transitions on; the product's own pipeline always enables postproduction, so this was a trap laid
 * for the next change rather than a live defect. The fix protects whatever is RETURNED, not only
 * what was REQUESTED.
 *
 * These checks run the real engine over real files: ffmpeg synthesises the clips locally, so there
 * is no network, no provider and no spend. If ffmpeg is absent the file reports that honestly
 * instead of passing — a green that means "did not look" is the failure mode this suite exists to
 * prevent.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "file://" + repoRoot.replace(/\\/g, "/") + "/dist";
const { AssemblyEngine } = await import(`${base}/core/assembly-engine.js`);
const { DEFAULT_POSTPRODUCTION_SETTINGS } = await import(`${base}/core/postproduction-engine.js`);
const { readMediaToolCommand } = await import(`${base}/utils/media-tools.js`);

const checks = [];
const check = (name, pass, detail) =>
  checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

const ffmpeg = readMediaToolCommand("ffmpeg");
const ffprobe = readMediaToolCommand("ffprobe");
let toolsPresent = true;
try {
  await run(ffmpeg, ["-version"]);
  await run(ffprobe, ["-version"]);
} catch {
  toolsPresent = false;
}
check("media_tools_available", toolsPresent,
  toolsPresent ? `${ffmpeg} / ${ffprobe}` : "ffmpeg/ffprobe not found - assembly cannot be exercised, so this file cannot report green");

const workRoot = join(repoRoot, ".tmp-assembly-smoke");
rmSync(workRoot, { recursive: true, force: true });
mkdirSync(workRoot, { recursive: true });

/** A real 1-second clip. Identical geometry across clips so stream-copy concat is legal. */
const makeClip = async (path, colour) => {
  await run(ffmpeg, [
    "-y", "-f", "lavfi", "-i", `color=c=${colour}:s=320x180:d=1:r=24`,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path
  ]);
};

const durationOf = async (path) => {
  const { stdout } = await run(ffprobe, [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path
  ]);
  return Number.parseFloat(stdout.trim());
};

if (toolsPresent) {
  const clipDir = join(workRoot, "clips");
  mkdirSync(clipDir, { recursive: true });
  const clipPaths = [];
  for (const [index, colour] of ["red", "green", "blue"].entries()) {
    const path = join(clipDir, `clip${index}.mp4`);
    await makeClip(path, colour);
    clipPaths.push(path);
  }
  check("test_clips_were_synthesised_locally", clipPaths.every((path) => existsSync(path)), `${clipPaths.length} clips, no network`);

  const clips = clipPaths.map((path, index) => ({ clipId: `c${index}`, sourceUrlOrPath: path, order: index }));

  /** Runs the engine and answers the only question that matters: is the returned file really there? */
  const assembleInto = async (label, extra) => {
    const work = join(workRoot, label);
    mkdirSync(work, { recursive: true });
    const outputPath = join(work, "final.mp4");
    const engine = new AssemblyEngine();
    const deliverable = await engine.assemble({
      projectId: label,
      clips,
      outputPath,
      workDirectory: work,
      ...extra
    });
    return { deliverable, outputPath, work };
  };

  // --- 1. THE ORDINARY PATH the product uses: postproduction on, no captions, no audio mix.
  {
    const { deliverable, outputPath } = await assembleInto("standard", {
      postproductionSettings: { ...DEFAULT_POSTPRODUCTION_SETTINGS, targetHeight: 180, targetRatio: "16:9" }
    });
    check("standard_delivers_a_file_that_exists", existsSync(deliverable.outputPath), deliverable.outputPath);
    check("standard_delivers_to_the_requested_path", resolve(deliverable.outputPath) === resolve(outputPath));
    check("standard_reported_size_matches_the_file_on_disk",
      existsSync(deliverable.outputPath) && statSync(deliverable.outputPath).size === deliverable.outputByteSize,
      `reported ${deliverable.outputByteSize}`);
    check("standard_counted_every_clip", deliverable.clipCount === clips.length, `${deliverable.clipCount} of ${clips.length}`);
    // Transitions default ON for more than one clip, so each boundary EATS overlap: the delivered
    // runtime is sum(clips) - (n-1) x overlap, not sum(clips). The director pads shot durations by
    // exactly this amount, so if the constant and the real ffmpeg output ever disagree, every video
    // is delivered short and the duration gate blocks work the customer already paid for.
    const seconds = await durationOf(deliverable.outputPath);
    const overlapSeconds = 0.35;
    const expected = clips.length * 1 - (clips.length - 1) * overlapSeconds;
    check("standard_duration_matches_the_crossfade_formula", Math.abs(seconds - expected) <= 0.12,
      `${seconds.toFixed(3)}s, formula predicts ${expected.toFixed(2)}s`);
    check("crossfade_shortens_rather_than_lengthens", seconds < clips.length, `${seconds.toFixed(3)}s < ${clips.length}s`);
  }

  // --- 1b. Transitions explicitly OFF: stream-copy concat, so the runtime is the plain sum.
  {
    const { deliverable } = await assembleInto("no_transitions", {
      postproductionSettings: { ...DEFAULT_POSTPRODUCTION_SETTINGS, targetHeight: 180, targetRatio: "16:9" },
      transitionSettings: { enabled: false }
    });
    const seconds = await durationOf(deliverable.outputPath);
    check("without_transitions_duration_is_the_plain_sum", Math.abs(seconds - clips.length) <= 0.12, `${seconds.toFixed(3)}s`);
  }

  // --- 2. THE TRAP. Postproduction off with transitions on: the last stage to run writes an
  // intermediate, and that intermediate is the deliverable. Before the fix, cleanup deleted it.
  {
    const { deliverable } = await assembleInto("transitions_without_postproduction", {
      postproductionSettings: { ...DEFAULT_POSTPRODUCTION_SETTINGS, enabled: false },
      transitionSettings: { enabled: true, targetHeight: 180, targetRatio: "16:9" }
    });
    check("returned_deliverable_survives_cleanup", existsSync(deliverable.outputPath),
      existsSync(deliverable.outputPath)
        ? deliverable.outputPath
        : `assemble() returned ${deliverable.outputPath} and then deleted it`);
    check("returned_deliverable_is_not_empty",
      existsSync(deliverable.outputPath) && statSync(deliverable.outputPath).size > 0);
    check("returned_deliverable_is_playable",
      existsSync(deliverable.outputPath) && (await durationOf(deliverable.outputPath)) > 0);
  }

  // --- 3. Working copies must not accumulate. The deliverable stays; the scratch files go.
  {
    const { deliverable, work } = await assembleInto("cleanup", {
      postproductionSettings: { ...DEFAULT_POSTPRODUCTION_SETTINGS, targetHeight: 180, targetRatio: "16:9" }
    });
    check("intermediate_concat_list_was_removed", !existsSync(join(work, "cleanup_concat.txt")));
    check("intermediate_raw_render_was_removed", !existsSync(join(work, "cleanup_assembled_raw.mp4")));
    check("deliverable_was_kept_while_intermediates_were_removed", existsSync(deliverable.outputPath));
  }

  // --- 4. An empty order must be refused rather than producing a zero-length "video".
  {
    let refused = false;
    try {
      await new AssemblyEngine().assemble({
        projectId: "empty", clips: [], outputPath: join(workRoot, "empty.mp4"), workDirectory: workRoot
      });
    } catch {
      refused = true;
    }
    check("assembling_zero_clips_is_refused", refused);
  }

  rmSync(workRoot, { recursive: true, force: true });
}

const failed = checks.filter((item) => !item.pass);
const report = {
  schemaVersion: "cinejelly.assembly-delivery-smoke.v1",
  status: failed.length === 0 ? "pass" : "fail",
  checkCount: checks.length,
  failedCount: failed.length,
  checks,
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  nextActions: [
    "When you add or reorder an assembly stage, add its combination here. The bug class is always the same: a stage that does not run shifts the deliverable onto a different file.",
    "Assert on the file, not on the return value. outputByteSize and outputSha256 were both correct for a file that had already been deleted."
  ]
};
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
