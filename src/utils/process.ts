/**
 * Safe child-process runner for FFmpeg/FFprobe operations.
 * Commands are executed with argument arrays rather than shell-built strings.
 */

import { spawn } from "node:child_process";

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
}

export function runProcess(command: string, args: readonly string[], signal?: AbortSignal): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      signal
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${stderr.slice(0, 2000)}`));
    });
  });
}
