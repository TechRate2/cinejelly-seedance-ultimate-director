import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const maxCost = readNumberArg("--max-cost", 25);
const keep = args.includes("--keep");
const workspaceArg = readStringArg("--workspace");

if (process.env.VIBE_PAID_ACCEPTANCE !== "1") {
  throw new Error("Set VIBE_PAID_ACCEPTANCE=1 to run paid provider dogfood.");
}

const childEnv = {
  ...process.env,
  ...readDotEnv(join(repoRoot, ".env")),
  CI: "true",
  NO_COLOR: "1",
};
const requiredKeys = [
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "XAI_API_KEY",
  "FAL_API_KEY",
  "ELEVENLABS_API_KEY",
];
for (const key of requiredKeys) {
  if (!childEnv[key]) throw new Error(`Missing ${key} in environment or .env`);
}

const workspace = workspaceArg
  ? resolve(workspaceArg)
  : await mkdtemp(join(tmpdir(), "vibe-paid-dogfood-"));
const project = join(workspace, "paid-story");

try {
  await mkdir(join(workspace, "standalone"), { recursive: true });

  for (const provider of ["openai", "gemini", "grok"] as const) {
    const output = join(workspace, "standalone", `${provider}.png`);
    const providerArgs =
      provider === "openai"
        ? ["--size", "1536x1024"]
        : ["--ratio", "16:9"];
    if (!existsSync(output)) {
      runJson([
        "generate",
        "image",
        `A polished VibeFrame paid dogfood frame, provider ${provider}, cinematic terminal UI`,
        "--provider",
        provider,
        "--output",
        output,
        ...providerArgs,
        "--json",
      ]);
    }
    assert.ok(existsSync(output), `${provider} image output should exist`);
  }

  if (!existsSync(project)) {
    runJson([
      "init",
      project,
      "--from",
      "Paid provider dogfood video for VibeFrame storyboard flow.",
      "--duration",
      "4",
      "--profile",
      "agent",
      "--json",
    ]);
  }

  await writeFile(
    join(project, "DESIGN.md"),
    `# Design

Visual style: clean developer-tool product demo, dark UI, precise motion, no decorative clutter.
Typography: system sans-serif.
`,
    "utf-8"
  );
  await writeFile(
    join(project, "STORYBOARD.md"),
    `---
project: paid-story
providers:
  tts: elevenlabs
  image: gemini
  video: seedance
  music: elevenlabs
  composer: openai
voice: Rachel
---

# Paid Story

## Beat paid — Paid provider pass

\`\`\`yaml
duration: 4
narration: "VibeFrame validates, plans, builds, reviews, and renders with paid providers."
backdrop: "cinematic product demo frame showing a storyboard, build plan JSON, and render report"
video: "subtle camera push through a polished terminal UI with storyboard cards and provider status"
music: "short confident ambient technology pulse"
motion: "cards slide into a final rendered video preview"
\`\`\`

### Concept

One compact paid-provider acceptance beat.
`,
    "utf-8"
  );

  const commonBuildArgs = [
    project,
    "--mode",
    "batch",
    "--composer",
    "openai",
    "--tts",
    "elevenlabs",
    "--image-provider",
    "gemini",
    "--video-provider",
    "seedance",
    "--music-provider",
    "elevenlabs",
    "--max-cost",
    String(maxCost),
    "--json",
  ];

  const plan = dataOf<Record<string, unknown>>(runJson(["plan", ...commonBuildArgs]));
  assert.equal(plan.kind, "build-plan");
  assert.equal(plan.status, "ready");

  runJson(["build", ...commonBuildArgs, "--dry-run"]);
  const build = dataOf<Record<string, unknown>>(
    runJson(["build", ...commonBuildArgs, "--skip-render"])
  );
  assert.equal(build.success, true);
  if (build.phase === "pending-jobs") {
    await waitForProjectJobs(project);
    const completedBuild = dataOf<Record<string, unknown>>(
      runJson(["build", ...commonBuildArgs, "--skip-render"])
    );
    assert.equal(completedBuild.success, true);
  }
  const buildReport = JSON.parse(readFileSync(join(project, "build-report.json"), "utf-8")) as {
    kind?: string;
  };
  assert.equal(buildReport.kind, "build");

  const renderOut = join(project, "renders", "paid-dogfood.mp4");
  if (!existsSync(renderOut)) {
    runJson([
      "render",
      project,
      "--out",
      renderOut,
      "--quality",
      "standard",
      "--fps",
      "30",
      "--json",
    ]);
  }
  assert.ok(existsSync(renderOut), "render output should exist");

  const cheapReview = dataOf<Record<string, unknown>>(
    runJson(["inspect", "render", project, "--video", renderOut, "--cheap", "--json"])
  );
  assert.equal(cheapReview.kind, "render");
  assert.equal(cheapReview.mode, "render");

  const aiReview = dataOf<Record<string, unknown>>(
    runJson(["inspect", "render", project, "--video", renderOut, "--ai", "--json"])
  );
  assert.equal(aiReview.kind, "render");
  assert.equal(aiReview.mode, "render");

  runJson([
    "build",
    project,
    "--stage",
    "assets",
    "--beat",
    "paid",
    "--skip-narration",
    "--skip-video",
    "--skip-music",
    "--image-provider",
    "grok",
    "--force",
    "--max-cost",
    String(maxCost),
    "--json",
  ]);

  const probe = ffprobe(renderOut);
  const summary = {
    workspace,
    project,
    render: renderOut,
    ffprobe: probe,
    maxCost,
    providers: {
      standaloneImages: ["openai", "gemini", "grok"],
      buildImage: ["gemini", "grok"],
      video: "seedance",
      music: "elevenlabs",
      narration: "elevenlabs",
      aiReview: "gemini",
    },
  };
  await writeFile(
    join(workspace, "paid-dogfood-summary.json"),
    JSON.stringify(summary, null, 2) + "\n"
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (!keep) await rm(workspace, { recursive: true, force: true });
}

function readNumberArg(name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: ${args[index + 1]}`);
  }
  return value;
}

function readStringArg(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Invalid ${name}: ${value ?? ""}`);
  return value;
}

function readDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[2].startsWith("#")) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function runJson(commandArgs: string[]): unknown {
  let out: string;
  try {
    out = execFileSync("pnpm", ["-s", "vibe", ...commandArgs], {
      cwd: repoRoot,
      encoding: "utf-8",
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const failure = err as {
      status?: number;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    const stderr = failure.stderr ? String(failure.stderr) : "";
    const stdout = failure.stdout ? String(failure.stdout) : "";
    throw new Error(
      [
        `Command failed (${failure.status ?? "unknown"}): vibe ${commandArgs.join(" ")}`,
        stderr.trim(),
        stdout.trim(),
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  try {
    return JSON.parse(out);
  } catch {
    const parsed = parseLastJsonObject(out);
    if (parsed !== undefined) return parsed;
    throw new Error(
      `Command did not return JSON: vibe ${commandArgs.join(" ")}\n${out.slice(-2000)}`
    );
  }
}

function parseLastJsonObject(out: string): unknown {
  const trimmed = out.trim();
  let index = trimmed.lastIndexOf("{");
  while (index >= 0) {
    try {
      return JSON.parse(trimmed.slice(index));
    } catch {
      index = trimmed.lastIndexOf("{", index - 1);
    }
  }
  return undefined;
}

function dataOf<T>(value: unknown): T {
  if (value && typeof value === "object" && "data" in value) {
    return (value as { data: T }).data;
  }
  return value as T;
}

async function waitForProjectJobs(projectDir: string): Promise<void> {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const status = dataOf<Record<string, unknown>>(
      runJson(["status", "project", projectDir, "--refresh", "--json"])
    );
    const jobs = status.jobs as { active?: number; failed?: number } | undefined;
    if ((jobs?.failed ?? 0) > 0) throw new Error("Paid dogfood provider job failed");
    if ((jobs?.active ?? 0) === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 30_000));
  }
  throw new Error("Timed out waiting for paid provider jobs");
}

function ffprobe(path: string): unknown {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=index,codec_type,width,height,duration",
      "-show_entries",
      "format=duration,size",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf-8" }
  );
  return JSON.parse(out);
}
