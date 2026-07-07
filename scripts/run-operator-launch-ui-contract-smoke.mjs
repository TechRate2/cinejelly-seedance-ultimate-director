#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "assets/output_deliverables/business-readiness/operator-launch-ui-contract-smoke-report.json";

function parseArgs(args) {
  const options = { outputPath: defaultOutput, writeReport: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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

const options = parseArgs(process.argv.slice(2));
if (extname(options.outputPath).toLowerCase() !== ".json") {
  throw new Error("--output must point to a JSON file.");
}

const port = 30_000 + Math.floor(Math.random() * 4_000);
const deploymentCredential = "operator-launch-ui-credential-2026";
process.env.PORT = String(port);
process.env.CINEJELLY_API_AUTH_TOKEN = deploymentCredential;
process.env.CINEJELLY_DISABLE_API_RATE_LIMIT = "true";

const { startServer } = await import("../dist/api/server.js");
const server = startServer(port);
const baseUrl = `http://127.0.0.1:${port}`;
let report;

try {
  await waitForHealth(baseUrl);
  const dashboardPage = await getText(`${baseUrl}/operator/launch-dashboard`);
  const unauthorized = await getJson(`${baseUrl}/v1/admin/operator-launch-ui-contract`, {});
  const contractResponse = await getJson(`${baseUrl}/v1/admin/operator-launch-ui-contract`, {
    Authorization: `Bearer ${deploymentCredential}`
  });
  const ui = contractResponse.body.uiContract;
  const serialized = JSON.stringify(contractResponse.body);
  const leakDetected = serialized.includes("C:\\Users\\Admin") ||
    serialized.includes("ATLASCLOUD_API_KEY") ||
    serialized.includes("operator-launch-ui-credential-2026") ||
    serialized.includes("sk-secret") ||
    serialized.includes("api_key=");
  const privateSourcePatternLineageLeakDetected = await containsPrivateSourcePatternTextForSmoke(JSON.stringify({
    dashboardPage: dashboardPage.body,
    ui
  }));
  const dashboardSecurityHeadersPassed = htmlSecurityHeadersPass(dashboardPage.headers);
  const sourceReports = Array.isArray(ui?.sourceReports) ? ui.sourceReports : [];
  const productGaps = Array.isArray(ui?.productGaps) ? ui.productGaps : [];
  const nextActions = Array.isArray(ui?.nextActions) ? ui.nextActions : [];
  const dashboardNoPrefilledLaunchState =
    !/id="side-(?:status|evidence|traffic|contracts)"\s*>\s*(?:locked|0%|blocked|unknown)\s*<\/span>|id="metric-traffic"\s*>\s*Blocked\s*<\/div>/iu.test(dashboardPage.body) &&
    dashboardPage.body.includes('id="side-status">--</span>') &&
    dashboardPage.body.includes('id="side-evidence">--</span>') &&
    dashboardPage.body.includes('id="side-traffic">--</span>') &&
    dashboardPage.body.includes('id="side-contracts">--</span>') &&
    dashboardPage.body.includes('id="metric-traffic">--</div>');
  const checks = [
    dashboardPage.statusCode === 200 &&
      String(dashboardPage.headers.get("content-type") ?? "").includes("text/html") &&
      dashboardPage.body.includes('data-contract-endpoint="/v1/admin/operator-launch-ui-contract"') &&
      dashboardPage.body.includes("Launch Readiness") &&
      dashboardPage.body.includes("Next Actions") &&
      !dashboardPage.body.includes("operator-launch-ui-credential-2026") &&
      !dashboardPage.body.includes("C:\\Users\\Admin") &&
      !dashboardPage.body.includes("ATLASCLOUD_API_KEY")
      ? pass("operator_dashboard_page_available", "First-party operator dashboard HTML is served without embedding credentials or local paths.")
      : fail("operator_dashboard_page_available", "Expected operator dashboard HTML route to be safe and available."),
    dashboardSecurityHeadersPassed
      ? pass("operator_dashboard_security_headers", "Operator launch dashboard HTML is served with no-store, nosniff, frame-deny, no-referrer, permissions-policy, and self-only CSP guardrails.")
      : fail("operator_dashboard_security_headers", "Expected operator dashboard HTML route to include strict browser security headers."),
    dashboardNoPrefilledLaunchState
      ? pass("operator_dashboard_no_prefilled_launch_state", "Operator launch dashboard shell shows neutral placeholders until the authenticated backend contract is loaded.")
      : fail("operator_dashboard_no_prefilled_launch_state", "Expected operator dashboard shell to avoid hardcoded readiness, evidence, or customer-traffic state before auth."),
    unauthorized.statusCode === 401
      ? pass("deployment_token_required", "Operator launch UI contract is protected by the deployment token.")
      : fail("deployment_token_required", "Expected missing deployment token to be rejected."),
    contractResponse.statusCode === 200 &&
      ui?.schemaVersion === "cinejelly.operator-launch-ui-contract.v1" &&
      ui?.noSpend === true &&
      ui?.networkCallsMade === false &&
      ui?.providerCallsMade === false
      ? pass("operator_launch_ui_contract_available", "Admin API returns a no-spend operator launch UI contract.")
      : fail("operator_launch_ui_contract_available", "Expected admin API to return the operator launch UI contract."),
    [
      "ready",
      "review_required",
      "blocked",
      "blocked_by_external_inputs",
      "blocked_by_operator_inputs",
      "missing_evidence",
      "scope_decision_required"
    ].includes(ui?.dashboardStatus) &&
      Number.isFinite(ui?.readiness?.evidenceCompletionPercent) &&
      ui.readiness.evidenceCompletionPercent >= 0 &&
      ui.readiness.evidenceCompletionPercent <= 100 &&
      ui?.readiness?.canReleaseToCustomerTraffic === false
      ? pass("readiness_summary_matches_current_evidence", "Contract preserves launch readiness status without granting customer traffic.")
      : fail("readiness_summary_matches_current_evidence", "Expected contract to summarize launch readiness evidence without customer traffic release."),
    sourceReports.some((reportItem) => reportItem.reportId === "business_completion_audit" && reportItem.present === true) &&
      sourceReports.some((reportItem) => reportItem.reportId === "report_contract_validation" && reportItem.status === "pass")
      ? pass("source_report_cards_present", "Contract exposes compact source-report cards for UI status panels.")
      : fail("source_report_cards_present", "Expected completion and report-contract source cards."),
    productGaps.some((gap) => gap.gapId === "first_party_web_ui" && gap.scopeDecisionRequired === true) &&
      productGaps.some((gap) => gap.gapId === "distributed_active_provider_work_resume") &&
      productGaps.some((gap) => gap.gapId === "director_benchmarking_style_benchmark_harness")
      ? pass("product_gaps_visible", "Contract surfaces the known product-code gaps without claiming launch completeness.")
      : fail("product_gaps_visible", "Expected known product-code gaps in UI contract."),
    nextActions.length >= 8 &&
      nextActions.some((action) => action.actionId === "deployment_https_capture") &&
      nextActions.some((action) => action.status === "blocked_budget") &&
      nextActions.some((action) => action.status === "scope_decision_required")
      ? pass("operator_action_queue_available", "Contract exposes prioritized operator actions, budget blockers, and scope-decision work.")
      : fail("operator_action_queue_available", "Expected operator action queue with deployment, budget, and scope decision actions."),
    ui?.releaseGateSummary?.canUseAsNoSpendOperatorLaunchUiEvidence === true &&
      ui?.releaseGateSummary?.readyForOperatorDashboard === true &&
      ui?.releaseGateSummary?.canReleaseToCustomerTraffic === false
      ? pass("release_gate_stays_blocked", "Contract is dashboard evidence only and keeps customer traffic blocked.")
      : fail("release_gate_stays_blocked", "Expected UI contract release gate to remain non-release evidence."),
    !leakDetected
      ? pass("admin_contract_redacted", "Response does not expose deployment token, local absolute paths, or secret-like values.")
      : fail("admin_contract_redacted", "Expected response to stay redacted."),
    !privateSourcePatternLineageLeakDetected
      ? pass("operator_ui_hides_private_source_pattern_lineage", "Operator dashboard HTML and UI contract do not expose private source-pattern repo, platform, or upstream workflow labels.")
      : fail("operator_ui_hides_private_source_pattern_lineage", "Expected operator dashboard HTML and UI contract to hide private source-pattern lineage.")
  ];

  report = {
    schemaVersion: "cinejelly.operator-launch-ui-contract-smoke.v1",
    generatedAt: new Date().toISOString(),
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    noSpend: true,
    localHttpCallsMade: true,
    networkCallsMade: false,
    providerCallsMade: false,
    sourcePatternOrigins: [
      "harry0703/MoneyPrinterTurbo",
      "vericontext/vibeframe",
      "HKUDS/VideoAgent",
      "jiaminchen-1031/DirectorBench"
    ],
    checkedInputs: {
      outputPath: options.outputPath,
      endpointPaths: [
        "GET /operator/launch-dashboard",
        "GET /v1/admin/operator-launch-ui-contract"
      ],
      dashboardStatusCode: dashboardPage.statusCode,
      unauthorizedStatusCode: unauthorized.statusCode,
      authorizedStatusCode: contractResponse.statusCode,
      sourceReportCount: sourceReports.length,
      productGapCount: productGaps.length,
      nextActionCount: nextActions.length,
      redactionCheckPassed: !leakDetected,
      htmlSecurityHeadersCheckPassed: dashboardSecurityHeadersPassed
    },
    scenarios: {
      dashboardStatus: ui?.dashboardStatus,
      evidenceCompletionPercent: ui?.readiness?.evidenceCompletionPercent,
      reportContractsStatus: ui?.readiness?.reportContractsStatus,
      budgetFit: ui?.budget?.budgetFit,
      readyPaidGateCount: ui?.budget?.readyPaidGateCount,
      missingOrBlockedInputCount: ui?.operatorInputs?.missingOrBlockedInputCount,
      canReleaseToCustomerTraffic: ui?.releaseGateSummary?.canReleaseToCustomerTraffic
    },
    checks,
    releaseGateSummary: {
      operatorLaunchUiContractSmokePass: checks.every((check) => check.status === "pass"),
      canUseAsNoSpendBackendEvidence: checks.every((check) => check.status === "pass"),
      readyForOperatorDashboard: ui?.releaseGateSummary?.readyForOperatorDashboard === true,
      canReleaseToCustomerTraffic: false,
      releaseBlocker: "Operator launch UI contract is dashboard integration evidence only; live/paid/operator gates still control customer traffic."
    },
    nextActions: [
      "Build the operator launch dashboard from this admin UI contract instead of parsing raw report artifacts in the browser.",
      "Record the commercial scope decision in launch intake before claiming UI/API launch completeness.",
      "Keep business-readiness, report-contract, and roadmap-closure audits as the source of truth for customer-traffic gates."
    ]
  };
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

if (options.writeReport) {
  writeJson(options.outputPath, report);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.status === "pass" ? 0 : 1);

async function waitForHealth(baseUrl) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server may still be binding the local smoke port.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("Local API server did not become ready for operator launch UI contract smoke.");
}

async function getJson(url, headers) {
  const response = await fetch(url, { headers });
  return {
    statusCode: response.status,
    body: await response.json()
  };
}

async function getText(url) {
  const response = await fetch(url);
  return {
    statusCode: response.status,
    headers: response.headers,
    body: await response.text()
  };
}

function htmlSecurityHeadersPass(headers) {
  const csp = String(headers.get("content-security-policy") ?? "");
  return String(headers.get("cache-control") ?? "").toLowerCase().includes("no-store") &&
    String(headers.get("x-content-type-options") ?? "").toLowerCase() === "nosniff" &&
    String(headers.get("x-frame-options") ?? "").toUpperCase() === "DENY" &&
    String(headers.get("referrer-policy") ?? "").toLowerCase() === "no-referrer" &&
    String(headers.get("permissions-policy") ?? "").includes("camera=()") &&
    csp.includes("default-src 'none'") &&
    csp.includes("connect-src 'self'") &&
    csp.includes("frame-ancestors 'none'") &&
    csp.includes("form-action 'self'");
}

function writeJson(outputPath, value) {
  const absolutePath = resolve(repoRoot, outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const PRIVATE_SOURCE_PATTERN_FALLBACK_FORBIDDEN_FRAGMENTS = [
  "Topview",
  "Higgsfield",
  "OpenMontage",
  "VideoAgent",
  "ViMax",
  "vibeframe",
  "YouMind-OpenLab",
  "ZeroLu",
  "Emily2040",
  "higgsfield-ai",
  "OSideMedia",
  "calesthio/",
  "HKUDS/",
  "video-db/",
  "vericontext/",
  "harry0703/",
  "MoneyPrinterTurbo",
  "moneyprinterturbo",
  "jiaminchen-1031/",
  "DirectorBench",
  "directorbench",
  "nirdiamant/",
  "gswithjeff/",
  "Shubhamsaboo/",
  "hereandnowai/",
  "Anil-matcha/"
];

async function containsPrivateSourcePatternTextForSmoke(value) {
  try {
    const registry = await import("../dist/core/private-source-pattern-registry.js");
    if (typeof registry.containsPrivateSourcePatternText === "function") {
      return registry.containsPrivateSourcePatternText(value);
    }
  } catch {
    // A clean checkout may run this script before build output exists.
  }
  const lowered = value.toLowerCase();
  return PRIVATE_SOURCE_PATTERN_FALLBACK_FORBIDDEN_FRAGMENTS.some((fragment) =>
    lowered.includes(fragment.toLowerCase())
  );
}

function pass(name, message) {
  return { name, status: "pass", message };
}

function fail(name, message) {
  return { name, status: "fail", message };
}
