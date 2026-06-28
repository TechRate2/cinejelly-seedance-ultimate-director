#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = "assets/output_deliverables/business-readiness/api-response-redaction-smoke-report.json";

const { redactApiResponse, redactApiLocalPaths } = await import("../dist/api/api-response-redaction.js");
const { containsPrivateSourcePatternText } = await import("../dist/core/private-source-pattern-registry.js");

const publicApiPayload = {
  schemaVersion: "cinejelly.api-redaction-smoke.fixture.v1",
  requestId: "api_redaction_fixture",
  sourcePatternOrigins: ["HKUDS/VideoAgent", "vericontext/vibeframe", "harry0703/MoneyPrinterTurbo"],
  sourcePatternId: "hkuds_videoagent",
  sourceRepository: "jiaminchen-1031/DirectorBench",
  upstreamPaths: ["external/upstream/directorbench/README.md"],
  snapshotPath: "external/upstream/directorbench",
  outputPath: "C:\\Users\\Admin\\private\\artifact.json",
  nested: {
    publicStatus: "ready",
    message: "Use DirectorBench-style timing discipline with MoneyPrinterTurbo postproduction staging."
  },
  items: [
    {
      sourcePatternOrigins: ["calesthio/OpenMontage"],
      label: "HKUDS/ViMax reference structure"
    },
    {
      label: "safe customer-visible setting"
    }
  ]
};

const apiRedacted = redactApiResponse(publicApiPayload);
const localOnlyRedacted = redactApiLocalPaths(publicApiPayload);
const serializedApi = JSON.stringify(apiRedacted);
const checks = [
  check(
    "api_strips_private_source_fields",
    !serializedApi.includes("sourcePatternOrigins") &&
      !serializedApi.includes("sourcePatternId") &&
      !serializedApi.includes("sourceRepository") &&
      !serializedApi.includes("upstreamPaths") &&
      !serializedApi.includes("snapshotPath"),
    "Public API redaction removes private source-lineage keys."
  ),
  check(
    "api_redacts_private_source_text",
    !containsPrivateSourcePatternText(serializedApi),
    "Public API redaction removes private source-lineage text embedded in normal strings."
  ),
  check(
    "api_keeps_operational_fields",
    apiRedacted?.requestId === "api_redaction_fixture" &&
      apiRedacted?.nested?.publicStatus === "ready" &&
      apiRedacted?.items?.[1]?.label === "safe customer-visible setting",
    "Public API redaction preserves safe operational fields."
  ),
  check(
    "api_keeps_path_redaction",
    serializedApi.includes("[REDACTED_LOCAL_PATH]"),
    "Public API redaction still applies deployment-local path redaction."
  ),
  check(
    "local_path_redaction_does_not_strip_internal_lineage",
    JSON.stringify(localOnlyRedacted).includes("sourcePatternOrigins") &&
      JSON.stringify(localOnlyRedacted).includes("HKUDS/VideoAgent"),
    "Internal local-path redaction remains path-only for persisted audit stores."
  )
];

const failedChecks = checks.filter((item) => item.status === "fail");
const report = {
  schemaVersion: "cinejelly.api-response-redaction-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "pass" : "fail",
  noSpend: true,
  networkCallsMade: false,
  providerCallsMade: false,
  checkedInputs: {
    outputPath
  },
  checks,
  releaseGateSummary: {
    apiResponseRedactionPass: failedChecks.length === 0,
    canUseAsNoSpendApiPrivacyEvidence: failedChecks.length === 0,
    canReleaseToCustomerTraffic: false,
    releaseBlocker: failedChecks.length === 0
      ? "API response redaction protects source lineage; customer release still requires the full commercial evidence bundle."
      : "API response redaction failed; do not expose UI/API responses until fixed."
  },
  nextActions: failedChecks.length === 0
    ? ["Keep this smoke passing before exposing new UI/API contracts."]
    : failedChecks.map((item) => item.message)
};

writeJson(outputPath, report);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = failedChecks.length === 0 ? 0 : 1;

function check(name, condition, message) {
  return {
    name,
    status: condition ? "pass" : "fail",
    message
  };
}

function writeJson(relativePath, value) {
  const absolutePath = resolve(repoRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
