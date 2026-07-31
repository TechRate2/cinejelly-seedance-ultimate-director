#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/source-structure-audit-report.json"
};

const requiredRootFiles = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "Dockerfile",
  "docker-compose.yml",
  ".env.production.template",
  ".gitignore",
  ".dockerignore",
  ".gitleaks.toml",
  "README.md"
];

const requiredRuntimeDirs = [
  "src/api",
  "src/application",
  "src/agents",
  "src/config",
  "src/core",
  "src/prompt_compiler",
  "src/providers",
  "src/types",
  "src/utils"
];

const requiredDeployFiles = [
  "Dockerfile",
  "docker-compose.yml",
  "deploy/Caddyfile",
  ".env.production.template",
  ".dockerignore"
];

const requiredConfigSecrets = [
  "ATLASCLOUD_API_KEY",
  "ATLASCLOUD_LLM_API_KEY",
  "CINEJELLY_API_AUTH_TOKEN"
];

const requiredConfigNonSecrets = [
  "ATLASCLOUD_BASE_URL",
  "ATLASCLOUD_LLM_BASE_URL",
  "ATLASCLOUD_SEEDANCE_CAPABILITIES_JSON",
  "CINEJELLY_LIVE_VALIDATION_MAX_BUDGET_USD",
  "CINEJELLY_SHORT_PIPELINE_SESSION_STORE_PATH",
  "CINEJELLY_SHORT_CHANNEL_STYLE_LIBRARY_PATH",
  "CINEJELLY_PUBLIC_HOST"
];

const packageFilesAllowlist = [
  "dist/",
  "README.md",
  ".env.production.template"
];

const packageForbiddenFiles = [
  "src/",
  "scripts/",
  "docs/",
  "external/",
  "assets/",
  ".env",
  "ops/"
];

const handoffDocFiles = [
  "README.md",
  "docs/DEVELOPER_OPERATOR_HANDOFF.vi.md",
  "docs/SOURCE_STRUCTURE_AND_DEPLOY_SECURITY.vi.md",
  "docs/PROJECT_CONTEXT.md"
];

const forbiddenHandoffDocFragments = [
  "src/config/provider-config.ts"
];

const requiredHandoffDocFragments = [
  "src/providers/provider-registry.ts",
  "src/providers/contracts.ts",
  "src/config/runtime-config.ts",
  "src/config/seedance-capabilities.ts",
  "src/config/seedance-settings.ts"
];

const requiredPackageScripts = [
  "build",
  "start",
  "preflight",
  "validation:backend-system-suite",
  "validation:deployment-package",
  "validation:source-structure",
  "validation:snapshot-parity",
  "validation:report-contracts"
];

const publicExportInternalAllowlist = new Set([
  "src/core/private-source-pattern-registry.ts",
  "src/providers/atlascloud/atlas-cloud-http.ts",
  "src/providers/atlascloud/atlas-cloud-mappers.ts"
]);

