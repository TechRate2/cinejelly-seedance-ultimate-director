#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaults = {
  outputPath: "assets/output_deliverables/business-readiness/private-source-lineage-boundary-audit-report.json"
};

const publicSurfacePaths = [
  "src/application/render-settings-descriptor.ts",
  "src/api/server.ts",
  "src/api/operator-launch-dashboard-page.ts",
  "src/api/short-pipeline-create-page.ts",
  "src/core/short-mvp-ui-contract.ts",
  "src/types/short-mvp-ui.ts",
  "src/core/operator-launch-ui-contract.ts",
  "src/types/operator-launch-ui.ts",
  "src/core/long-director-ui-contract.ts",
  "src/types/long-director-ui.ts"
];

const sourceRootPaths = [
  "src/application",
  "src/api",
  "src/agents",
  "src/core",
  "src/types"
];

const lineageFieldNames = [
  "sourcePatternOrigins",
  "sourcePatternOrigin",
  "sourcePatternId",
  "sourcePatternIds",
  "sourceRepository",
  "sourceRepositories",
  "upstreamPaths",
  "upstreamPath",
  "snapshotPath"
];

const privateSourceAllowlist = new Set([
  "src/core/private-source-pattern-registry.ts",
  "src/core/source-logic-translation-records.ts",
  "src/core/short-prompt-pattern-corpus.ts",
  "src/core/short-platform-template-corpus.ts",
  "src/types/source-translation.ts"
]);

const registryTextFragments = [
  "uiExposure: \"never\"",
  "runtimePolicy",
  "promptPolicy",
  "distilled_structure_only_no_verbatim_copy",
  "no_raw_third_party_prompt_or_template_text_in_runtime_handoff"
];

const redactionFieldFragments = [
  "sourcePatternOrigins",
  "sourcePatternId",
  "sourceRepository",
  "upstreamPaths",
  "snapshotPath",
  "containsPrivateSourcePatternText"
];

const serverPipelineFragments = [
  "redactApiResponse(redactUnknown(withRequestContext(payload, requestContext)))",
  "import { redactApiResponse } from \"./api-response-redaction.js\";",
  "import { redactUnknown } from \"../utils/redaction.js\";"
];

