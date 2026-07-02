/**
 * First-party operator launch dashboard page.
 * The page is static and credential-free; operators supply the deployment token
 * only in browser memory when fetching the protected admin contract endpoint.
 */

export function buildOperatorLaunchDashboardPage(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>CineJelly Launch Ops</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #18202a;
      --muted: #647181;
      --line: #d9dee7;
      --green: #13795b;
      --amber: #9a5b05;
      --red: #b42318;
      --blue: #1f5fbf;
      --violet: #6247aa;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
    }
    aside {
      border-right: 1px solid var(--line);
      background: #111827;
      color: #f8fafc;
      padding: 20px;
    }
    .brand {
      font-size: 18px;
      font-weight: 760;
      letter-spacing: 0;
      margin-bottom: 24px;
    }
    .nav-label {
      margin: 22px 0 8px;
      color: #9ca3af;
      font-size: 12px;
      text-transform: uppercase;
    }
    .nav-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      color: #e5e7eb;
    }
    main {
      min-width: 0;
      padding: 24px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .subline {
      margin-top: 6px;
      color: var(--muted);
    }
    .auth {
      display: grid;
      grid-template-columns: minmax(220px, 320px) auto;
      gap: 8px;
      align-items: center;
    }
    input {
      height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 10px;
      color: var(--ink);
      background: #fff;
      min-width: 0;
    }
    button {
      height: 38px;
      border: 0;
      border-radius: 6px;
      padding: 0 14px;
      background: #1f2937;
      color: #fff;
      font-weight: 680;
      cursor: pointer;
    }
    button:disabled {
      cursor: wait;
      opacity: 0.7;
    }
    .status-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    .metric,
    .panel,
    .action,
    .report,
    .gap {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .metric {
      padding: 14px;
      min-height: 96px;
    }
    .metric-label {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 8px;
    }
    .metric-value {
      font-size: 26px;
      line-height: 1;
      font-weight: 780;
      letter-spacing: 0;
    }
    .metric-note {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
      gap: 14px;
    }
    .panel {
      padding: 14px;
      margin-bottom: 14px;
    }
    .panel h2 {
      margin: 0 0 12px;
      font-size: 15px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .list {
      display: grid;
      gap: 8px;
    }
    .action,
    .report,
    .gap {
      padding: 10px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .title {
      font-weight: 700;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .detail {
      color: var(--muted);
      font-size: 12px;
      margin-top: 5px;
      overflow-wrap: anywhere;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      background: #eef2f7;
      color: #334155;
    }
    .ready { background: #ddf5ec; color: var(--green); }
    .warn { background: #fff2cc; color: var(--amber); }
    .bad { background: #ffe5e1; color: var(--red); }
    .info { background: #e6efff; color: var(--blue); }
    .scope { background: #eee9ff; color: var(--violet); }
    .empty {
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #fff;
    }
    .error {
      display: none;
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #ffc9c2;
      color: var(--red);
      background: #fff4f2;
    }
    .release-lock {
      border-left: 4px solid var(--red);
    }
    @media (max-width: 980px) {
      .shell { grid-template-columns: 1fr; }
      aside { display: none; }
      main { padding: 16px; }
      header { display: block; }
      .auth { grid-template-columns: 1fr; margin-top: 14px; }
      .status-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .status-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell" data-contract-endpoint="/v1/admin/operator-launch-ui-contract">
    <aside>
      <div class="brand">CineJelly Ops</div>
      <div class="nav-label">Launch</div>
      <div class="nav-item"><span>Readiness</span><span id="side-status">--</span></div>
      <div class="nav-item"><span>Evidence</span><span id="side-evidence">--</span></div>
      <div class="nav-label">Gates</div>
      <div class="nav-item"><span>Customer Traffic</span><span id="side-traffic">--</span></div>
      <div class="nav-item"><span>Report Contracts</span><span id="side-contracts">--</span></div>
    </aside>
    <main>
      <header>
        <div>
          <h1>Launch Readiness</h1>
          <div class="subline" id="generated-at">Awaiting operator access</div>
        </div>
        <form class="auth" id="auth-form">
          <input id="credential" name="credential" type="password" autocomplete="off" placeholder="Deployment token" aria-label="Deployment token">
          <button id="refresh" type="submit">Refresh</button>
        </form>
      </header>
      <div class="error" id="error"></div>
      <section class="status-row" aria-label="Launch status metrics">
        <div class="metric">
          <div class="metric-label">Evidence</div>
          <div class="metric-value" id="metric-evidence">--</div>
          <div class="metric-note" id="metric-evidence-note">business readiness</div>
        </div>
        <div class="metric">
          <div class="metric-label">Budget</div>
          <div class="metric-value" id="metric-budget">--</div>
          <div class="metric-note" id="metric-budget-note">paid sequence</div>
        </div>
        <div class="metric">
          <div class="metric-label">Inputs</div>
          <div class="metric-value" id="metric-inputs">--</div>
          <div class="metric-note">missing or blocked</div>
        </div>
        <div class="metric release-lock">
          <div class="metric-label">Customer Traffic</div>
          <div class="metric-value" id="metric-traffic">--</div>
          <div class="metric-note" id="metric-traffic-note">release gate</div>
        </div>
      </section>
      <div class="grid">
        <section>
          <div class="panel">
            <h2>Next Actions</h2>
            <div class="list" id="actions"><div class="empty">No contract loaded.</div></div>
          </div>
          <div class="panel">
            <h2>Product Gaps</h2>
            <div class="list" id="gaps"><div class="empty">No contract loaded.</div></div>
          </div>
        </section>
        <section>
          <div class="panel">
            <h2>Source Reports</h2>
            <div class="list" id="reports"><div class="empty">No contract loaded.</div></div>
          </div>
          <div class="panel">
            <h2>Release Gate</h2>
            <div id="release" class="detail">No contract loaded.</div>
          </div>
        </section>
      </div>
    </main>
  </div>
  <script>
    const endpoint = document.querySelector(".shell").dataset.contractEndpoint;
    const form = document.getElementById("auth-form");
    const button = document.getElementById("refresh");
    const errorBox = document.getElementById("error");
    const credentialInput = document.getElementById("credential");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await refresh();
    });

    async function refresh() {
      const credential = credentialInput.value.trim();
      errorBox.style.display = "none";
      button.disabled = true;
      try {
        const response = await fetch(endpoint, {
          headers: credential ? { Authorization: "Bearer " + credential } : {}
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Request failed");
        }
        render(payload.uiContract);
      } catch (error) {
        errorBox.textContent = error instanceof Error ? error.message : String(error);
        errorBox.style.display = "block";
      } finally {
        button.disabled = false;
      }
    }

    function render(contract) {
      document.getElementById("generated-at").textContent = "Generated " + formatDate(contract.generatedAt);
      document.getElementById("side-status").textContent = contract.dashboardStatus;
      document.getElementById("side-evidence").textContent = contract.readiness.evidenceCompletionPercent + "%";
      document.getElementById("side-traffic").textContent = contract.releaseGateSummary.canReleaseToCustomerTraffic ? "ready" : "blocked";
      document.getElementById("side-contracts").textContent = contract.readiness.reportContractsStatus;
      document.getElementById("metric-evidence").textContent = contract.readiness.evidenceCompletionPercent + "%";
      document.getElementById("metric-evidence-note").textContent = contract.readiness.businessReadinessStatus;
      document.getElementById("metric-budget").textContent = contract.budget.budgetFit.replaceAll("_", " ");
      document.getElementById("metric-budget-note").textContent = contract.budget.readyPaidGateCount + " ready paid gate(s)";
      document.getElementById("metric-inputs").textContent = String(contract.operatorInputs.missingOrBlockedInputCount);
      document.getElementById("metric-traffic").textContent = contract.releaseGateSummary.canReleaseToCustomerTraffic ? "Ready" : "Blocked";
      document.getElementById("metric-traffic-note").textContent = contract.releaseGateSummary.canReleaseToCustomerTraffic ? "release approved" : "release blocked";
      renderList("actions", contract.nextActions, actionTemplate);
      renderList("gaps", contract.productGaps, gapTemplate);
      renderList("reports", contract.sourceReports, reportTemplate);
      document.getElementById("release").textContent = contract.releaseGateSummary.releaseBlocker;
    }

    function renderList(id, items, template) {
      const node = document.getElementById(id);
      if (!items || !items.length) {
        node.innerHTML = '<div class="empty">None.</div>';
        return;
      }
      node.innerHTML = items.map(template).join("");
    }

    function actionTemplate(action) {
      return '<article class="action"><div class="row"><div><div class="title">' +
        escapeHtml(action.label) + '</div><div class="detail">' +
        escapeHtml(action.requiredAction) + '</div>' +
        (action.command ? '<div class="detail">' + escapeHtml(action.command) + '</div>' : '') +
        '</div><span class="pill ' + pillClass(action.status) + '">' +
        escapeHtml(action.status.replaceAll("_", " ")) + '</span></div></article>';
    }

    function gapTemplate(gap) {
      return '<article class="gap"><div class="row"><div><div class="title">' +
        escapeHtml(gap.label) + '</div><div class="detail">' +
        escapeHtml(gap.requiredAction) + '</div></div><span class="pill ' +
        pillClass(gap.status) + '">' + gap.currentCoveragePercent + '%</span></div></article>';
    }

    function reportTemplate(report) {
      return '<article class="report"><div class="row"><div><div class="title">' +
        escapeHtml(report.label) + '</div><div class="detail">' +
        escapeHtml(report.reportPath) + '</div></div><span class="pill ' +
        pillClass(report.status) + '">' + escapeHtml(report.status.replaceAll("_", " ")) + '</span></div></article>';
    }

    function pillClass(status) {
      if (status === "pass" || status === "ready") return "ready";
      if (status.includes("scope")) return "scope";
      if (status.includes("budget")) return "warn";
      if (status.includes("blocked") || status === "fail" || status === "invalid_json") return "bad";
      return "info";
    }

    function formatDate(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
  </script>
</body>
</html>`;
}
