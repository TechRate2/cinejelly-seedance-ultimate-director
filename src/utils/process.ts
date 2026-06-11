/**
 * Safe child-process runner for FFmpeg/FFprobe operations.
 * Commands are executed with argument arrays rather than shell-built strings.
 */

import { spawn } from "node:child_process";

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunProcessOptions {
  readonly signal?: AbortSignal;
  readonly maxOutputBytes?: number;
}

const DEFAULT_MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;

export function runProcess(
  command: string,
  args: readonly string[],
  signalOrOptions?: AbortSignal | RunProcessOptions
): Promise<ProcessResult> {
  const options = normalizeOptions(signalOrOptions);
  const maxOutputBytes = Math.max(1024, options.maxOutputBytes ?? DEFAULT_MAX_PROCESS_OUTPUT_BYTES);

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      signal: options.signal
    });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(error);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxOutputBytes) {
        fail(new Error(`${command} stdout exceeded ${maxOutputBytes} bytes.`));
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maxOutputBytes) {
        fail(new Error(`${command} stderr exceeded ${maxOutputBytes} bytes.`));
        return;
      }
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      fail(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
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
