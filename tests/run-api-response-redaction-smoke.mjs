#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = "assets/output_deliverables/business-readiness/api-response-redaction-smoke-report.json";

const { redactApiResponse, redactApiLocalPaths, redactEmbeddedLocalPaths } = await import("../dist/api/api-response-redaction.js");
const { startServer } = await import("../dist/api/server.js");
const { containsPrivateSourcePatternText } = await import("../dist/core/private-source-pattern-registry.js");

const port = 24_000 + Math.floor(Math.random() * 4_000);
process.env.PORT = String(port);
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";
const baseUrl = `http://127.0.0.1:${port}`;
const server = startServer(port);
let healthResponse;

try {
  healthResponse = await waitForHealth(baseUrl);
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

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
const healthPayload = healthResponse.body;
const jsonSecurityHeadersCheckPassed = jsonSecurityHeadersPass(healthResponse.headers);
const requestIdHeaderPresent = Boolean(healthResponse.headers.get("x-cinejelly-request-id"));
const checks = [
  check(
    "http_health_json_response_available",
    // Enriched /health (launch-ops audit): reports ok ONLY when everything is green — in this
    // smoke's env there is deliberately no provider key, so "degraded" with the enriched fields
    // is the CORRECT answer. Assert the contract shape, not green-ness.
    healthResponse.statusCode === 200 &&
      (healthPayload?.status === "ok" || healthPayload?.status === "degraded") &&
      typeof healthPayload?.pendingTopups === "number" &&
      typeof healthPayload?.pendingRefunds === "number" &&
      typeof healthPayload?.failedJobsLast24h === "number" &&
      typeof healthPayload?.providerConfigured === "boolean" &&
      typeof healthPayload?.disk === "string" &&
      (healthPayload?.janitor === "on" || healthPayload?.janitor === "off"),
    "Local /health JSON response is available through the real API sender with the enriched monitoring fields."
  ),
  check(
    "http_json_security_headers_present",
    jsonSecurityHeadersCheckPassed,
    "Real JSON responses carry no-store, nosniff, frame-deny, no-referrer, permissions-policy, and JSON content-type headers."
  ),
  check(
    "http_request_id_header_present",
    requestIdHeaderPresent,
    "Real JSON responses include X-CineJelly-Request-Id for traceability without exposing secrets."
  ),
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
  ),
  check("posix_app_path_redacted", !redactEmbeddedLocalPaths("write '/app/assets/output_deliverables/clip.mp4'").includes("/app/"), "POSIX /app (Docker root) path redacted."),
  check("posix_home_quoted_redacted", !redactEmbeddedLocalPaths("EACCES open '/home/node/secret/f'").includes("/home/"), "Quote-prefixed /home path redacted."),
  check("posix_var_paren_redacted", !redactEmbeddedLocalPaths("fail (/var/data/x)").includes("/var/"), "Paren-prefixed /var path redacted."),
  check("public_url_not_redacted", redactEmbeddedLocalPaths("see https://cdn.example.com/a/b").includes("https://cdn.example.com/a/b"), "Public URL left intact for the URI redactor.")
];

const failedChecks = checks.filter((item) => item.status === "fail");
const report = {
  schemaVersion: "cinejelly.api-response-redaction-smoke.v1",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "pass" : "fail",
  noSpend: true,
  localHttpCallsMade: true,
  networkCallsMade: false,
  providerCallsMade: false,
  checkedInputs: {
    outputPath,
    endpointPaths: ["GET /health"],
    healthStatusCode: healthResponse.statusCode,
    jsonSecurityHeadersCheckPassed,
    requestIdHeaderPresent
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

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 5_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      const body = await response.json();
      if (response.ok) {
        return {
          statusCode: response.status,
          headers: response.headers,
          body
        };
      }
      lastError = new Error(`Unexpected /health status ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw lastError instanceof Error ? lastError : new Error("Local API server did not become ready for API response redaction smoke.");
}

function jsonSecurityHeadersPass(headers) {
  return String(headers.get("content-type") ?? "").toLowerCase().includes("application/json") &&
    String(headers.get("cache-control") ?? "").toLowerCase().includes("no-store") &&
    String(headers.get("x-content-type-options") ?? "").toLowerCase() === "nosniff" &&
    String(headers.get("x-frame-options") ?? "").toUpperCase() === "DENY" &&
    String(headers.get("referrer-policy") ?? "").toLowerCase() === "no-referrer" &&
    String(headers.get("permissions-policy") ?? "").includes("camera=()");
}

function writeJson(relativePath, value) {
  const absolutePath = resolve(repoRoot, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
