/**
 * Unit tests for the cross-platform clipboard writer.
 */
import { describe, expect, it, afterEach, vi } from "vitest";

import { resolveCopier } from "./clipboard.js";

describe("resolveCopier", () => {
  const originalPlatform = process.platform;
  const originalWayland = process.env.WAYLAND_DISPLAY;

  function setPlatform(p: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { value: p, configurable: true });
  }

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    if (originalWayland === undefined) {
      delete process.env.WAYLAND_DISPLAY;
    } else {
      process.env.WAYLAND_DISPLAY = originalWayland;
    }
  });

  it("returns pbcopy on darwin", () => {
    setPlatform("darwin");
    expect(resolveCopier()).toEqual({ command: "pbcopy", args: [] });
  });

  it("returns clip on win32", () => {
    setPlatform("win32");
    expect(resolveCopier()).toEqual({ command: "clip", args: [] });
  });

  it("returns xclip on X11 linux (no WAYLAND_DISPLAY)", () => {
    setPlatform("linux");
    delete process.env.WAYLAND_DISPLAY;
    expect(resolveCopier()).toEqual({
      command: "xclip",
      args: ["-selection", "clipboard"],
    });
  });

  it("returns wl-copy on Wayland linux", () => {
    setPlatform("linux");
    process.env.WAYLAND_DISPLAY = "wayland-0";
    expect(resolveCopier()).toEqual({ command: "wl-copy", args: [] });
  });

  it("returns null on unsupported platforms", () => {
    setPlatform("aix" as NodeJS.Platform);
    expect(resolveCopier()).toBeNull();
  });
});

describe("copyToClipboard", () => {
  it("resolves false when the helper binary is missing", async () => {
    vi.resetModules();
    const onMock = vi.fn((event: string, cb: (...a: unknown[]) => void) => {
      if (event === "error") {
        // Simulate ENOENT — the spawned binary doesn't exist on the test runner.
        setImmediate(() => cb(new Error("ENOENT")));
      }
      return undefined;
    });
    const stdinEnd = vi.fn();
    const spawnMock = vi.fn(() => ({ on: onMock, stdin: { end: stdinEnd } }));
    vi.doMock("node:child_process", () => ({ spawn: spawnMock }));
    vi.doMock("node:os", () => ({ platform: () => "darwin" }));

    const { copyToClipboard } = await import("./clipboard.js");
    await expect(copyToClipboard("hello")).resolves.toBe(false);
  });

  it("resolves false on unsupported platforms (no spawn attempted)", async () => {
    vi.resetModules();
    const spawnMock = vi.fn();
    vi.doMock("node:child_process", () => ({ spawn: spawnMock }));
    vi.doMock("node:os", () => ({ platform: () => "aix" }));

    const { copyToClipboard } = await import("./clipboard.js");
    await expect(copyToClipboard("hello")).resolves.toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
