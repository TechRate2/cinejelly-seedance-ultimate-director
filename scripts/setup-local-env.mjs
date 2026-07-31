import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(repoRoot, ".env");
const outputDir = "assets/output_deliverables";

const DEFAULTS = {
  ATLASCLOUD_API_KEY: "",
  ATLASCLOUD_LLM_API_KEY: "",
  ATLASCLOUD_LLM_MODEL: "qwen/qwen3-vl-30b-a3b-thinking",
  ATLASCLOUD_SEEDANCE_MINI_MODEL: "bytedance/seedance-2.0-mini/reference-to-video",
  ATLASCLOUD_SEEDANCE_STANDARD_MODEL: "bytedance/seedance-2.0/reference-to-video",
  ATLASCLOUD_SEEDANCE_FAST_MODEL: "bytedance/seedance-2.0-fast/reference-to-video",
  CINEJELLY_API_AUTH_TOKEN: () => randomBytes(32).toString("hex"),
  CINEJELLY_OUTPUT_DIR: outputDir,
  CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH: `${outputDir}/short-pipeline-sessions.json`,
  CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH: `${outputDir}/short-channel-styles.json`
};

const REQUIRED_AFTER_SETUP = [
  "ATLASCLOUD_API_KEY",
  "ATLASCLOUD_LLM_MODEL",
  "ATLASCLOUD_SEEDANCE_MINI_MODEL",
  "ATLASCLOUD_SEEDANCE_STANDARD_MODEL",
  "ATLASCLOUD_SEEDANCE_FAST_MODEL",
  "CINEJELLY_API_AUTH_TOKEN"
];

const DEFAULT_SEEDANCE_CAPABILITY_BASE = {
  provider: "atlascloud",
  modes: ["text_to_video", "image_to_video", "reference_to_video", "video_to_video", "extend", "edit"],
  durations: { min: 4, max: 15 },
  resolutions: ["480p", "720p", "1080p", "720p-SR", "1080p-SR", "1440p-SR"],
  ratios: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  references: ["image", "video", "audio", "first_frame", "last_frame", "identity", "product", "environment", "motion", "camera", "style"],
  async: true
};

const DEFAULT_SEEDANCE_MINI_RESOLUTIONS = ["480p", "720p"];

function readEnvFile() {
  if (!existsSync(envPath)) {
    return new Map();
  }
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  const values = new Map();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    values.set(key, value);
  }
  return values;
}

function mergeDefaults(values) {
  for (const [key, valueOrFactory] of Object.entries(DEFAULTS)) {
    const current = values.get(key);
    if (current && current.trim()) {
      continue;
    }
    const value = typeof valueOrFactory === "function" ? valueOrFactory() : valueOrFactory;
    values.set(key, value);
  }
}

function fillSeedanceCapabilities(values) {
  const current = values.get("ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON");
  if (current && current.trim()) {
    return "kept";
  }
  const standardModel = values.get("ATLASCLOUD_SEEDANCE_STANDARD_MODEL");
  const fastModel = values.get("ATLASCLOUD_SEEDANCE_FAST_MODEL");
  const miniModel = values.get("ATLASCLOUD_SEEDANCE_MINI_MODEL");
  const modelIds = [miniModel, standardModel, fastModel].filter((value) => value && value.trim());
  if (modelIds.length === 0) {
    return "missing_models";
  }
  values.set(
    "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON",
    JSON.stringify(modelIds.map((modelId) => ({
      ...DEFAULT_SEEDANCE_CAPABILITY_BASE,
      modelId,
      ...(isMiniSeedanceModel(modelId) ? { resolutions: DEFAULT_SEEDANCE_MINI_RESOLUTIONS } : {})
    })))
  );
  return "generated";
}

function isMiniSeedanceModel(modelId) {
  return /(^|[-_/])mini([-_/]|$)/i.test(modelId);
}