const runtimeEnvReadBoundaryAllowlist = new Set([
  "src/api/api-auth.ts",
  "src/api/api-client-policy.ts",
  "src/api/api-rate-limit.ts",
  "src/api/production-graph-resume-queue-service.ts",
  "src/api/render-job-history-store.ts",
  "src/api/render-job-manager.ts",
  "src/api/render-provider-handoff-lease-service.ts",
  "src/api/render-request-admission.ts",
  "src/api/server.ts",
  "src/api/short-channel-style-library-store.ts",
  "src/api/short-pipeline-session-store.ts",
  "src/api/user-account-store.ts",
  "src/api/account-persistence.ts",
  "src/api/admin-settings-store.ts",
  "src/api/workspace-billing-policy.ts",
  "src/application/director-factory.ts",
  "src/application/paid-render-validation-entrypoint.ts",
  "src/application/preflight-entrypoint.ts",
  "src/application/render-request-normalizer.ts",
  "src/application/render-request-validation-entrypoint.ts",
  "src/application/render-settings-descriptor.ts",
  "src/application/runtime-preflight.ts",
  "src/application/validation-readiness-entrypoint.ts",
  "src/config/product-identity.ts",
  "src/config/runtime-config.ts",
  "src/utils/media-tools.ts"
]);

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".mts", ".cjs", ".cts"]);
const secretLikePatterns = [
  /apikey-[A-Za-z0-9]{20,}/u,
  /Bearer\s+[A-Za-z0-9._-]+/u,
  /sk-[A-Za-z0-9_-]{20,}/u,
  /^ATLASCLOUD_(?:LLM_)?API_KEY[ \t]*=[ \t]*[^\s#][^\r\n]*/imu,
  /^CINEJELLY_API_AUTH_TOKEN[ \t]*=[ \t]*[^\s#][^\r\n]*/imu
];
const runtimeTodoMarkerPattern = /\b(?:TODO|FIXME|HACK|XXX)\b/u;
const runtimeEnvReadPattern =
  /\bprocess\.env\b|\benv\.(?:[A-Z][A-Z0-9_]*)\b|\benv\[['"][A-Z][A-Z0-9_]*['"]\]|\b(?:requireEnv|optional(?:Integer|Number|NumberEnvWithFallback|Path|String|Boolean)Env|aliasedHttpsUrlEnv|optionalHttpsUrlEnv|readPositiveInteger|positiveIntegerEnv|readBooleanFlag)\(/u;
const hygienePattern =
  /(^|\/)(test|tests|__tests__|__pycache__|mock|mocks|fixture|fixtures|sample|samples|demo|demos|example|examples)(\/|\.|$)|(^|\/).+\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py)$|mock|fixture|stub|dummy|fake|\.(mp4|mov|mkv|avi|webm|mp3|wav|flac|aac|jpg|jpeg|png|gif|webp|ipynb|npy|npz|gz|zip|tar|tgz|ttc|ttf|otf|woff|woff2|bin|onnx|pt|pth|ckpt|safetensors|csv|jsonl|tiktoken|pyc|tsbuildinfo|ds_store|sample|example|snap)$/iu;

function parseArgs(args) {
  const options = {
    ...defaults,
    writeReport: true
  };
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
    if (arg === "--output") {
      options.outputPath = readRequiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.outputPath = arg.slice("--output=".length);
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
  console.log(`Audit CineJelly source, config, deploy, and package structure without network or provider calls.

Usage:
  npm.cmd run validation:source-structure

Options:
  --output <path>  JSON report path. Default: ${defaults.outputPath}
  --no-output      Print only; do not write the report.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  validateOptions(options);

  const packageJson = readJson("package.json");
  const tsconfig = readJson("tsconfig.json");
  const gitignore = readText(".gitignore");
  const dockerignore = readText(".dockerignore");
  const dockerfile = readText("Dockerfile");
  const compose = readText("docker-compose.yml");
  const caddyfile = readText("deploy/Caddyfile");
  const envTemplate = readText(".env.production.template");
  const indexText = readText("src/index.ts");
  const handoffDocs = handoffDocFiles.map((path) => ({ path, ...readText(path) }));
  const sourceFiles = listSourceFiles(resolve(repoRoot, "src")).map(toRepoRelative).sort();
  const runtimeEnvNames = runtimeEnvNamesFromSourceFiles(sourceFiles);
  const productFiles = ["src", "scripts", "schemas", "docs"]
    .flatMap((root) => listAllFiles(resolve(repoRoot, root)).map(toRepoRelative))
    .sort();
  const directExternalImports = findDirectExternalImports(["src", "scripts"]);
  const productHygieneFindings = productFiles.filter((path) => hygienePattern.test(path));
  const runtimeTodoMarkerFindings = findRuntimeTodoMarkers(sourceFiles);
  const runtimeEnvBoundaryFindings = findRuntimeEnvBoundaryFindings(sourceFiles);
  const publicExportCoverage = buildPublicExportCoverage(sourceFiles, indexText.text);
  const checks = [
    ...rootChecks(),
    ...runtimeLayoutChecks(sourceFiles),
    ...packageChecks(packageJson.value),
    ...tsconfigChecks(tsconfig.value),
    ...securityBoundaryChecks({ gitignore, dockerignore, envTemplate, runtimeEnvNames }),
    ...apiResponseSecurityChecks(),
    ...staticUiShellChecks(),
    ...deployChecks({ dockerfile, compose, caddyfile }),
    ...handoffDocChecks(handoffDocs),
    ...sourceBoundaryChecks({
      directExternalImports,
      productHygieneFindings,
      runtimeTodoMarkerFindings,
      runtimeEnvBoundaryFindings,
      publicExportCoverage
    })
  ];
  const failedChecks = checks.filter((item) => item.status === "fail");
  const report = {
    schemaVersion: "cinejelly.source-structure-audit.v1",
    generatedAt: new Date().toISOString(),
    status: failedChecks.length === 0 ? "pass" : "fail",
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      sourceFileCount: sourceFiles.length,
      productFileCount: productFiles.length,
      requiredRootFileCount: requiredRootFiles.length,
      requiredRuntimeDirCount: requiredRuntimeDirs.length,
      requiredDeployFileCount: requiredDeployFiles.length,
      runtimeEnvNameCount: runtimeEnvNames.length
    },
    summary: {
      passedChecks: checks.filter((item) => item.status === "pass").length,
      failedChecks: failedChecks.length,
      missingRootFileCount: requiredRootFiles.filter((path) => !exists(path)).length,
      missingRuntimeDirCount: requiredRuntimeDirs.filter((path) => !isDirectory(path)).length,
      missingDeployFileCount: requiredDeployFiles.filter((path) => !exists(path)).length,
      directExternalImportFindingCount: directExternalImports.length,
      productHygieneFindingCount: productHygieneFindings.length,
      runtimeTodoMarkerFindingCount: runtimeTodoMarkerFindings.length,
      runtimeEnvBoundaryFindingCount: runtimeEnvBoundaryFindings.length,
      publicExportMissingCount: publicExportCoverage.missingPublicExports.length,
      packageForbiddenFileEntryCount: packageForbiddenEntries(packageJson.value).length,
      missingRuntimeEnvTemplateKeyCount: runtimeEnvNames.filter((name) => !envHasKey(envTemplate.text, name)).length
    },
    sourceMap: {
      runtimeRoots: requiredRuntimeDirs,
      deployFiles: requiredDeployFiles,
      configFiles: [".env.production.template", ".env"],
      generatedOrSecretPaths: ["assets/reference_inputs/*", "assets/output_deliverables/*", "ops/*.json", ".env"],
      internalOnlyModules: [...publicExportInternalAllowlist].sort()
    },
    findings: {
      directExternalImports,
      productHygieneFindings: productHygieneFindings.slice(0, 80),
      runtimeTodoMarkerFindings: runtimeTodoMarkerFindings.slice(0, 80),
      runtimeEnvBoundaryFindings: runtimeEnvBoundaryFindings.slice(0, 80),
      missingPublicExports: publicExportCoverage.missingPublicExports,
      packageForbiddenFileEntries: packageForbiddenEntries(packageJson.value),
      missingRuntimeEnvTemplateKeys: runtimeEnvNames.filter((name) => !envHasKey(envTemplate.text, name))
    },
    checks,
    releaseGateSummary: {
      sourceStructurePass: failedChecks.length === 0,
      canUseAsNoSpendSourceStructureEvidence: failedChecks.length === 0,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: failedChecks.length === 0
        ? "Source structure, config boundary, deploy boundary, and package boundary pass local audit; live deployment and paid/provider/operator evidence remain separate gates."
        : "Source structure audit failed; fix listed source/config/deploy/package findings before using this source for UI MVP or deployment handoff."
    },
    nextActions: failedChecks.length === 0
      ? [
          "Keep validation:source-structure passing before UI MVP, provider integrations, deploy changes, or source snapshot refreshes.",
          "Edit real secrets only in ignored .env or deployment secret stores; never commit .env or ops/*.json."
        ]
      : failedChecks.map((item) => `${item.name}: ${item.message}`)
  };

  if (options.writeReport) {
    writeReport(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function validateOptions(options) {
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }
}

function rootChecks() {
  return [
    ...requiredRootFiles.map((path) => check(
      `root_file_${slug(path)}`,
      exists(path),
      `${path} is present.`,
      `${path} is missing from the root source structure.`
    )),
    ...requiredDeployFiles.map((path) => check(
      `deploy_file_${slug(path)}`,
      exists(path),
      `${path} is present for deploy/config handoff.`,
      `${path} is missing; deploy/config handoff would be incomplete.`
    ))
  ];
}

function runtimeLayoutChecks(sourceFiles) {
  return [
    ...requiredRuntimeDirs.map((path) => check(
      `runtime_dir_${slug(path)}`,
      isDirectory(path),
      `${path} runtime directory is present.`,
      `${path} runtime directory is missing.`
    )),
    check(
      "src_index_public_export_surface_present",
      exists("src/index.ts") && sourceFiles.includes("src/index.ts"),
      "src/index.ts is the stable public integration surface.",
      "src/index.ts is missing, so integrations would need fragile internal imports."
    )
  ];
}

function packageChecks(packageJson) {
  const files = Array.isArray(packageJson.files) ? packageJson.files : [];
  return [
    check("package_esm_dist_entrypoints", packageJson.type === "module" && packageJson.main === "./dist/index.js" && packageJson.types === "./dist/index.d.ts", "Package entrypoints point to built dist runtime.", "Package must expose built dist runtime through main/types."),
    check("package_exports_single_stable_surface", Boolean(packageJson.exports?.["."]?.import === "./dist/index.js" && packageJson.exports?.["."]?.types === "./dist/index.d.ts"), "Package exports one stable dist/index.js surface.", "Package exports should route consumers through dist/index.js only."),
    check("package_files_allow_runtime_artifacts_only", packageFilesAllowlist.every((entry) => files.includes(entry)), "Package files whitelist includes only runtime dist, README, and env template.", "Package files whitelist must include dist/, README.md, and .env.production.template."),
    check("package_files_exclude_source_noise", packageForbiddenEntries(packageJson).length === 0, "Package files whitelist excludes source snapshots, scripts, docs, raw assets, secrets, and ops inputs.", "Package files whitelist must not include src, scripts, docs, external, assets, .env, or ops."),
    check("package_required_scripts_present", requiredPackageScripts.every((name) => typeof packageJson.scripts?.[name] === "string"), "Package exposes required build/start/validation scripts.", "Package scripts are missing one or more required source/deploy validation commands."),
    check("package_script_file_targets_exist", packageScriptTargetFindings(packageJson).length === 0, "Package scripts reference existing source script files and dist entrypoint source equivalents.", `Package scripts reference missing files: ${packageScriptTargetFindings(packageJson).map((item) => `${item.scriptName}->${item.path}`).join(", ") || "none"}.`)
  ];
}

function tsconfigChecks(tsconfig) {
  return [
    check("tsconfig_builds_src_only", Array.isArray(tsconfig.include) && tsconfig.include.includes("src/**/*.ts"), "TypeScript build includes src/**/*.ts only.", "TypeScript include should keep runtime compilation scoped to src/**/*.ts."),
    check("tsconfig_root_out_dir", tsconfig.compilerOptions?.rootDir === "src" && tsconfig.compilerOptions?.outDir === "dist", "TypeScript rootDir/outDir isolate source from build output.", "TypeScript rootDir should be src and outDir should be dist."),
    check("tsconfig_strict_runtime", tsconfig.compilerOptions?.strict === true && tsconfig.compilerOptions?.noUncheckedIndexedAccess === true && tsconfig.compilerOptions?.exactOptionalPropertyTypes === true, "Strict TypeScript flags are enabled for backend logic.", "Strict TypeScript flags should remain enabled for backend logic."),
    check("tsconfig_no_production_source_maps", tsconfig.compilerOptions?.sourceMap !== true, "Production TypeScript build does not emit source maps into package or container artifacts.", "Set compilerOptions.sourceMap=false so deploy/package artifacts do not include source maps.")
  ];
}

function securityBoundaryChecks({ gitignore, dockerignore, envTemplate, runtimeEnvNames }) {
  const gitPatterns = ignorePatterns(gitignore.text);
  const dockerPatterns = ignorePatterns(dockerignore.text);
  return [
    check("gitignore_blocks_local_secrets", [".env", ".env.*", "ops/*.json", "credentials*.json", "token*.json", "secrets*.json"].every((item) => gitPatterns.has(item)), ".gitignore blocks local env, ops, and credential files.", ".gitignore must block .env, ops/*.json, and common credential files."),
    check("gitignore_blocks_generated_media", ["assets/reference_inputs/*", "assets/output_deliverables/*", "*.mp4", "*.mp3", "*.wav"].every((item) => gitPatterns.has(item)), ".gitignore blocks generated media and customer artifacts.", ".gitignore must block generated media and customer artifacts."),
    check("dockerignore_blocks_secret_and_source_review_noise", [".env", ".env.*", "ops/*.json", "assets/reference_inputs/*", "assets/output_deliverables/*", "external/", "docs/"].every((item) => dockerPatterns.has(item)), ".dockerignore blocks secrets, operator evidence, outputs, docs, and upstream snapshots from runtime image context.", ".dockerignore must block secrets, operator evidence, outputs, docs, and external snapshots."),
    check("env_template_has_required_keys", [...requiredConfigSecrets, ...requiredConfigNonSecrets].every((name) => envHasKey(envTemplate.text, name)), ".env.production.template includes required provider/deploy keys.", ".env.production.template is missing required provider/deploy keys."),
    check("env_template_covers_runtime_source_keys", runtimeEnvNames.every((name) => envHasKey(envTemplate.text, name)), ".env.production.template documents every environment key read by src runtime code.", ".env.production.template is missing one or more environment keys read by src runtime code."),
    check("env_template_keeps_secret_placeholders_empty", requiredConfigSecrets.every((name) => envHasEmptyValue(envTemplate.text, name)), ".env.production.template keeps secret placeholders empty.", ".env.production.template must not contain real secret values."),
    check("env_template_no_secret_literals", !secretLikePatterns.some((pattern) => pattern.test(envTemplate.text)), ".env.production.template contains no secret-like literals.", ".env.production.template contains secret-like values.")
  ];
}

function apiResponseSecurityChecks() {
  const serverText = readText("src/api/server.ts").text;
  const sendJsonBody = functionBody(serverText, "sendJson");
  const sendHtmlBody = functionBody(serverText, "sendHtml");
  const sendVideoStreamBody = functionBody(serverText, "sendVideoStream");
  const writeHeadCount = [...serverText.matchAll(/\bresponse\.writeHead\(/gu)].length;
  const baseHeaderFragments = [
    "\"Cache-Control\": \"no-store\"",
    "\"X-Content-Type-Options\": \"nosniff\"",
    "\"X-Frame-Options\": \"DENY\"",
    "\"Referrer-Policy\": \"no-referrer\"",
    "\"Permissions-Policy\": \"camera=(), microphone=(), geolocation=(), payment=()\""
  ];
  return [
    check(
      "api_response_writes_use_sender_helpers",
      writeHeadCount === 3 &&
        sendJsonBody.includes("response.writeHead(") &&
        sendHtmlBody.includes("response.writeHead(") &&
        sendVideoStreamBody.includes("response.writeHead(") &&
        sendVideoStreamBody.includes("BASE_SECURITY_HEADERS"),
      "API response.writeHead calls stay centralized in sendJson/sendHtml/sendVideoStream.",
      "Keep response.writeHead centralized in sendJson/sendHtml/sendVideoStream so security, redaction, and request-context behavior cannot drift per route."
    ),
    check(
      "api_base_security_headers_present",
      baseHeaderFragments.every((fragment) => serverText.includes(fragment)),
      "API defines no-store, nosniff, frame-deny, no-referrer, and permissions-policy base headers.",
      "Add no-store, nosniff, frame-deny, no-referrer, and permissions-policy to BASE_SECURITY_HEADERS."
    ),
    check(
      "api_json_security_headers_not_route_overridable",
      sendJsonBody.indexOf("...headers") >= 0 &&
        sendJsonBody.indexOf("...BASE_SECURITY_HEADERS") > sendJsonBody.indexOf("...headers") &&
        sendJsonBody.includes("\"Content-Type\": \"application/json; charset=utf-8\""),
      "sendJson applies route headers before base security headers, then locks JSON content-type.",
      "In sendJson, spread route headers before BASE_SECURITY_HEADERS so per-route headers cannot weaken security defaults."
    ),
    check(
      "api_html_security_headers_and_csp_present",
      sendHtmlBody.includes("...BASE_SECURITY_HEADERS") &&
        sendHtmlBody.includes("\"Content-Type\": \"text/html; charset=utf-8\"") &&
        sendHtmlBody.includes("\"Content-Security-Policy\": HTML_CONTENT_SECURITY_POLICY") &&
        serverText.includes("default-src 'none'") &&
        serverText.includes("connect-src 'self'") &&
        serverText.includes("frame-ancestors 'none'") &&
        serverText.includes("form-action 'self'"),
      "sendHtml applies base security headers plus a self-contained CSP for static UI shells.",
      "sendHtml should include BASE_SECURITY_HEADERS and an HTML CSP with default-src none, self connect, no framing, and self form action."
    )
  ];
}

function staticUiShellChecks() {
  const shortCreatePageText = readText("src/api/short-pipeline-create-page.ts").text;
  const operatorLaunchPageText = readText("src/api/operator-launch-dashboard-page.ts").text;
  const externalDecorativeMediaPattern = /--(?:asset|template|beat)-img\s*:\s*url\(\s*["']https?:\/\//iu;
  const promptPrefillPattern = /<textarea\b(?=[^>]*\bid="prompt\b)[^>]*>\s*(?!<\/textarea>)\S[\s\S]*?<\/textarea>/iu;
  const prefilledProductFieldPattern = /<input\b(?=[^>]*\bid="(?:product-title|category|claim)\b)[^>]*\bvalue=/iu;
  const hardcodedTemplateLanguagePattern = />\s*Templates\s*<|>\s*Template source intake\s*<|>\s*Template structure summary\s*<|Template loaded:|template intake|template\/video structure/iu;
  const misleadingGenerationActionPattern = /id="create-session"[^>]*>\s*Generate Video\s*<\/button>|>\s*Estimated cost\s*</iu;
  const prefilledOperatorLaunchStatePattern =
    /id="side-(?:status|evidence|traffic|contracts)"\s*>\s*(?:locked|0%|blocked|unknown)\s*<\/span>|id="metric-traffic"\s*>\s*Blocked\s*<\/div>/iu;
  return [
    check(
      "short_create_shell_no_external_decorative_media",
      !externalDecorativeMediaPattern.test(shortCreatePageText),
      "Short create shell does not load decorative placeholder media from external image hosts.",
      "Short create shell must not use external placeholder images for asset, template, or storyboard cards; use user references or local/static CSS treatments."
    ),
    check(
      "short_create_shell_no_fake_account_balance",
      !/\$21\.38|fake\s+balance|demo\s+balance/i.test(shortCreatePageText),
      "Short create shell contains no fake account balance.",
      "Short create shell must not display hardcoded fake balance or account state."
    ),
    check(
      "short_create_shell_no_auto_prefilled_brief",
      !promptPrefillPattern.test(shortCreatePageText) && !prefilledProductFieldPattern.test(shortCreatePageText),
      "Short create shell starts from real user input instead of auto-prefilled brief/product/claim values.",
      "Short create shell must not auto-prefill creative brief, product, category, or claim fields with preview data."
    ),
    check(
      "short_create_shell_no_active_template_by_default",
      !/class="template-card\s+active"/iu.test(shortCreatePageText) && /let\s+activeTemplateId\s*=\s*""/u.test(shortCreatePageText),
      "Short create shell does not select a template/pattern starter before the user chooses one.",
      "Short create shell should not have an active template by default; pattern starters must be explicit user actions."
    ),
    check(
      "short_create_shell_uses_pattern_starter_language",
      !hardcodedTemplateLanguagePattern.test(shortCreatePageText),
      "Short create shell presents reusable ideas as pattern starters and source patterns instead of hardcoded templates.",
      "Short create shell should use pattern-starter/source-pattern wording so UI does not imply fixed hardcoded templates."
    ),
    check(
      "short_create_shell_review_gated_action_language",
      // The INTENT is fixed: the first button must promise a plan and a price, never an immediate
      // render, and the page must say in so many words that nothing is charged before approval.
      // The wording is not: this rule used to demand the literal English "Build Review Plan", so it
      // went red the day the shell was translated to Vietnamese ("Xem giá & kế hoạch") even though
      // the copy was still correct — a stale assertion reporting a problem that did not exist, in a
      // check nothing routinely ran. It now accepts either language and still refuses
      // generate-now labels.
      !misleadingGenerationActionPattern.test(shortCreatePageText) &&
        /Build Review Plan|Xem giá (?:&amp;|&) kế hoạch/u.test(shortCreatePageText) &&
        /Provider render is still locked until explicit approval|chưa duyệt và chưa xác nhận thì chưa gửi render trả/u.test(shortCreatePageText),
      "Short create shell labels the first action as review-gated planning, not immediate provider generation.",
      "Short create shell must not imply that creating a session immediately spends provider credits or renders a video."
    ),
    check(
      "operator_launch_shell_no_prefilled_readiness_state",
      !prefilledOperatorLaunchStatePattern.test(operatorLaunchPageText) &&
        /id="side-status"\s*>\s*--\s*<\/span>/u.test(operatorLaunchPageText) &&
        /id="side-evidence"\s*>\s*--\s*<\/span>/u.test(operatorLaunchPageText) &&
        /id="side-traffic"\s*>\s*--\s*<\/span>/u.test(operatorLaunchPageText) &&
        /id="metric-traffic"\s*>\s*--\s*<\/div>/u.test(operatorLaunchPageText),
      "Operator launch shell waits for the authenticated backend contract before showing readiness, evidence, or customer-traffic state.",
      "Operator launch shell must not show hardcoded launch readiness, evidence percent, report status, or customer-traffic state before the admin contract loads."
    )
  ];
}

function deployChecks({ dockerfile, compose, caddyfile }) {
  const dockerfileText = normalize(dockerfile.text);
  const composeText = normalize(compose.text);
  const caddyText = normalize(caddyfile.text);
  return [
    check("dockerfile_multi_stage_dist_only_runtime", /^from\s+node:(?:2[0-9]|[3-9][0-9])[\w.-]*\s+as\s+build/im.test(dockerfileText) && /^from\s+node:(?:2[0-9]|[3-9][0-9])[\w.-]*\s+as\s+runtime/im.test(dockerfileText), "Dockerfile uses build/runtime stages.", "Dockerfile should use separate build and runtime stages."),
    check("dockerfile_avoids_copy_dot", !/^\s*(copy|add)\s+\.\s+/im.test(dockerfileText), "Dockerfile avoids COPY . and copies only explicit build inputs.", "Dockerfile must avoid COPY . so ignored secrets/snapshots cannot enter build context accidentally."),
    check("dockerfile_does_not_copy_source_review_or_secrets", !/(copy|add)\s+[^#\n]*(external|docs|scripts|\.env|ops)/iu.test(dockerfileText), "Dockerfile does not copy external/docs/scripts/env/ops into the runtime image.", "Dockerfile must not copy external, docs, scripts, .env, or ops into the runtime image."),
    check("dockerfile_runtime_media_tools", /\bapt-get\s+install\b[\s\S]*\bffmpeg\b/i.test(dockerfileText) && /\bapt-get\s+install\b[\s\S]*\bca-certificates\b/i.test(dockerfileText), "Dockerfile installs FFmpeg and CA certificates for media/provider work.", "Dockerfile should install ffmpeg and ca-certificates."),
    check("compose_uses_ignored_env_file", /env_file:\s*\n\s*-\s*\.env\b/i.test(composeText), "docker-compose passes secrets through ignored .env.", "docker-compose should use env_file: .env for runtime secrets."),
    check("compose_uses_durable_output_volumes", /cinejelly-output:\/app\/assets\/output_deliverables/i.test(composeText) && /cinejelly-reference-inputs:\/app\/assets\/reference_inputs/i.test(composeText), "docker-compose mounts durable output/reference volumes.", "docker-compose should mount durable output and reference-input volumes."),
    check("compose_caddy_https_proxy", /caddy:2(?:\.[\w.-]+)?-alpine/i.test(composeText) && /80:80/i.test(composeText) && /443:443/i.test(composeText), "docker-compose includes Caddy HTTPS proxy.", "docker-compose should include Caddy HTTPS proxy on ports 80/443."),
    check("compose_no_secret_literals", !secretLikePatterns.some((pattern) => pattern.test(composeText)), "docker-compose contains no secret-like literals.", "docker-compose contains secret-like values."),
    check("caddyfile_uses_public_host_and_security_headers", /\{\$CINEJELLY_PUBLIC_HOST\}/.test(caddyText) && /Strict-Transport-Security/i.test(caddyText) && /X-Content-Type-Options/i.test(caddyText), "Caddyfile uses public host env and security headers.", "Caddyfile should use CINEJELLY_PUBLIC_HOST and baseline security headers."),
    check("caddyfile_reverse_proxies_api", /reverse_proxy\s+api:8787/i.test(caddyText), "Caddyfile reverse proxies to api:8787.", "Caddyfile should reverse_proxy api:8787.")
  ];
}

function handoffDocChecks(handoffDocs) {
  const combinedText = handoffDocs.map((doc) => doc.text).join("\n");
  const existingRuntimeFragmentsPresent = requiredHandoffDocFragments.every((fragment) =>
    combinedText.includes(fragment) && exists(fragment)
  );
  const forbiddenFragmentsAbsent = forbiddenHandoffDocFragments.every((fragment) =>
    !combinedText.includes(fragment)
  );
  return [
    check(
      "handoff_docs_provider_paths_match_source",
      existingRuntimeFragmentsPresent && forbiddenFragmentsAbsent,
      "Handoff docs point provider/model developers to existing runtime config and provider files.",
      "Handoff docs contain stale provider/model paths or omit the current provider-registry/config files."
    )
  ];
}

function functionBody(text, functionName) {
  const marker = `function ${functionName}`;
  const start = text.indexOf(marker);
  if (start < 0) {
    return "";
  }
  const parameterStart = text.indexOf("(", start);
  if (parameterStart < 0) {
    return "";
  }
  let parameterDepth = 0;
  let searchFrom = parameterStart;
  for (let index = parameterStart; index < text.length; index += 1) {
    const character = text[index];
    if (character === "(") {
      parameterDepth += 1;
    } else if (character === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        searchFrom = index + 1;
        break;
      }
    }
  }
  const braceStart = text.indexOf("{", searchFrom);
  if (braceStart < 0) {
    return "";
  }
  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(braceStart, index + 1);
      }
    }
  }
  return text.slice(braceStart);
}

function sourceBoundaryChecks({
  directExternalImports,
  productHygieneFindings,
  runtimeTodoMarkerFindings,
  runtimeEnvBoundaryFindings,
  publicExportCoverage
}) {
  return [
    check("no_direct_external_upstream_imports", directExternalImports.length === 0, "Runtime/scripts do not import external/upstream directly.", "Runtime/scripts must translate upstream behavior into owned modules instead of importing external/upstream."),
    check("no_product_test_mock_demo_files", productHygieneFindings.length === 0, "Product source/docs/scripts/schemas contain no test/mock/demo/sample/example files.", "Remove product-owned test/mock/demo/sample/example files or move them outside product source."),
    check("runtime_source_no_todo_fixme_markers", runtimeTodoMarkerFindings.length === 0, "Runtime source contains no TODO/FIXME/HACK/XXX markers.", "Resolve or document runtime TODO/FIXME/HACK/XXX markers outside src before treating the code path as real-mode production logic."),
    check("runtime_env_reads_stay_in_boundary_modules", runtimeEnvBoundaryFindings.length === 0, "Runtime environment reads stay in API/application/config/store boundary modules.", "Move runtime environment reads out of core/agent/provider/prompt logic and into approved API/application/config/store boundary modules."),
    check("public_export_surface_complete", publicExportCoverage.missingPublicExports.length === 0, "Public export surface covers all non-internal src modules.", "src/index.ts is missing exports for non-internal source modules."),
    check("internal_modules_not_public_exported", publicExportCoverage.unexpectedInternalExports.length === 0, "Internal source-pattern and Atlas HTTP/mapper modules stay internal.", "Internal-only source-pattern or Atlas HTTP/mapper modules should not be exported publicly.")
  ];
}

function buildPublicExportCoverage(sourceFiles, indexText) {
  const missingPublicExports = [];
  const unexpectedInternalExports = [];
  for (const file of sourceFiles) {
    if (file === "src/index.ts") {
      continue;
    }
    const exportSpec = `./${file.replace(/^src\//u, "").replace(/\.ts$/u, ".js")}`;
    const exported = indexText.includes(exportSpec);
    if (publicExportInternalAllowlist.has(file)) {
      if (exported) {
        unexpectedInternalExports.push(file);
      }
      continue;
    }
    if (!exported) {
      missingPublicExports.push(file);
    }
  }
  return { missingPublicExports, unexpectedInternalExports };
}

function findDirectExternalImports(roots) {
  const files = roots.flatMap((root) => listSourceFiles(resolve(repoRoot, root)));
  const findings = [];
  const patterns = [
    /\bfrom\s+["'][^"']*external[\\/]+upstream/iu,
    /\bimport\s*\(\s*["'][^"']*external[\\/]+upstream/iu,
    /\brequire\s*\(\s*["'][^"']*external[\\/]+upstream/iu
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8").replace(/^\uFEFF/u, "");
    text.split(/\r?\n/u).forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line))) {
        findings.push({
          path: toRepoRelative(file),
          line: index + 1,
          kind: "direct_external_upstream_import"
        });
      }
    });
  }
  return findings;
}

function findRuntimeTodoMarkers(sourceFiles) {
  const findings = [];
  for (const file of sourceFiles) {
    const text = readText(file).text;
    text.split(/\r?\n/u).forEach((line, index) => {
      if (runtimeTodoMarkerPattern.test(line)) {
        findings.push({
          path: file,
          line: index + 1,
          kind: "runtime_todo_marker",
          marker: line.match(runtimeTodoMarkerPattern)?.[0] ?? "TODO"
        });
      }
    });
  }
  return findings;
}

function findRuntimeEnvBoundaryFindings(sourceFiles) {
  const findings = [];
  for (const file of sourceFiles) {
    if (runtimeEnvReadBoundaryAllowlist.has(file)) {
      continue;
    }
    const text = readText(file).text;
    text.split(/\r?\n/u).forEach((line, index) => {
      const match = line.match(runtimeEnvReadPattern);
      if (match) {
        findings.push({
          path: file,
          line: index + 1,
          kind: "runtime_env_read_outside_boundary",
          match: match[0]
        });
      }
    });
  }
  return findings;
}

function packageForbiddenEntries(packageJson) {
  const files = Array.isArray(packageJson.files) ? packageJson.files : [];
  return files.filter((entry) => packageForbiddenFiles.some((forbidden) => {
    if (forbidden.endsWith("/")) {
      return entry === forbidden || entry.startsWith(forbidden);
    }
    return entry === forbidden;
  }));
}

function packageScriptTargetFindings(packageJson) {
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
  const findings = [];
  for (const [scriptName, command] of Object.entries(scripts)) {
    const text = String(command);
    for (const match of text.matchAll(/(?:^|\s)(scripts\/[A-Za-z0-9_.\/-]+\.(?:mjs|ps1))\b/gu)) {
      const path = match[1];
      if (!exists(path)) {
        findings.push({ scriptName, path, kind: "missing_script_target" });
      }
    }
    for (const match of text.matchAll(/(?:^|\s)(dist\/[A-Za-z0-9_.\/-]+\.js)\b/gu)) {
      const path = match[1];
      const sourcePath = `src/${path.slice("dist/".length).replace(/\.js$/u, ".ts")}`;
      if (!exists(sourcePath)) {
        findings.push({ scriptName, path, sourcePath, kind: "missing_dist_source_equivalent" });
      }
    }
  }
  return findings;
}

function ignorePatterns(text) {
  return new Set(
    text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
  );
}

function envHasKey(text, name) {
  return text.split(/\r?\n/u).some((line) => line.trimStart().startsWith(`${name}=`) || line.trimStart().startsWith(`# ${name}=`));
}

function envHasEmptyValue(text, name) {
  return text.split(/\r?\n/u).some((line) => line.trim() === `${name}=`);
}

function runtimeEnvNamesFromSourceFiles(sourceFiles) {
  const names = new Set();
  for (const file of sourceFiles) {
    const text = readText(file).text;
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

function readText(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    return { exists: false, text: "" };
  }
  return {
    exists: true,
    text: readFileSync(absolutePath, "utf8").replace(/^\uFEFF/u, "")
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

function exists(path) {
  return existsSync(resolve(repoRoot, path));
}

function isDirectory(path) {
  const absolutePath = resolve(repoRoot, path);
  return existsSync(absolutePath) && statSync(absolutePath).isDirectory();
}

function listSourceFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const stat = statSync(root);
  if (stat.isFile()) {
    return sourceExtensions.has(extname(root).toLowerCase()) ? [root] : [];
  }
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
      continue;
    }
    const child = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(child));
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(child);
    }
  }
  return files;
}

function listAllFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const stat = statSync(root);
  if (stat.isFile()) {
    return [root];
  }
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
      continue;
    }
    const child = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listAllFiles(child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

function check(name, passed, passMessage, failMessage) {
  return {
    name,
    status: passed ? "pass" : "fail",
    message: passed ? passMessage : failMessage
  };
}

function normalize(value) {
  return value.replace(/\r\n/gu, "\n");
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
}

function writeReport(path, report) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  const absolutePath = resolve(repoRoot, path);
  const value = relative(repoRoot, absolutePath) || ".";
  return value.replace(/\\/gu, "/");
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        schemaVersion: "cinejelly.source-structure-audit.v1",
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
