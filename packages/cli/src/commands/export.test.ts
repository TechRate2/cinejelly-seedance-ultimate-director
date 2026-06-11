import { describe, expect, it } from "vitest";

import {
  applyCustomOverrides,
  validateOverrides,
  type PresetSettings,
} from "./export.js";

function makeBase(): PresetSettings {
  return {
    resolution: "1280x720",
    videoBitrate: "4M",
    audioBitrate: "192k",
    ffmpegArgs: [
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "192k",
    ],
  };
}

describe("validateOverrides", () => {
  it("accepts valid values", () => {
    expect(validateOverrides({ bitrate: "5000k", fps: 60, resolution: "1920x1080", codec: "h265" })).toBeNull();
    expect(validateOverrides({ bitrate: "8M", fps: 24 })).toBeNull();
    expect(validateOverrides({})).toBeNull();
  });

  it("rejects malformed bitrate", () => {
    expect(validateOverrides({ bitrate: "5000kbps" })).toMatch(/--bitrate/);
    expect(validateOverrides({ bitrate: "fast" })).toMatch(/--bitrate/);
  });

  it("rejects out-of-range fps", () => {
    expect(validateOverrides({ fps: 0 })).toMatch(/--fps/);
    expect(validateOverrides({ fps: -30 })).toMatch(/--fps/);
    expect(validateOverrides({ fps: 9999 })).toMatch(/--fps/);
  });

  it("rejects malformed resolution", () => {
    expect(validateOverrides({ resolution: "1920-1080" })).toMatch(/--resolution/);
    expect(validateOverrides({ resolution: "hd" })).toMatch(/--resolution/);
    expect(validateOverrides({ resolution: "1920X1080" })).toMatch(/--resolution/); // case-sensitive x
  });

  it("rejects unsupported codec", () => {
    // @ts-expect-error testing runtime validation
    expect(validateOverrides({ codec: "av1" })).toMatch(/--codec/);
  });
});

describe("applyCustomOverrides", () => {
  it("returns a copy when no overrides provided", () => {
    const base = makeBase();
    const result = applyCustomOverrides(base, {});
    expect(result).toEqual(base);
    expect(result).not.toBe(base);
    expect(result.ffmpegArgs).not.toBe(base.ffmpegArgs);
  });

  it("overrides resolution field", () => {
    const result = applyCustomOverrides(makeBase(), { resolution: "1920x1080" });
    expect(result.resolution).toBe("1920x1080");
  });

  it("substitutes codec in ffmpeg args", () => {
    const result = applyCustomOverrides(makeBase(), { codec: "h265" });
    const cvIdx = result.ffmpegArgs.indexOf("-c:v");
    expect(result.ffmpegArgs[cvIdx + 1]).toBe("libx265");
  });

  it("maps vp9 codec name to libvpx-vp9", () => {
    const result = applyCustomOverrides(makeBase(), { codec: "vp9" });
    const cvIdx = result.ffmpegArgs.indexOf("-c:v");
    expect(result.ffmpegArgs[cvIdx + 1]).toBe("libvpx-vp9");
  });

  it("replaces -crf with -b:v when bitrate is set", () => {
    const result = applyCustomOverrides(makeBase(), { bitrate: "8M" });
    expect(result.ffmpegArgs).not.toContain("-crf");
    const bvIdx = result.ffmpegArgs.indexOf("-b:v");
    expect(bvIdx).toBeGreaterThanOrEqual(0);
    expect(result.ffmpegArgs[bvIdx + 1]).toBe("8M");
    expect(result.videoBitrate).toBe("8M");
  });

  it("appends -r when fps is set", () => {
    const result = applyCustomOverrides(makeBase(), { fps: 60 });
    const rIdx = result.ffmpegArgs.indexOf("-r");
    expect(rIdx).toBeGreaterThanOrEqual(0);
    expect(result.ffmpegArgs[rIdx + 1]).toBe("60");
  });

  it("updates existing -r in place on repeat", () => {
    const base = makeBase();
    const first = applyCustomOverrides(base, { fps: 30 });
    const second = applyCustomOverrides(first, { fps: 60 });
    const occurrences = second.ffmpegArgs.filter((a) => a === "-r").length;
    expect(occurrences).toBe(1);
    const rIdx = second.ffmpegArgs.indexOf("-r");
    expect(second.ffmpegArgs[rIdx + 1]).toBe("60");
  });

  it("combines multiple overrides", () => {
    const result = applyCustomOverrides(makeBase(), {
      bitrate: "5000k",
      fps: 24,
      resolution: "3840x2160",
      codec: "h265",
    });
    expect(result.resolution).toBe("3840x2160");
    expect(result.ffmpegArgs).toContain("libx265");
    expect(result.ffmpegArgs).toContain("5000k");
    expect(result.ffmpegArgs).toContain("24");
    expect(result.ffmpegArgs).not.toContain("-crf");
  });

  it("does not mutate the input settings", () => {
    const base = makeBase();
    const snapshot = JSON.stringify(base);
    applyCustomOverrides(base, { bitrate: "8M", codec: "h265", fps: 60, resolution: "1920x1080" });
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