async function canExecute(path) {
  try {
    await access(path);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

async function findOnPath(command) {
  const extensions = platform() === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const folder of (process.env.PATH ?? "").split(delimiter)) {
    if (!folder) {
      continue;
    }
    for (const extension of extensions) {
      const candidate = join(folder, `${command}${extension}`);
      if (await canExecute(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

async function findWingetFfmpegBinary(binaryName) {
  if (platform() !== "win32") {
    return undefined;
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return undefined;
  }
  const packagesRoot = join(localAppData, "Microsoft", "WinGet", "Packages");
  if (!existsSync(packagesRoot)) {
    return undefined;
  }
  const stack = [packagesRoot];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = statSync(current).isDirectory()
        ? await import("node:fs").then((fs) => fs.readdirSync(current, { withFileTypes: true }))
        : [];
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === binaryName.toLowerCase() && await canExecute(fullPath)) {
        return fullPath;
      }
    }
  }
  return undefined;
}

async function fillMediaTool(values, envName, command) {
  const current = values.get(envName);
  if (current && await canExecute(current)) {
    return { envName, status: "kept", path: current };
  }
  const detected = await findOnPath(command) ?? await findWingetFfmpegBinary(`${command}.exe`);
  if (detected) {
    values.set(envName, detected);
    return { envName, status: "detected", path: detected };
  }
  return { envName, status: "missing" };
}

function renderEnv(values) {
  const orderedKeys = [
    "ATLASCLOUD_API_KEY",
    "ATLASCLOUD_LLM_API_KEY",
    "ATLASCLOUD_LLM_MODEL",
    "ATLASCLOUD_SEEDANCE_STANDARD_MODEL",
    "ATLASCLOUD_SEEDANCE_FAST_MODEL",
    "CINEJELLY_API_AUTH_TOKEN",
    "CINEJELLY_OUTPUT_DIR",
    "CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH",
    "CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH",
    "CINEJELLY_FFMPEG_PATH",
    "CINEJELLY_FFPROBE_PATH",
    "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON"
  ];
  const lines = [
    "# CineJelly local environment.",
    "# Generated by npm run setup:local. Do not commit this file.",
    ""
  ];
  for (const key of orderedKeys) {
    if (values.has(key)) {
      lines.push(`${key}=${values.get(key)}`);
    }
  }
  const extraKeys = [...values.keys()].filter((key) => !orderedKeys.includes(key)).sort();
  if (extraKeys.length) {
    lines.push("", "# Existing custom values preserved below.");
    for (const key of extraKeys) {
      lines.push(`${key}=${values.get(key)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function printSummary(values, mediaResults, capabilityStatus) {
  const missingRequired = REQUIRED_AFTER_SETUP.filter((key) => !values.get(key)?.trim());
  const runningDoctor = process.env.CINEJELLY_RUNNING_DOCTOR === "true";
  console.log("CineJelly local setup summary");
  console.log("--------------------------------");
  console.log(`.env: ${envPath}`);
  console.log(`Required values still missing: ${missingRequired.length ? missingRequired.join(", ") : "none"}`);
  console.log(`ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON: ${capabilityStatus}`);
  for (const result of mediaResults) {
    console.log(`${result.envName}: ${result.status}${result.path ? " (configured)" : ""}`);
  }
  console.log("");
  if (missingRequired.includes("ATLASCLOUD_API_KEY")) {
    console.log("Next: open .env and add your Atlas Cloud API key.");
  }
  console.log(runningDoctor ? "Next: doctor will continue with no-spend validation." : "Then run: npm run doctor");
  console.log("Before customer release, verify model IDs and capability JSON against the current Atlas catalog.");
}

/**
 * Write the env WITHOUT destroying an existing owner-annotated .env (deploy audit A3): doctor runs
 * this on every invocation, and regenerating the file stripped every Vietnamese annotation, the Neon
 * how-to, and every commented-out option — the exact file a non-coder was taught to edit. So when a
 * .env already exists, PRESERVE it byte-for-byte and only APPEND keys it does not already define
 * (detected ffmpeg/ffprobe paths, capability JSON). Only a first-time run (no .env) generates fresh.
 */
function writeEnv(values) {
  if (!existsSync(envPath)) {
    writeFileSync(envPath, renderEnv(values), { encoding: "utf8" });
    return;
  }
  const original = readFileSync(envPath, "utf8");
  const definedKeys = new Set(
    original
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.slice(0, line.indexOf("=")).trim())
  );
  const additions = [...values.keys()].filter((key) => !definedKeys.has(key) && values.get(key)?.trim());
  if (additions.length === 0) {
    return; // Nothing new — leave the owner's file completely untouched.
  }
  const appended = [
    original.replace(/\s*$/, "\n"),
    "",
    "# ---- Added by setup:local (detected values; your edits above are preserved) ----",
    ...additions.map((key) => `${key}=${values.get(key)}`),
    ""
  ].join("\n");
  writeFileSync(envPath, appended, { encoding: "utf8" });
}

const values = readEnvFile();
mergeDefaults(values);
const capabilityStatus = fillSeedanceCapabilities(values);
mkdirSync(join(repoRoot, outputDir), { recursive: true });
const mediaResults = [
  await fillMediaTool(values, "CINEJELLY_FFMPEG_PATH", "ffmpeg"),
  await fillMediaTool(values, "CINEJELLY_FFPROBE_PATH", "ffprobe")
];
writeEnv(values);
printSummary(values, mediaResults, capabilityStatus);
