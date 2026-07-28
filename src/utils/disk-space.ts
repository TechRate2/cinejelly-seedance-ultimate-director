/**
 * Free-disk guard for the render path. The pipeline audit's top robustness risk: per-job work dirs
 * accumulate, and once the output disk fills, not only do renders fail but every account/ledger write
 * (charges, refunds, top-ups) fails too — a money-integrity hazard. This guard REFUSES a new render
 * BEFORE spend when free disk is below a floor, so the disk never fills to the point of corrupting
 * money-state writes; the retention janitor reclaims work/redub dirs on its schedule.
 */

import { mkdir, statfs } from "node:fs/promises";
import { resolve } from "node:path";

/** Below this many GB free, new renders are refused so money-state writes stay safe. */
const MIN_FREE_GB_FOR_RENDER = 1;

export class RenderDiskUnavailableError extends Error {
  public readonly statusCode = 503;

  public constructor(freeGb: number) {
    super(
      `Máy chủ sắp hết dung lượng ổ đĩa (còn ${freeGb.toFixed(1)} GB) nên tạm ngừng nhận video mới để bảo vệ dữ liệu tài khoản/tiền. ` +
        `Chủ hệ thống: xóa bớt file cũ hoặc bật/giảm CINEJELLY_OUTPUT_RETENTION_DAYS. Bạn KHÔNG bị trừ tiền cho yêu cầu này.`
    );
    this.name = "RenderDiskUnavailableError";
  }
}

/**
 * Free GB on the volume holding `outputDirectory`; -1 when it cannot be read (never blocks then).
 *
 * The directory is passed IN rather than resolved from the environment here. Reading configuration
 * inside a low-level helper hides a deployment-wide setting in a file nobody thinks to look at, and
 * the repository keeps environment reads inside the API/application/config boundary for exactly
 * that reason — `npm run validation:source-structure` fails when one leaks out.
 */
export async function freeDiskGb(outputDirectory: string): Promise<number> {
  const resolvedDirectory = resolve(outputDirectory);
  try {
    await mkdir(resolvedDirectory, { recursive: true });
    const stats = await statfs(resolvedDirectory);
    return (stats.bavail * stats.bsize) / 1024 ** 3;
  } catch {
    return -1;
  }
}

/**
 * Throw RenderDiskUnavailableError when free disk is below the render floor. Fail-OPEN: if disk can't
 * be read (returns -1), it never blocks — an unreadable statfs must not stop a legitimate render.
 */
export async function assertRenderDiskAvailable(outputDirectory: string): Promise<void> {
  const freeGb = await freeDiskGb(outputDirectory);
  if (freeGb >= 0 && freeGb < MIN_FREE_GB_FOR_RENDER) {
    throw new RenderDiskUnavailableError(freeGb);
  }
}
