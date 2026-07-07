import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  dockerfilePath: "Dockerfile",
  dockerignorePath: ".dockerignore",
  composePath: "docker-compose.yml",
  caddyfilePath: "deploy/Caddyfile",
  tsconfigPath: "tsconfig.json",
  packageJsonPath: "package.json",
  envTemplatePath: ".env.production.template",
  containerDocPath: "docs/reference-implementations/deployment-container-packaging.md",
  outputPath: "assets/output_deliverables/business-readiness/deployment-package-validation-report.json"
};

const secretLikePatterns = [
  /apikey-[A-Za-z0-9]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]+/,
  /sk-[A-Za-z0-9_-]{20,}/
];
const runtimeSourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
  const flagMap = new Map([
    ["--dockerfile", "dockerfilePath"],
    ["--dockerignore", "dockerignorePath"],
    ["--compose", "composePath"],
    ["--caddyfile", "caddyfilePath"],
    ["--tsconfig", "tsconfigPath"],
    ["--package-json", "packageJsonPath"],
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
  --compose <path>          Default: ${defaults.composePath}
  --caddyfile <path>        Default: ${defaults.caddyfilePath}
  --tsconfig <path>         Default: ${defaults.tsconfigPath}
  --package-json <path>     Default: ${defaults.packageJsonPath}
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
  const compose = readText(options.composePath);
  const caddyfile = readText(options.caddyfilePath);
  const tsconfig = readJson(options.tsconfigPath);
  const packageJson = readJson(options.packageJsonPath);
  const envTemplate = readText(options.envTemplatePath);
  const containerDoc = readText(options.containerDocPath);
  const runtimeEnvNames = runtimeEnvNamesFromSourceRoot("src");
  const npmPackDryRun = inspectNpmPackDryRun("dist");

  const checks = [
    checkExists("dockerfile_exists", dockerfile, "Dockerfile is present.", "Add a root Dockerfile for repeatable deployment packaging."),
    checkExists("dockerignore_exists", dockerignore, ".dockerignore is present.", "Add .dockerignore so secrets and generated artifacts stay out of build contexts."),
    checkExists("compose_exists", compose, "docker-compose.yml is present.", "Add docker-compose.yml for a repeatable HTTPS single-host deployment path."),
    checkExists("caddyfile_exists", caddyfile, "Caddyfile is present.", "Add deploy/Caddyfile so docker compose can publish the API behind HTTPS."),
    checkExists("tsconfig_exists", tsconfig, "tsconfig.json is present.", "Keep tsconfig.json in the repo so container builds are reproducible."),
    checkExists("package_json_exists", packageJson, "package.json is present.", "Keep package.json in the repo so npm package and container builds are reproducible."),
    checkExists("env_template_exists", envTemplate, ".env.production.template is present.", "Keep a secret-free production env template in the repo."),
    checkExists("container_doc_exists", containerDoc, "Deployment container packaging docs are present.", "Document how to build, run, and validate the container path."),
    ...dockerfileChecks(dockerfile),
    ...dockerignoreChecks(dockerignore),
    ...composeChecks(compose),
    ...caddyfileChecks(caddyfile),
    ...tsconfigDeploymentChecks(tsconfig),
    ...packageJsonDeploymentChecks(packageJson),
    ...distArtifactChecks("dist"),
    ...npmPackDryRun.checks,
    ...envTemplateChecks(envTemplate, runtimeEnvNames),
    ...containerDocChecks(containerDoc),
    crossFileCheck(dockerfile, dockerignore, compose)
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
      composePath: toRepoRelative(options.composePath),
      caddyfilePath: toRepoRelative(options.caddyfilePath),
      tsconfigPath: toRepoRelative(options.tsconfigPath),
      packageJsonPath: toRepoRelative(options.packageJsonPath),
      envTemplatePath: toRepoRelative(options.envTemplatePath),
      containerDocPath: toRepoRelative(options.containerDocPath),
      outputPath: toRepoRelative(options.outputPath),
      npmPackDryRunAttempted: npmPackDryRun.attempted,
      npmPackDryRunExitCode: npmPackDryRun.exitCode,
      npmPackDryRunFileCount: npmPackDryRun.fileCount,
      npmPackDryRunForbiddenFileCount: npmPackDryRun.forbiddenPaths.length
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

function readJson(path) {
  const file = readText(path);
  if (!file.exists) {
    return { exists: false, value: {} };
  }
  return {
    exists: true,
    value: JSON.parse(file.text)
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
    check("dockerfile_reference_inputs_dir", /mkdir\s+-p\b[\s\S]*\/app\/assets\/reference_inputs/i.test(text) && /chown\s+-R\s+node:node\s+\/app/i.test(text), "Runtime image creates a writable reference-input staging directory owned by node.", "Create /app/assets/reference_inputs and make it writable by the node user for real user media/reference inputs."),
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

function composeChecks(read) {
  if (!read.exists) {
    return [];
  }
  const text = normalize(read.text);
  const lower = text.toLowerCase();
  return [
    check("compose_has_api_and_caddy_services", /^\s*api:\s*$/im.test(text) && /^\s*caddy:\s*$/im.test(text), "Compose defines api and caddy services.", "Define separate api and caddy services."),
    check("compose_api_builds_local_dockerfile", /context:\s*\./i.test(text) && /dockerfile:\s*Dockerfile/i.test(text), "Compose builds the API from the root Dockerfile.", "Build the api service from the root Dockerfile."),
    check("compose_api_uses_runtime_env_file", /env_file:\s*\n\s*-\s*\.env\b/i.test(text), "Compose passes runtime secrets through ignored .env.", "Use env_file: .env for runtime secrets instead of baking secrets into the image."),
    check("compose_api_sets_production_runtime", /NODE_ENV:\s*production/i.test(text) && /PORT:\s*"?8787"?/i.test(text), "Compose sets production NODE_ENV and API port.", "Set NODE_ENV=production and PORT=8787 for the api service."),
    check("compose_api_sets_output_volume", /CINEJELLY_OUTPUT_DIR:\s*\/app\/assets\/output_deliverables/i.test(text) && /cinejelly-output:\/app\/assets\/output_deliverables/i.test(text), "Compose mounts a durable API output volume at the configured output path.", "Mount a named output volume at /app/assets/output_deliverables."),
    check("compose_api_sets_reference_input_volume", /cinejelly-reference-inputs:\/app\/assets\/reference_inputs/i.test(text) && /^\s*cinejelly-reference-inputs:\s*$/im.test(text), "Compose mounts a durable reference-input volume for user media/reference assets.", "Mount and declare a named cinejelly-reference-inputs volume at /app/assets/reference_inputs."),
    check("compose_api_trusts_caddy_proxy", /CINEJELLY_TRUST_PROXY_HEADERS:\s*"?true"?/i.test(text), "Compose enables trusted proxy headers only behind the bundled reverse proxy.", "Set CINEJELLY_TRUST_PROXY_HEADERS=true when publishing through Caddy."),
    check("compose_api_exposes_internal_port_only", /expose:\s*\n\s*-\s*"?8787"?/i.test(text) && !/["']?8787:8787["']?/i.test(text), "Compose exposes API port only to the internal compose network.", "Expose 8787 internally and publish traffic through the HTTPS reverse proxy."),
    check("compose_caddy_uses_official_image", /image:\s*caddy:2(?:\.[\w.-]+)?-alpine/i.test(text), "Compose uses the official Caddy 2 Alpine image.", "Use an official Caddy 2 image for HTTPS reverse proxying."),
    check("compose_caddy_waits_for_api_health", /depends_on:\s*\n\s*api:\s*\n\s*condition:\s*service_healthy/i.test(text), "Caddy waits for the API healthcheck before startup.", "Gate Caddy startup on the api service healthcheck."),
    check("compose_caddy_publishes_http_https", /["']?80:80["']?/i.test(text) && /["']?443:443["']?/i.test(text), "Compose publishes HTTP and HTTPS for Caddy-managed certificates.", "Publish ports 80 and 443 on the Caddy service."),
    check("compose_caddy_uses_host_env", /CINEJELLY_PUBLIC_HOST:\s*\$\{CINEJELLY_PUBLIC_HOST:\?/i.test(text), "Compose requires an explicit public host for Caddy.", "Require CINEJELLY_PUBLIC_HOST so accidental localhost/blank HTTPS deployment is blocked."),
    check("compose_caddy_mounts_caddyfile", /\.\/deploy\/Caddyfile:\/etc\/caddy\/Caddyfile:ro/i.test(text), "Compose mounts deploy/Caddyfile read-only.", "Mount deploy/Caddyfile into Caddy read-only."),
    check("compose_caddy_persists_cert_state", /caddy-data:\/data/i.test(text) && /caddy-config:\/config/i.test(text), "Compose persists Caddy certificate/config state.", "Persist Caddy /data and /config volumes so certificates survive restarts."),
    check("compose_no_secret_literals", !secretLikePatterns.some((pattern) => pattern.test(text)) && !/ATLASCLOUD_(?:LLM_)?API_KEY\s*:\s*\S+/i.test(text) && !/CINEJELLY_API_AUTH_TOKEN\s*:\s*\S+/i.test(text), "Compose file does not contain real secret-like values.", "Remove raw provider keys, bearer tokens, or deployment auth tokens from docker-compose.yml.")
  ];
}

function caddyfileChecks(read) {
  if (!read.exists) {
    return [];
  }
  const text = normalize(read.text);
  return [
    check("caddyfile_uses_public_host_env", /\{\$CINEJELLY_PUBLIC_HOST\}/.test(text), "Caddyfile binds to the operator-provided public host.", "Use {$CINEJELLY_PUBLIC_HOST} as the site address."),
    check("caddyfile_reverse_proxies_api", /reverse_proxy\s+api:8787/i.test(text), "Caddyfile reverse proxies to the internal API service.", "Reverse proxy traffic to api:8787."),
    check("caddyfile_enables_compression", /\bencode\b[\s\S]*\bgzip\b/i.test(text), "Caddyfile enables response compression.", "Enable compression for API responses."),
    check("caddyfile_sets_security_headers", /Strict-Transport-Security/i.test(text) && /X-Content-Type-Options/i.test(text) && /Referrer-Policy/i.test(text), "Caddyfile sets baseline HTTPS security headers.", "Set HSTS, nosniff, and referrer policy headers."),
    check("caddyfile_no_plain_http_site", !/^\s*http:\/\//im.test(text), "Caddyfile does not force a plaintext public site.", "Do not publish CineJelly as an http:// site."),
    check("caddyfile_no_secret_literals", !secretLikePatterns.some((pattern) => pattern.test(text)), "Caddyfile does not contain secret-like values.", "Remove raw API keys, bearer tokens, or secret key values from the Caddyfile.")
  ];
}

function tsconfigDeploymentChecks(read) {
  if (!read.exists) {
    return [];
  }
  const compilerOptions = read.value?.compilerOptions ?? {};
  return [
    check(
      "tsconfig_no_production_source_maps",
      compilerOptions.sourceMap !== true,
      "Production TypeScript build does not emit source maps into package or container artifacts.",
      "Set compilerOptions.sourceMap=false so deploy/package artifacts do not include source maps."
    )
  ];
}

function packageJsonDeploymentChecks(read) {
  if (!read.exists) {
    return [];
  }
  const packageJson = read.value ?? {};
  const files = Array.isArray(packageJson.files) ? packageJson.files : [];
  const allowedFiles = new Set(["dist/", "README.md", ".env.production.template"]);
  const requiredFiles = ["dist/", "README.md", ".env.production.template"];
  const lifecycleScripts = ["prepack", "postpack", "prepare", "prepublishOnly"];
  const scripts = packageJson.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
  const packageEntrypoints = [
    packageJson.main,
    packageJson.types,
    packageJson.exports?.["."]?.import,
    packageJson.exports?.["."]?.types
  ].filter(Boolean);

  return [
    check(
      "package_json_runtime_files_allowlist",
      requiredFiles.every((item) => files.includes(item)) && files.every((item) => allowedFiles.has(item)),
      "package.json files allowlist keeps npm package scoped to runtime dist, README, and the env template.",
      "Keep package.json files limited to dist/, README.md, and .env.production.template; do not package src, scripts, schemas, docs, external, assets, ops, or .env."
    ),
    check(
      "package_json_runtime_entrypoints_dist_only",
      packageEntrypoints.length >= 2 && packageEntrypoints.every((entry) => typeof entry === "string" && entry.startsWith("./dist/")),
      "package.json runtime entrypoints resolve only to dist outputs.",
      "Keep main/types/exports entrypoints under ./dist so source files are not exposed as runtime entrypoints."
    ),
    check(
      "package_json_no_pack_lifecycle_scripts",
      lifecycleScripts.every((name) => !Object.prototype.hasOwnProperty.call(scripts, name)),
      "package.json has no npm pack lifecycle scripts that can mutate deploy artifacts.",
      "Avoid prepack/postpack/prepare/prepublishOnly scripts so packaging stays deterministic and audit-friendly."
    )
  ];
}

function distArtifactChecks(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return [
      check("dist_artifact_source_maps_absent_when_built", true, "dist is not present, so no built source maps are packaged.", "Remove built .map files from dist before packaging.")
    ];
  }
  const sourceMaps = listFilesByExtension(absolutePath, ".map");
  return [
    check(
      "dist_artifact_source_maps_absent_when_built",
      sourceMaps.length === 0,
      "Built dist artifact contains no source maps.",
      `Remove built source maps from dist before packaging: ${sourceMaps.map((file) => toRepoRelative(file)).slice(0, 5).join(", ")}`
    )
  ];
}

function inspectNpmPackDryRun(distPath) {
  const absoluteDistPath = resolve(repoRoot, distPath);
  if (!existsSync(absoluteDistPath)) {
    return {
      attempted: false,
      exitCode: null,
      fileCount: 0,
      forbiddenPaths: [],
      checks: [
        check(
          "npm_pack_dry_run_requires_built_dist",
          false,
          "npm package dry-run can inspect built runtime artifacts.",
          "Run npm.cmd run build before validating the concrete package file list."
        )
      ]
    };
  }

  const result = runNpmPackDryRun();
  const parsed = parseNpmPackJson(result.stdout);
  const files = parsed.ok ? packageFilePaths(parsed.value) : [];
  const forbiddenPaths = files.filter((path) => packagePathIsForbidden(path));
  const requiredPaths = ["package.json", "README.md", ".env.production.template", "dist/index.js", "dist/api/server.js"];
  const missingRequiredPaths = requiredPaths.filter((path) => !files.includes(path));
  const smokeOrTestPaths = files.filter((path) => /(^|\/)(?:test|tests|__tests__|demo|demos|sample|samples|example|examples)(?:\/|$)|(?:test|smoke|demo|sample|example)/iu.test(path));

  return {
    attempted: true,
    exitCode: result.status,
    fileCount: files.length,
    forbiddenPaths,
    checks: [
      check(
        "npm_pack_dry_run_exit_zero",
        result.status === 0 && !result.signal,
        "npm pack dry-run exits cleanly without creating a package tarball.",
        `npm pack dry-run failed with exit=${String(result.status)} signal=${String(result.signal)} stderr=${truncateForMessage(result.stderr)}.`
      ),
      check(
        "npm_pack_dry_run_json_parseable",
        parsed.ok && files.length > 0,
        "npm pack dry-run returns a parseable package file list.",
        `npm pack dry-run output was not parseable JSON: ${parsed.error ?? "empty file list"}.`
      ),
      check(
        "npm_pack_dry_run_runtime_files_only",
        parsed.ok && missingRequiredPaths.length === 0 && forbiddenPaths.length === 0,
        "npm pack dry-run includes built runtime artifacts and excludes source, docs, snapshots, scripts, schemas, secrets, ops, and generated assets.",
        `Fix npm package contents. Missing required: ${missingRequiredPaths.join(", ") || "none"}. Forbidden: ${forbiddenPaths.slice(0, 10).join(", ") || "none"}.`
      ),
      check(
        "npm_pack_dry_run_no_test_smoke_demo_files",
        parsed.ok && smokeOrTestPaths.length === 0,
        "npm pack dry-run contains no test, smoke, demo, sample, or example files.",
        `Remove validation/demo/test artifacts from runtime package: ${smokeOrTestPaths.slice(0, 10).join(", ") || "none"}.`
      )
    ]
  };
}

function runNpmPackDryRun() {
  const isWindows = process.platform === "win32";
  const command = isWindows ? "cmd.exe" : "npm";
  const args = isWindows
    ? ["/d", "/s", "/c", "npm.cmd pack --dry-run --json --silent"]
    : ["pack", "--dry-run", "--json", "--silent"];
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  return {
    status: typeof result.status === "number" ? result.status : 1,
    signal: result.signal ?? null,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : result.error ? result.error.message : ""
  };
}

function parseNpmPackJson(text) {
  try {
    const value = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function packageFilePaths(value) {
  if (!Array.isArray(value) || !value[0] || !Array.isArray(value[0].files)) {
    return [];
  }
  return value[0].files
    .map((entry) => entry?.path)
    .filter((path) => typeof path === "string")
    .sort((a, b) => a.localeCompare(b));
}

function packagePathIsForbidden(path) {
  const normalized = path.replace(/\\/g, "/");
  if (normalized === ".env" || normalized.startsWith(".env.")) {
    return normalized !== ".env.production.template";
  }
  return /^(?:src|scripts|schemas|docs|external|assets|ops|deploy)\//u.test(normalized) ||
    /^(?:Dockerfile|docker-compose\.yml|\.dockerignore|\.gitignore|\.gitleaks\.toml)$/u.test(normalized) ||
    /\.map$/iu.test(normalized);
}

function truncateForMessage(text) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "none";
  }
  return normalized.length > 280 ? `${normalized.slice(0, 280)}...` : normalized;
}

function envTemplateChecks(read, runtimeEnvNames) {
  if (!read.exists) {
    return [];
  }
  const text = read.text;
  const requiredPlaceholders = [
    "ATLASCLOUD_API_KEY",
    "ATLASCLOUD_LLM_API_KEY",
    "CINEJELLY_API_AUTH_TOKEN",
    "CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH",
    "CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH",
    "CINEJELLY_PUBLIC_HOST"
  ];
  const missingRuntimeEnvNames = runtimeEnvNames.filter((name) => !hasEnvKey(text, name));
  return [
    check("env_template_required_runtime_keys", requiredPlaceholders.every((name) => hasEnvPlaceholder(text, name)), ".env template includes required Atlas/API auth, Short Studio storage, and public-host placeholders.", "Keep Atlas media, Atlas LLM, CineJelly API auth, Short Studio storage, and Caddy public-host placeholders in the template."),
    check("env_template_covers_runtime_source_keys", missingRuntimeEnvNames.length === 0, ".env template documents every environment key read by src runtime code.", `Document runtime environment keys missing from .env template: ${missingRuntimeEnvNames.join(", ") || "none"}.`),
    check("env_template_budget_default", /CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD=5\b/.test(text), ".env template keeps the live validation budget default at 5 USD.", "Default live validation budget should stay conservative until explicitly raised."),
    check("env_template_real_mode_safety_defaults", realModeSafetyDefaultsPass(text), ".env template keeps auth/rate-limit enabled and live-fetch/remote-stock gates disabled by default.", "Do not actively set auth/rate-limit disable flags or live-fetch/remote-stock flags to true in the production env template."),
    check("env_template_container_storage_note", /container/i.test(text) && /CINEJELLY_OUTPUT_DIR/i.test(text) && /durable storage/i.test(text), ".env template explains container output storage.", "Document container CINEJELLY_OUTPUT_DIR and durable-storage expectations."),
    check("env_template_compose_https_note", /docker-compose\.yml/i.test(text) && /CINEJELLY_PUBLIC_HOST/i.test(text), ".env template documents the compose/Caddy public host.", "Document CINEJELLY_PUBLIC_HOST for docker compose HTTPS deployments."),
    check("env_template_no_real_secrets", !secretLikePatterns.some((pattern) => pattern.test(text)), ".env template does not contain real secret-like values.", "Remove real API keys, bearer tokens, or secret key values from the template.")
  ];
}

function hasEnvPlaceholder(text, name) {
  return text.split(/\r?\n/).some((line) => line.trimStart().startsWith(`${name}${"="}`));
}

function realModeSafetyDefaultsPass(text) {
  return [
    "CINEJELLY_DISABLE_API_AUTH",
    "CINEJELLY_DISABLE_API_RATE_LIMIT",
    "CINEJELLY_ENABLE_SOURCE_VIDEO_AUTO_ANALYSIS",
    "CINEJELLY_ENABLE_REMOTE_STOCK_MATERIALS",
    "CINEJELLY_COVERR_COMMERCIAL_USE_APPROVED"
  ].every((name) => activeEnvValue(text, name) !== "true");
}

function activeEnvValue(text, name) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.startsWith(`${name}=`)) {
      continue;
    }
    return trimmed.slice(name.length + 1).split("#")[0].trim().toLowerCase();
  }
  return undefined;
}

function hasEnvKey(text, name) {
  return text
    .split(/\r?\n/)
    .some((line) => line.trimStart().startsWith(`${name}=`) || line.trimStart().startsWith(`# ${name}=`));
}

function runtimeEnvNamesFromSourceRoot(root) {
  const sourceRoot = resolve(repoRoot, root);
  if (!existsSync(sourceRoot)) {
    return [];
  }
  const names = new Set();
  for (const file of listSourceFiles(sourceRoot)) {
    const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/gu)) {
      names.add(match[1]);
    }
    for (const match of text.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/gu)) {
      names.add(match[1]);
    }
    for (const match of text.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/gu)) {
      names.add(match[1]);
    }
    for (const match of text.matchAll(/\benv\[['"]([A-Z][A-Z0-9_]*)['"]\]/gu)) {
      names.add(match[1]);
    }
    for (const match of text.matchAll(/(?:requireEnv|optional(?:Integer|Number|NumberEnvWithFallback|Path|String|Boolean)Env|aliasedHttpsUrlEnv|optionalHttpsUrlEnv|readPositiveInteger|positiveIntegerEnv|readBooleanFlag)\(([^)]*)\)/gu)) {
      for (const quoted of match[1].matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/gu)) {
        names.add(quoted[1]);
      }
    }
  }
  return [...names].sort();
}

function listSourceFiles(root) {
  const stat = statSync(root);
  if (stat.isFile()) {
    return runtimeSourceExtensions.has(extname(root).toLowerCase()) ? [root] : [];
  }
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(child));
    } else if (entry.isFile() && runtimeSourceExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(child);
    }
  }
  return files;
}

function listFilesByExtension(root, extension) {
  const stat = statSync(root);
  if (stat.isFile()) {
    return extname(root).toLowerCase() === extension ? [root] : [];
  }
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesByExtension(child, extension));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === extension) {
      files.push(child);
    }
  }
  return files;
}

