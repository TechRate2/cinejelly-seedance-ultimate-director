/**
 * Cross-platform clipboard writer. Pipes the text into the OS-native
 * helper:
 *   - macOS: `pbcopy`
 *   - Linux/BSD: `xclip -selection clipboard` (X11) or `wl-copy` (Wayland)
 *   - Windows: `clip`
 *
 * Returns whether the copy succeeded so callers can decide whether to
 * surface a "✓ Copied to clipboard" hint. Failures are silent — copying
 * is convenience, never the user's critical path.
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";

interface Copier {
  command: string;
  args: string[];
}

/**
 * Pick the OS-appropriate copier command. Exported so unit tests can
 * verify the args without invoking spawn.
 */
export function resolveCopier(): Copier | null {
  switch (platform()) {
    case "darwin":
      return { command: "pbcopy", args: [] };
    case "win32":
      return { command: "clip", args: [] };
    case "linux":
    case "freebsd":
    case "openbsd":
      // Prefer wl-copy if WAYLAND_DISPLAY is set; fall back to xclip.
      // Both write to the system clipboard ("clipboard" selection on
      // xclip; default register on wl-copy).
      if (process.env.WAYLAND_DISPLAY) {
        return { command: "wl-copy", args: [] };
      }
      return { command: "xclip", args: ["-selection", "clipboard"] };
    default:
      return null;
  }
}

/**
 * Write `text` to the system clipboard. Resolves to `true` if the
 * helper exited cleanly, `false` otherwise (missing binary, write
 * error, unsupported platform).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const opener = resolveCopier();
  if (!opener) return false;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    try {
      const child = spawn(opener.command, opener.args, {
        stdio: ["pipe", "ignore", "ignore"],
        shell: false,
      });
      child.on("error", () => finish(false));
      child.on("close", (code) => finish(code === 0));
      child.stdin.end(text, "utf8");
    } catch {
      finish(false);
    }
  });
}
