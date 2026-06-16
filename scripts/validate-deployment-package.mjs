import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  dockerfilePath: "Dockerfile",
  dockerignorePath: ".dockerignore",
  envTemplatePath: ".env.production.template",
  containerDocPath: "docs/reference-implementations/deployment-container-packaging.md",
  outputPath: "assets/output_deliverables/business-readiness/deployment-package-validation-report.json"
};

const secretLikePatterns = [
  /apikey-[A-Za-z0-9]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]+/,
  /sk-[A-Za-z0-9_-]{20,}/
];

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  const flagMap = new Map([
    ["--dockerfile", "dockerfilePath"],
    ["--dockerignore", "dockerignorePath"],
    ["--env-template", "envTemplatePath"],
    ["--container-doc", "containerDocPath"],
    ["--output", "outputPath"]
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-output") {
      options.writeReport = false;
      continue;
    }
    const equalsIndex = arg.indexOf("=");
    const flag = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
    const key = flagMap.get(flag);
    if (key) {
      const rawValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : readRequiredValue(args, index, flag);
      options[key] = rawValue;
      index += equalsIndex >= 0 ? 0 : 1;
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

function printHelp() {
  console.log(`Validate CineJelly deployment packaging without Docker, network calls, or provider spend.

Usage:
  npm.cmd run validation:deployment-package

Options:
  --dockerfile <path>       Default: ${defaults.dockerfilePath}
  --dockerignore <path>     Default: ${defaults.dockerignorePath}
  --env-template <path>     Default: ${defaults.envTemplatePath}
  --container-doc <path>    Default: ${defaults.containerDocPath}
  --output <path>           JSON report path. Default: ${defaults.outputPath}
  --no-output               Print only; do not write the report.

This command reads only local source files. It does not call Atlas, deployment endpoints, Docker, FFmpeg, render routes, or billing providers.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const dockerfile = readText(options.dockerfilePath);
  const dockerignore = readText(options.dockerignorePath);
  const envTemplate = readText(options.envTemplatePath);
  const containerDoc = readText(options.containerDocPath);

  const checks = [
    checkExists("dockerfile_exists", dockerfile, "Dockerfile is present.", "Add a root Dockerfile for repeatable deployment packaging."),
    checkExists("dockerignore_exists", dockerignore, ".dockerignore is present.", "Add .dockerignore so secrets and generated artifacts stay out of build contexts."),
    checkExists("env_template_exists", envTemplate, ".env.production.template is present.", "Keep a secret-free production env template in the repo."),
    checkExists("container_doc_exists", containerDoc, "Deployment container packaging docs are present.", "Document how to build, run, and validate the container path."),
    ...dockerfileChecks(dockerfile),
    ...dockerignoreChecks(dockerignore),
    ...envTemplateChecks(envTemplate),
    ...containerDocChecks(containerDoc),
    crossFileCheck(dockerfile, dockerignore)
  ];
  const status = checks.some((check) => check.status === "fail") ? "fail" : "pass";
  const report = {
    schemaVersion: "cinejelly.deployment-package-validation.v1",
    generatedAt: new Date().toISOString(),
    status,
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    dockerBuildAttempted: false,
    checkedInputs: {
      dockerfilePath: toRepoRelative(options.dockerfilePath),
      dockerignorePath: toRepoRelative(options.dockerignorePath),
      envTemplatePath: toRepoRelative(options.envTemplatePath),
      containerDocPath: toRepoRelative(options.containerDocPath),
      outputPath: toRepoRelative(options.outputPath)
    },
    summary: {
      passed: checks.filter((check) => check.status === "pass").length,
      failed: checks.filter((check) => check.status === "fail").length
    },
    checks,
    releaseGateSummary: {
      deploymentPackageReady: status === "pass",
      canUseAsDeploymentReadinessEvidence: false,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: status === "pass"
        ? "Deployment package validation passed; a real HTTPS deployment capture is still required for business readiness."
        : "Deployment package validation failed; fix packaging before publishing a real HTTPS deployment."
    },
    nextActions: nextActionsFor(checks)
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
}

function readText(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false, text: "" };
  }
  return {
    exists: true,
    text: readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "")
  };
}

function checkExists(name, read, passMessage, failMessage) {
  return check(name, read.exists, passMessage, failMessage);
}

function dockerfileChecks(read) {
  if (!read.exists) {
    return [];
  }
  const text = normalize(read.text);
  const lower = text.toLowerCase();
  return [
    check("dockerfile_multi_stage_build", /^from\s+node:(?:2[0-9]|[3-9][0-9])[\w.-]*\s+as\s+build/im.test(text) && /^from\s+node:(?:2[0-9]|[3-9][0-9])[\w.-]*\s+as\s+runtime/im.test(text), "Dockerfile uses Node 20+ build and runtime stages.", "Use separate Node 20+ build and runtime stages."),
    check("dockerfile_reproducible_install", /\bnpm\s+ci\b/i.test(text), "Dockerfile installs dependencies with npm ci.", "Use npm ci so container builds use package-lock.json."),
    check("dockerfile_builds_typescript", /\bnpm\s+run\s+build\b/i.test(text), "Dockerfile builds the TypeScript runtime.", "Run npm run build in the build stage."),
    check("dockerfile_prunes_dev_dependencies", /\bnpm\s+prune\s+--omit=dev\b/i.test(text), "Dockerfile prunes dev dependencies before runtime copy.", "Prune dev dependencies before copying runtime dependencies."),
    check("dockerfile_runtime_ffmpeg", /\bapt-get\s+install\b[\s\S]*\bffmpeg\b/i.test(text), "Runtime image installs FFmpeg/FFprobe.", "Install ffmpeg in the runtime image so preflight and assembly use available media tools."),
    check("dockerfile_ca_certificates", /\bapt-get\s+install\b[\s\S]*\bca-certificates\b/i.test(text), "Runtime image installs CA certificates.", "Install ca-certificates for HTTPS Atlas/provider traffic."),
    check("dockerfile_node_env_production", /^env\s+node_env=production$/im.test(text), "Runtime sets NODE_ENV=production.", "Set NODE_ENV=production in the runtime image."),
    check("dockerfile_port", /^env\s+port=8787$/im.test(text) && /^expose\s+8787$/im.test(text), "Runtime exposes port 8787 by default.", "Set PORT=8787 and EXPOSE 8787 for the production API."),
    check("dockerfile_output_dir", /^env\s+cinejelly_output_dir=\/app\/assets\/output_deliverables$/im.test(text), "Runtime output directory defaults to a writable container path.", "Set CINEJELLY_OUTPUT_DIR to a writable container path."),
    check("dockerfile_runs_as_node", /^user\s+node$/im.test(text), "Runtime drops to the node user.", "Run the production process as the node user."),
    check("dockerfile_healthcheck", /\bhealthcheck\b/i.test(text) && /\/health/.test(text), "Dockerfile healthcheck calls /health.", "Add a healthcheck against the public /health endpoint."),
    check("dockerfile_api_entrypoint", /\bcmd\b[\s\S]*dist\/api\/server\.js/i.test(text), "Container starts dist/api/server.js.", "Start the production HTTP entrypoint dist/api/server.js."),
    check("dockerfile_no_secret_copy", !/(copy|add)\s+[^#\n]*\.env/i.test(text) && !/atlascloud_api_key|atlascloud_llm_api_key|cinejelly_api_auth_token/i.test(lower), "Dockerfile does not copy or bake known secret env values.", "Do not COPY .env files or bake Atlas/API auth variables into the image.")
  ];
}

function dockerignoreChecks(read) {
  if (!read.exists) {
    return [];
  }
  const patterns = read.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const has = (value) => patterns.some((pattern) => pattern.toLowerCase() === value.toLowerCase());
  return [
    check("dockerignore_env_files", has(".env") && has(".env.*") && has("!.env.production.template"), ".dockerignore blocks env files while allowing the template.", "Ignore .env/.env.* and explicitly allow .env.production.template."),
    check("dockerignore_secret_material", ["*.pem", "*.key", "*.p8", "*.p12", "credentials*.json", "token*.json", "secrets*.json", "ops/*.json"].every(has), ".dockerignore blocks common secret and operator-attestation files.", "Ignore private keys, credential JSON, token JSON, secret JSON, and ops/*.json."),
    check("dockerignore_generated_artifacts", ["assets/reference_inputs/*", "assets/output_deliverables/*", "*.mp4", "*.mp3", "*.wav"].every(has), ".dockerignore blocks generated/customer media artifacts.", "Ignore generated reference inputs, output deliverables, and common media outputs."),
    check("dockerignore_large_runtime_noise", ["node_modules/", "dist/", "external/"].every(has), ".dockerignore blocks dependency/build folders and upstream snapshots.", "Ignore node_modules, dist, and external snapshots from Docker contexts."),
    check("dockerignore_keeps_build_inputs", !["src/", "package.json", "package-lock.json", "tsconfig.json"].some(has), ".dockerignore keeps source and package build inputs available.", "Do not ignore src, package.json, package-lock.json, or tsconfig.json.")
  ];
}

function envTemplateChecks(read) {
  if (!read.exists) {
    return [];
  }
  const text = read.text;
  const requiredPlaceholders = ["ATLASCLOUD_API_KEY", "ATLASCLOUD_LLM_API_KEY", "CINEJELLY_API_AUTH_TOKEN"];
  return [
    check("env_template_required_runtime_keys", requiredPlaceholders.every((name) => hasEnvPlaceholder(text, name)), ".env template includes required Atlas/API auth placeholders.", "Keep Atlas media, Atlas LLM, and CineJelly API auth placeholders in the template."),
    check("env_template_budget_default", /CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD=5\b/.test(text), ".env template keeps the live validation budget default at 5 USD.", "Default live validation budget should stay conservative until explicitly raised."),
    check("env_template_container_storage_note", /container/i.test(text) && /CINEJELLY_OUTPUT_DIR/i.test(text) && /durable storage/i.test(text), ".env template explains container output storage.", "Document container CINEJELLY_OUTPUT_DIR and durable-storage expectations."),
    check("env_template_no_real_secrets", !secretLikePatterns.some((pattern) => pattern.test(text)), ".env template does not contain real secret-like values.", "Remove real API keys, bearer tokens, or secret key values from the template.")
  ];
}

function hasEnvPlaceholder(text, name) {
  return text.split(/\r?\n/).some((line) => line.trimStart().startsWith(`${name}${"="}`));
}

function containerDocChecks(read) {
  if (!read.exists) {
    return [];
  }
  const text = read.text;
  return [
    check("container_doc_build_run_commands", /docker build/i.test(text) && /docker run/i.test(text), "Container docs include build and run commands.", "Document docker build and docker run commands."),
    check("container_doc_secret_boundary", /\.env/i.test(text) && /secret/i.test(text) && /not bake|must not bake|does not copy/i.test(text), "Container docs explain the secret boundary.", "Document that .env and platform secrets must not be baked into images."),
    check("container_doc_deployment_capture", /validation:deployment-readiness/i.test(text) && /https/i.test(text), "Container docs point to real HTTPS deployment-readiness capture.", "Document the no-spend deployment readiness capture after publishing behind HTTPS."),
    check("container_doc_no_customer_release_claim", /does not replace real HTTPS deployment/i.test(text) || /commercial readiness still requires/i.test(text), "Container docs do not claim packaging replaces commercial evidence.", "Make clear packaging is not customer-traffic approval.")
  ];
}

function crossFileCheck(dockerfile, dockerignore) {
  if (!dockerfile.exists || !dockerignore.exists) {
    return check("deployment_package_cross_file_secret_boundary", false, "Dockerfile and .dockerignore secret boundary can be checked.", "Dockerfile and .dockerignore must both exist to verify the secret boundary.");
  }
  const dockerfileCopiesDot = /^\s*(copy|add)\s+\.\s+/im.test(dockerfile.text);
  const dockerignoreBlocksSecrets = [".env", ".env.*", "ops/*.json", "assets/output_deliverables/*"].every((pattern) => dockerignore.text.toLowerCase().split(/\r?\n/).map((line) => line.trim()).includes(pattern));
  return check("deployment_package_cross_file_secret_boundary", !dockerfileCopiesDot || dockerignoreBlocksSecrets, "Docker context secret boundary is explicit for broad COPY patterns.", "If Dockerfile uses COPY ., .dockerignore must block env, ops, and output artifact paths.");
}

function check(name, passed, passMessage, failMessage) {
  return {
    name,
    status: passed ? "pass" : "fail",
    message: passed ? passMessage : failMessage
  };
}

function normalize(value) {
  return value.replace(/\r\n/g, "\n");
}

function nextActionsFor(checks) {
  const failures = checks.filter((check) => check.status === "fail");
  if (failures.length === 0) {
    return [
      "Build the image in an environment with Docker available, publish it behind a real HTTPS host, then run validation:deployment-readiness.",
      "Keep secrets in local .env files or deployment secret stores; do not bake them into the image."
    ];
  }
  return failures.map((check) => `${check.name}: ${check.message}`);
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  return absolutePath.startsWith(repoRoot) ? absolutePath.slice(repoRoot.length + 1) : path;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.deployment-package-validation.v1",
        generatedAt: new Date().toISOString(),
        status: "fail",
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