function containerDocChecks(read) {
  if (!read.exists) {
    return [];
  }
  const text = read.text;
  return [
    check("container_doc_build_run_commands", /docker build/i.test(text) && /docker run/i.test(text), "Container docs include build and run commands.", "Document docker build and docker run commands."),
    check("container_doc_compose_https_commands", /docker compose up/i.test(text) && /CINEJELLY_PUBLIC_HOST/i.test(text) && /Caddyfile/i.test(text), "Container docs include docker compose HTTPS commands.", "Document docker compose, CINEJELLY_PUBLIC_HOST, and the Caddyfile path."),
    check("container_doc_secret_boundary", /\.env/i.test(text) && /secret/i.test(text) && /not bake|must not bake|does not copy/i.test(text), "Container docs explain the secret boundary.", "Document that .env and platform secrets must not be baked into images."),
    check("container_doc_deployment_capture", /validation:deployment-readiness/i.test(text) && /https/i.test(text), "Container docs point to real HTTPS deployment-readiness capture.", "Document the no-spend deployment readiness capture after publishing behind HTTPS."),
    check("container_doc_no_customer_release_claim", /does not replace real HTTPS deployment/i.test(text) || /commercial readiness still requires/i.test(text), "Container docs do not claim packaging replaces commercial evidence.", "Make clear packaging is not customer-traffic approval.")
  ];
}

function crossFileCheck(dockerfile, dockerignore, compose) {
  if (!dockerfile.exists || !dockerignore.exists || !compose.exists) {
    return check("deployment_package_cross_file_secret_boundary", false, "Dockerfile and .dockerignore secret boundary can be checked.", "Dockerfile and .dockerignore must both exist to verify the secret boundary.");
  }
  const dockerfileCopiesDot = /^\s*(copy|add)\s+\.\s+/im.test(dockerfile.text);
  const dockerignoreBlocksSecrets = [".env", ".env.*", "ops/*.json", "assets/output_deliverables/*"].every((pattern) => dockerignore.text.toLowerCase().split(/\r?\n/).map((line) => line.trim()).includes(pattern));
  const composeUsesIgnoredEnv = /env_file:\s*\n\s*-\s*\.env\b/i.test(compose.text);
  return check(
    "deployment_package_cross_file_secret_boundary",
    (!dockerfileCopiesDot || dockerignoreBlocksSecrets) && composeUsesIgnoredEnv,
    "Docker context and compose runtime secret boundaries are explicit.",
    "If Dockerfile uses COPY ., .dockerignore must block env, ops, and output artifact paths, and compose must pass secrets through env_file: .env."
  );
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