const {
  privateSourcePatternUiForbiddenFragments,
  containsPrivateSourcePatternText
} = await import("../dist/core/private-source-pattern-registry.js");
const { buildRenderSettingsDescriptor } = await import("../dist/application/render-settings-descriptor.js");

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
  console.log(`Audit private source-pattern lineage boundary from local source only.

Usage:
  npm.cmd run validation:private-source-lineage-boundary

Options:
  --output <path>  JSON report path. Default: ${defaults.outputPath}
  --no-output      Print only; do not write the report.

This command performs no network calls, provider calls, render work, or paid validation.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  if (extname(options.outputPath).toLowerCase() !== ".json") {
    throw new Error("--output must point to a JSON file.");
  }

  const checks = [
    buildRegistryPolicyCheck(),
    buildApiEgressCheck(),
    buildApiRedactionCheck(),
    buildPublicSurfaceCheck(),
    buildPrivateSourceContainmentCheck(),
    buildRenderSettingsRuntimeCheck()
  ];
  const failedChecks = checks.filter((item) => item.status === "fail");
  const report = {
    schemaVersion: "cinejelly.private-source-lineage-boundary-audit.v1",
    generatedAt: new Date().toISOString(),
    status: failedChecks.length === 0 ? "pass" : "fail",
    noSpend: true,
    networkCallsMade: false,
    providerCallsMade: false,
    checkedInputs: {
      outputPath: toRepoRelative(options.outputPath),
      publicSurfaceCount: publicSurfacePaths.length,
      sourceRootCount: sourceRootPaths.length,
      lineageFieldCount: lineageFieldNames.length,
      forbiddenFragmentCount: privateSourcePatternUiForbiddenFragments().length
    },
    checks,
    releaseGateSummary: {
      privateSourceLineageBoundaryPass: failedChecks.length === 0,
      canUseAsNoSpendApiPrivacyEvidence: failedChecks.length === 0,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: failedChecks.length === 0
        ? "Private source-pattern lineage stays behind backend audit boundaries; commercial release still requires full paid/live/operator evidence."
        : "Private source-pattern lineage boundary failed; fix API/UI redaction and public-surface leaks before exposing customer traffic."
    },
    nextActions: failedChecks.length === 0
      ? ["Keep this boundary audit in the backend suite whenever adding new UI/API surfaces or source-pattern evidence."]
      : failedChecks.map((item) => `${item.name}: ${item.message}`)
  };

  if (options.writeReport) {
    writeJson(options.outputPath, report);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "pass" ? 0 : 1;
}

function buildRegistryPolicyCheck() {
  const path = "src/core/private-source-pattern-registry.ts";
  const text = readText(path);
  const missingFragments = registryTextFragments.filter((fragment) => !text.includes(fragment));
  return check(
    "registry_declares_internal_only_policy",
    missingFragments.length === 0,
    missingFragments.length === 0
      ? "Private source registry declares never-expose UI policy and distilled-runtime prompt policy."
      : `Missing registry policy fragment(s): ${missingFragments.join(", ")}.`,
    { path, missingFragments }
  );
}

function buildApiEgressCheck() {
  const path = "src/api/server.ts";
  const text = readText(path);
  const missingFragments = serverPipelineFragments.filter((fragment) => !text.includes(fragment));
  return check(
    "api_send_json_uses_response_redaction",
    missingFragments.length === 0,
    missingFragments.length === 0
      ? "API sendJson applies request context, unknown-value redaction, and API response redaction at the final egress point."
      : `Missing API egress redaction fragment(s): ${missingFragments.join(", ")}.`,
    { path, missingFragments }
  );
}

function buildApiRedactionCheck() {
  const path = "src/api/api-response-redaction.ts";
  const text = readText(path);
  const missingFragments = redactionFieldFragments.filter((fragment) => !text.includes(fragment));
  const fixture = {
    sourcePatternOrigins: ["HKUDS/VideoAgent"],
    sourcePatternId: "hkuds_videoagent",
    sourceRepository: "vericontext/vibeframe",
    upstreamPaths: ["external/upstream/vibeframe/README.md"],
    snapshotPath: "external/upstream/vibeframe",
    nested: {
      label: "Use DirectorBench style continuity."
    }
  };
  const redacted = text.includes("redactApiResponse") ? true : false;
  return check(
    "api_redaction_knows_private_lineage_fields",
    missingFragments.length === 0 && redacted,
    missingFragments.length === 0 && redacted
      ? "API response redaction omits private lineage fields and imports private source text detection."
      : `Missing API redaction fragment(s): ${missingFragments.join(", ") || "redactApiResponse"}.`,
    { path, missingFragments, fixtureContainsPrivateText: containsPrivateSourcePatternText(JSON.stringify(fixture)) }
  );
}

function buildPublicSurfaceCheck() {
  const leaks = [];
  const missingFiles = [];
  for (const path of publicSurfacePaths) {
    if (!existsSync(resolve(repoRoot, path))) {
      missingFiles.push(path);
      continue;
    }
    const text = readText(path);
    const privateText = containsPrivateSourcePatternText(text);
    const lineageFields = lineageFieldNames.filter((field) => text.includes(field));
    if (privateText || lineageFields.length > 0) {
      leaks.push({
        path,
        containsPrivateSourcePatternText: privateText,
        lineageFields
      });
    }
  }
  return check(
    "public_ui_api_contracts_do_not_expose_lineage",
    missingFiles.length === 0 && leaks.length === 0,
    missingFiles.length === 0 && leaks.length === 0
      ? "Public UI/API contract files contain no private source-pattern names and no lineage fields."
      : `Public surface issue(s): missing=${missingFiles.length}, leaks=${leaks.length}.`,
    { publicSurfacePaths, missingFiles, leaks }
  );
}

function buildPrivateSourceContainmentCheck() {
  const fragments = privateSourcePatternUiForbiddenFragments()
    .filter((fragment) => fragment.includes("/") || /^[A-Z][A-Za-z0-9-]+\/[A-Za-z0-9_.:-]+/.test(fragment))
    .filter((fragment) => !["Topview", "Higgsfield"].includes(fragment));
  const scannedPaths = sourceRootPaths.flatMap((root) => listSourceFiles(root));
  const hits = [];
  for (const path of scannedPaths) {
    if (privateSourceAllowlist.has(path)) {
      continue;
    }
    const text = readText(path);
    const matchedFragments = fragments.filter((fragment) => text.includes(fragment));
    if (matchedFragments.length > 0) {
      hits.push({
        path,
        fragments: matchedFragments.slice(0, 12)
      });
    }
  }
  return check(
    "exact_source_labels_stay_in_private_files",
    hits.length === 0,
    hits.length === 0
      ? "Exact public repo/source labels are constrained to private registry, translation ledger, and internal corpus files."
      : `Found exact public source labels outside private allowlist in ${hits.length} file(s).`,
    {
      scannedFileCount: scannedPaths.length,
      allowedFileCount: privateSourceAllowlist.size,
      hitCount: hits.length,
      hits: hits.slice(0, 40)
    }
  );
}

function buildRenderSettingsRuntimeCheck() {
  const descriptor = buildRenderSettingsDescriptor({});
  const serialized = JSON.stringify(descriptor);
  const lineageFields = lineageFieldNames.filter((field) => serialized.includes(field));
  const privateText = containsPrivateSourcePatternText(serialized);
  return check(
    "render_settings_runtime_descriptor_is_public_safe",
    lineageFields.length === 0 && !privateText,
    lineageFields.length === 0 && !privateText
      ? "Runtime render-settings descriptor exposes model/settings choices without source-pattern lineage."
      : "Runtime render-settings descriptor leaks source-pattern lineage.",
    {
      lineageFields,
      containsPrivateSourcePatternText: privateText
    }
  );
}

function check(name, condition, message, evidence = {}) {
  return {
    name,
    status: condition ? "pass" : "fail",
    message,
    evidence
  };
}

function listSourceFiles(rootPath) {
  const absoluteRoot = resolve(repoRoot, rootPath);
  if (!existsSync(absoluteRoot)) {
    return [];
  }
  const output = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
        output.push(toRepoRelative(absolutePath));
      }
    }
  }
  return output.sort();
}

function readText(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function writeJson(outputPath, value) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toRepoRelative(path) {
  return relative(repoRoot, resolve(repoRoot, path)).split(sep).join("/");
}

process.exitCode = main();
