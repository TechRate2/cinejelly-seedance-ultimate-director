import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputPath = resolve(repoRoot, "assets", "output_deliverables", "phase6-validation", "request.json");

const SAFE_DEFAULT_INPUT =
  "Create a 15-second premium commercial video for a fictional smart desk lamp, with calm workspace lighting, clean motion, and no customer data.";

const enumValues = {
  tier: ["fast", "standard"],
  resolution: ["480p", "720p", "1080p"],
  qualityMode: ["economy", "standard", "high", "ultimate"],
  ratio: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  audioMode: ["none", "native", "guided", "post", "hybrid"]
};

function parseArgs(args) {
  const options = {
    tier: "fast",
    resolution: "480p",
    qualityMode: "economy",
    ratio: "16:9",
    durationTargetSeconds: 15,
    audioMode: "none",
    watermark: false,
    returnLastFrame: true,
    maxCostUsd: 5,
    outputPath: defaultOutputPath
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--safe-default") {
      options.safeDefault = true;
      continue;
    }
    if (arg === "--user-input") {
      options.userInput = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--user-input=")) {
      options.userInput = arg.slice("--user-input=".length);
      continue;
    }
    if (arg === "--user-input-file") {
      options.userInputFile = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--user-input-file=")) {
      options.userInputFile = arg.slice("--user-input-file=".length);
      continue;
    }
    if (arg === "--output") {
      options.outputPath = resolve(repoRoot, readRequiredValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.outputPath = resolve(repoRoot, arg.slice("--output=".length));
      continue;
    }
    if (arg === "--tier") {
      options.tier = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--tier=")) {
      options.tier = arg.slice("--tier=".length);
      continue;
    }
    if (arg === "--resolution") {
      options.resolution = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--resolution=")) {
      options.resolution = arg.slice("--resolution=".length);
      continue;
    }
    if (arg === "--quality") {
      options.qualityMode = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--quality=")) {
      options.qualityMode = arg.slice("--quality=".length);
      continue;
    }
    if (arg === "--ratio") {
      options.ratio = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--ratio=")) {
      options.ratio = arg.slice("--ratio=".length);
      continue;
    }
    if (arg === "--duration") {
      options.durationTargetSeconds = Number(readRequiredValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith("--duration=")) {
      options.durationTargetSeconds = Number(arg.slice("--duration=".length));
      continue;
    }
    if (arg === "--audio-mode") {
      options.audioMode = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--audio-mode=")) {
      options.audioMode = arg.slice("--audio-mode=".length);
      continue;
    }
    if (arg === "--max-cost") {
      options.maxCostUsd = Number(readRequiredValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg.startsWith("--max-cost=")) {
      options.maxCostUsd = Number(arg.slice("--max-cost=".length));
      continue;
    }
    if (arg === "--watermark") {
      options.watermark = true;
      continue;
    }
    if (arg === "--no-return-last-frame") {
      options.returnLastFrame = false;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function readRequiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Expected a value after ${flag}.`);
  }
  return value;
}

function readUserInput(options) {
  if (options.userInput && options.userInputFile) {
    throw new Error("Use only one of --user-input or --user-input-file.");
  }
  if (options.userInput) {
    return options.userInput.trim();
  }
  if (options.userInputFile) {
    return readFileSync(resolve(repoRoot, options.userInputFile), "utf8").trim();
  }
  if (options.safeDefault) {
    return SAFE_DEFAULT_INPUT;
  }
  throw new Error("Provide --user-input <text>, --user-input-file <path>, or --safe-default.");
}

function validateEnum(name, value) {
  if (!enumValues[name].includes(value)) {
    throw new Error(`${name} must be one of: ${enumValues[name].join(", ")}.`);
  }
}

function validateNumber(name, value, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
}

function assertOutputInsideRepo(outputPath) {
  const relativePath = relative(repoRoot, outputPath);
  if (relativePath.startsWith("..") || relativePath === "" || relativePath.includes("..\\")) {
    throw new Error("Output request path must stay inside the repository.");
  }
}

function buildRequest(options) {
  const userInput = readUserInput(options);
  if (!userInput) {
    throw new Error("userInput cannot be empty.");
  }
  if (userInput.length > 24000) {
    throw new Error("userInput must be 24000 characters or fewer.");
  }

  validateEnum("tier", options.tier);
  validateEnum("resolution", options.resolution);
  validateEnum("qualityMode", options.qualityMode);
  validateEnum("ratio", options.ratio);
  validateEnum("audioMode", options.audioMode);
  validateNumber("duration", options.durationTargetSeconds, 15, 480);
  validateNumber("maxCost", options.maxCostUsd, 0, Number.MAX_SAFE_INTEGER);
  assertOutputInsideRepo(options.outputPath);

  return {
    userInput,
    settings: {
      tier: options.tier,
      resolution: options.resolution,
      qualityMode: options.qualityMode,
      ratio: options.ratio,
      durationTargetSeconds: options.durationTargetSeconds,
      audioMode: options.audioMode,
      watermark: options.watermark,
      returnLastFrame: options.returnLastFrame,
      maxCostUsd: options.maxCostUsd
    },
    outputPath: "phase6-validation/final.mp4",
    workDirectory: "phase6-validation/work",
    artifactDirectory: "phase6-validation/artifacts"
  };
}

function printHelp() {
  console.log(`Create a local Phase 6 render validation request.

Usage:
  npm.cmd run validation:create-request -- --safe-default
  npm.cmd run validation:create-request -- --user-input "Create a short product video..."
  npm.cmd run validation:create-request -- --user-input-file ops/request-brief.txt

Options:
  --output <path>          Request file path. Default: assets/output_deliverables/phase6-validation/request.json
  --tier <fast|standard>   Default: fast
  --resolution <value>     480p, 720p, or 1080p. Default: 480p
  --quality <value>        economy, standard, high, or ultimate. Default: economy
  --ratio <value>          Default: 16:9
  --duration <seconds>     15 to 480. Default: 15
  --audio-mode <value>     none, native, guided, post, or hybrid. Default: none
  --max-cost <usd>         Default: 5
  --watermark              Enable watermark
  --no-return-last-frame   Disable last-frame return

This command writes a request JSON only. It does not call Atlas, create providers, or write render artifacts.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const request = buildRequest(options);
  mkdirSync(dirname(options.outputPath), { recursive: true });
  writeFileSync(options.outputPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  const relativeRequestPath = relative(repoRoot, options.outputPath);
  console.log(`Wrote validation request: ${relativeRequestPath}`);
  console.log(`No provider call was made.`);
  console.log(`Next no-spend check: npm.cmd run validation:render-request -- --request "${relativeRequestPath}"`);
  console.log(`Paid validation only after approval: npm.cmd run validation:paid-render -- --request "${relativeRequestPath}"`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
