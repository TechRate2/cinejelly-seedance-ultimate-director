/**
 * Pipeline generate-action wiring tests.
 *
 * The executor calls library execute* functions directly, so it must resolve
 * provider API keys from VibeFrame config before dispatching each step.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({
  executeImageGenerate: vi.fn(),
  executeVideoGenerate: vi.fn(),
  getApiKeyFromConfig: vi.fn(),
  loadProviderDefaults: vi.fn(),
  resolveProvider: vi.fn(),
}));

vi.mock("../commands/ai-image.js", () => ({
  executeImageGenerate: mocks.executeImageGenerate,
}));

vi.mock("../commands/ai-video.js", () => ({
  executeVideoGenerate: mocks.executeVideoGenerate,
}));

vi.mock("../config/index.js", () => ({
  getApiKeyFromConfig: mocks.getApiKeyFromConfig,
}));

vi.mock("../utils/provider-resolver.js", () => ({
  loadProviderDefaults: mocks.loadProviderDefaults,
  resolveProvider: mocks.resolveProvider,
}));

import { executePipeline, loadPipeline } from "./executor.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "generate-actions-test-"));
  vi.clearAllMocks();
  mocks.getApiKeyFromConfig.mockImplementation(async (providerKey: string) => {
    const keys: Record<string, string> = {
      openai: "openai-key-from-config",
      fal: "fal-key-from-config",
    };
    return keys[providerKey];
  });
  mocks.executeImageGenerate.mockImplementation(async (options) => ({
    success: true,
    outputPath: options.output,
    provider: options.provider,
    model: options.model,
  }));
  mocks.executeVideoGenerate.mockImplementation(async (options) => ({
    success: true,
    outputPath: options.output,
    provider: options.provider,
    taskId: "task-1",
  }));
});

function writePipeline(yaml: string): string {
  const path = join(workDir, "pipeline.yaml");
  writeFileSync(path, yaml);
  return path;
}

describe("pipeline generate actions", () => {
  it("passes config API keys into explicit image and video providers", async () => {
    const manifest = await loadPipeline(writePipeline(`
name: x
steps:
  - id: image
    action: generate-image
    provider: openai
    prompt: "mountain sunrise"
    size: 1536x1024
    quality: hd
    output: image.png
  - id: video
    action: generate-video
    provider: seedance
    image: $image.output
    prompt: "slow camera drift"
    duration: 6
    ratio: "16:9"
    output: video.mp4
`));

    const result = await executePipeline(manifest, { outputDir: workDir });

    expect(result.success).toBe(true);
    expect(mocks.executeImageGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        apiKey: "openai-key-from-config",
        size: "1536x1024",
        quality: "hd",
      }),
    );
    expect(mocks.executeVideoGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "seedance",
        apiKey: "fal-key-from-config",
        image: join(workDir, "image.png"),
        duration: 6,
      }),
    );
  });

  it("uses configured provider defaults when pipeline omits provider", async () => {
    mocks.getApiKeyFromConfig.mockImplementation(async (providerKey: string) => {
      const keys: Record<string, string> = {
        openai: "openai-key-from-config",
        fal: "fal-key-from-config",
      };
      return keys[providerKey];
    });
    mocks.resolveProvider.mockImplementation((category: "image" | "video") => {
      if (category === "image") return { name: "openai", label: "OpenAI" };
      if (category === "video") return { name: "seedance", label: "Seedance" };
      return null;
    });

    const manifest = await loadPipeline(writePipeline(`
name: x
steps:
  - id: image
    action: generate-image
    prompt: "mountain sunrise"
    output: image.png
  - id: video
    action: generate-video
    image: $image.output
    prompt: "slow camera drift"
    output: video.mp4
`));

    const result = await executePipeline(manifest, { outputDir: workDir });

    expect(result.success).toBe(true);
    expect(mocks.loadProviderDefaults).toHaveBeenCalled();
    expect(mocks.executeImageGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", apiKey: "openai-key-from-config" }),
    );
    expect(mocks.executeVideoGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "seedance", apiKey: "fal-key-from-config" }),
    );
  });
});
