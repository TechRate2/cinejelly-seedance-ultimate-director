import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveContextPath } from "./context.js";

describe("resolveContextPath", () => {
  it("finds CONTEXT.md from the bundled dist layout", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-context-dist-"));
    const dist = join(root, "dist");
    const context = join(root, "CONTEXT.md");
    await mkdir(dist, { recursive: true });
    await writeFile(context, "# Context\n", "utf-8");

    expect(resolveContextPath(dist)).toBe(context);
  });

  it("finds CONTEXT.md from the source command layout", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibe-context-source-"));
    const commandDir = join(root, "src", "commands");
    const context = join(root, "CONTEXT.md");
    await mkdir(commandDir, { recursive: true });
    await writeFile(context, "# Context\n", "utf-8");

    expect(resolveContextPath(commandDir)).toBe(context);
  });
});
