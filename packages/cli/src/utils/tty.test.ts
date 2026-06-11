import { afterEach, describe, expect, it } from "vitest";

import { fitOptionToLine } from "./tty.js";

const originalColumns = process.stdout.columns;

function setColumns(columns: number): void {
  Object.defineProperty(process.stdout, "columns", {
    configurable: true,
    value: columns,
  });
}

afterEach(() => {
  Object.defineProperty(process.stdout, "columns", {
    configurable: true,
    value: originalColumns,
  });
});

describe("fitOptionToLine", () => {
  it("keeps short options unchanged", () => {
    setColumns(80);
    expect(fitOptionToLine("OpenAI gpt-image-2", 9)).toBe("OpenAI gpt-image-2");
  });

  it("truncates long options so interactive redraw stays one terminal row", () => {
    setColumns(40);
    const out = fitOptionToLine(
      "Seedance 2.0 via fal.ai recommended default - text-to-video + image-to-video FAL_API_KEY + IMGBB_API_KEY",
      9
    );

    expect(out).toBe("Seedance 2.0 via fal.ai rec...");
    expect(out).toMatch(/\.\.\.$/);
    expect(out.length + 9).toBeLessThan(40);
  });

  it("uses visible length when ANSI styling is present", () => {
    setColumns(34);
    const out = fitOptionToLine(
      "\x1b[1mSeedance 2.0 via fal.ai\x1b[0m \x1b[2mrecommended default\x1b[0m",
      9
    );

    expect(out).toMatch(/\.\.\.$/);
    expect(out.length + 9).toBeLessThan(34);
    expect(out).not.toContain("\x1b");
  });
});
