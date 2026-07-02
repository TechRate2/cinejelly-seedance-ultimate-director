/**
 * Safe child-process runner for FFmpeg/FFprobe operations.
 * Commands are executed with argument arrays rather than shell-built strings.
 */

import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunProcessOptions {
  readonly signal?: AbortSignal;
  readonly maxOutputBytes?: number;
  /** Hard wall-clock cap; a stalled ffmpeg/ffprobe is killed instead of pinning a job. */
  readonly timeoutMs?: number;
}

const DEFAULT_MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;
/** 30 minutes: long enough for real long-form renders, short enough to reap a hung child. */
const DEFAULT_PROCESS_TIMEOUT_MS = 30 * 60 * 1000;
/** Grace period between SIGTERM and SIGKILL for a child that ignores termination. */
const KILL_ESCALATION_MS = 4000;

export function runProcess(
  command: string,
  args: readonly string[],
  signalOrOptions?: AbortSignal | RunProcessOptions
): Promise<ProcessResult> {
  const options = normalizeOptions(signalOrOptions);
  const maxOutputBytes = Math.max(1024, options.maxOutputBytes ?? DEFAULT_MAX_PROCESS_OUTPUT_BYTES);
  const timeoutMs = Math.max(1000, options.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS);

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      signal: options.signal
    });
    // StringDecoder holds a partial multibyte codepoint across chunk boundaries so split
    // UTF-8 sequences (non-ASCII paths in ffprobe JSON / errors) are not corrupted.
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const escalatingKill = (): void => {
      try {
        child.kill("SIGTERM");
      } catch {
        // Child may already be gone.
      }
      killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already reaped.
        }
      }, KILL_ESCALATION_MS);
      killTimer.unref?.();
    };

    const cleanup = (): void => {
      clearTimeout(timeoutTimer);
      if (killTimer) {
        clearTimeout(killTimer);
      }
    };

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      escalatingKill();
      reject(error);
    };

    const timeoutTimer = setTimeout(() => {
      fail(new Error(`${command} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    timeoutTimer.unref?.();

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxOutputBytes) {
        fail(new Error(`${command} stdout exceeded ${maxOutputBytes} bytes.`));
        return;
      }
      stdout += stdoutDecoder.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maxOutputBytes) {
        fail(new Error(`${command} stderr exceeded ${maxOutputBytes} bytes.`));
        return;
      }
      stderr += stderrDecoder.write(chunk);
    });
    child.on("error", (error) => {
      fail(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr.slice(0, 2000)}`));
    });
  });
}

function normalizeOptions(signalOrOptions: AbortSignal | RunProcessOptions | undefined): RunProcessOptions {
  if (!signalOrOptions) {
    return {};
  }
  return signalOrOptions instanceof AbortSignal ? { signal: signalOrOptions } : signalOrOptions;
}
