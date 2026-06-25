/**
 * First-party Short create/review page shell.
 * This page is intentionally static and credential-free; clients supply their
 * API key only in browser memory when calling protected /v1 endpoints.
 */

export function buildShortPipelineCreatePage(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>CineJelly Create Short</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7f8;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #627080;
      --line: #d7dde4;
      --button: #1e2a36;
      --green: #13795b;
      --amber: #986705;
      --red: #b42318;
      --blue: #245db8;
      --teal: #0f766e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 272px minmax(0, 1fr);
    }
    aside {
      background: #102033;
      color: #f8fafc;
      border-right: 1px solid #1f3148;
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
      color: #9fb0c1;
      font-size: 12px;
      text-transform: uppercase;
    }
    .nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      color: #e5edf6;
    }
    main {
      min-width: 0;
      padding: 24px;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 15px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .subline {
      color: var(--muted);
      margin-top: 6px;
      overflow-wrap: anywhere;
    }
    .auth {
      display: grid;
      grid-template-columns: minmax(220px, 320px) auto;
      gap: 8px;
      align-items: center;
    }
    input,
    select,
    textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      min-width: 0;
    }
    input,
    select {
      height: 38px;
      padding: 0 10px;
    }
    textarea {
      min-height: 126px;
      padding: 10px;
      resize: vertical;
    }
    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
      min-width: 0;
    }
    label span {
      color: var(--ink);
      font-weight: 680;
    }
    button {
      height: 38px;
      border: 0;
      border-radius: 6px;
      padding: 0 14px;
      background: var(--button);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    button:disabled {
      cursor: wait;
      opacity: 0.7;
    }
    .secondary {
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
    }
    .session-button {
      width: 100%;
      height: auto;
      min-height: 58px;
      padding: 10px;
      background: var(--panel);
      color: var(--ink);
      border: 1px solid var(--line);
      text-align: left;
      white-space: normal;
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(360px, 0.85fr) minmax(0, 1.15fr);
      gap: 14px;
      align-items: start;
    }
    .panel,
    .metric,
    .item {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .panel {
      padding: 14px;
      margin-bottom: 14px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .span-2 {
      grid-column: 1 / -1;
    }
    .actions-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    .metric {
      min-height: 92px;
      padding: 14px;
    }
    .metric-label {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 8px;
    }
    .metric-value {
      font-size: 24px;
      line-height: 1;
      font-weight: 780;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }
    .metric-note {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .list {
      display: grid;
      gap: 8px;
    }
    .item {
      padding: 10px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .title {
      font-weight: 710;
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
      font-weight: 720;
      white-space: nowrap;
      background: #eef2f7;
      color: #334155;
    }
    .ready { background: #ddf5ec; color: var(--green); }
    .warn { background: #fff2cc; color: var(--amber); }
    .bad { background: #ffe5e1; color: var(--red); }
    .info { background: #e6efff; color: var(--blue); }
    .teal { background: #ddf7f3; color: var(--teal); }
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
    .success {
      display: none;
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #b8ebd6;
      color: var(--green);
      background: #eefbf6;
    }
    @media (max-width: 1100px) {
      .app { grid-template-columns: 1fr; }
      aside { display: none; }
      main { padding: 16px; }
      header { display: block; }
      .auth { grid-template-columns: 1fr; margin-top: 14px; }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      .form-grid,
      .metrics { grid-template-columns: 1fr; }
      .span-2 { grid-column: auto; }
    }
  </style>
</head>
<body>
  <div class="app"
    data-session-endpoint="/v1/short-pipeline/conversation-sessions"
    data-session-ui-endpoint="/v1/short-pipeline/conversation-sessions/{sessionId}/ui-contract"
    data-render-endpoint="/v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs">
    <aside>
      <div class="brand">CineJelly Short</div>
      <div class="nav-label">Plan</div>
      <div class="nav-item"><span>Status</span><span id="side-status">idle</span></div>
      <div class="nav-item"><span>Scenes</span><span id="side-scenes">0</span></div>
      <div class="nav-label">Review</div>
      <div class="nav-item"><span>Pending</span><span id="side-pending">0</span></div>
      <div class="nav-item"><span>Provider</span><span id="side-provider">locked</span></div>
    </aside>
    <main>
      <header>
        <div>
          <h1>Create Short</h1>
          <div class="subline" id="session-line">No session loaded.</div>
        </div>
        <form class="auth" id="auth-form">
          <input id="api-key" type="password" autocomplete="off" placeholder="Client API key" aria-label="Client API key">
          <button type="submit" id="load-sessions">Sessions</button>
        </form>
      </header>
      <div class="error" id="error"></div>
      <div class="success" id="success"></div>
      <section class="metrics" aria-label="Short pipeline metrics">
        <div class="metric">
          <div class="metric-label">Workflow</div>
          <div class="metric-value" id="metric-workflow">--</div>
          <div class="metric-note" id="metric-duration">duration</div>
        </div>
        <div class="metric">
          <div class="metric-label">Review</div>
          <div class="metric-value" id="metric-review">--</div>
          <div class="metric-note" id="metric-checkpoints">checkpoints</div>
        </div>
        <div class="metric">
          <div class="metric-label">Audio</div>
          <div class="metric-value" id="metric-audio">--</div>
          <div class="metric-note">guided handoff</div>
        </div>
        <div class="metric">
          <div class="metric-label">Provider Spend</div>
          <div class="metric-value" id="metric-provider">Locked</div>
          <div class="metric-note">formal approval required</div>
        </div>
      </section>
      <div class="grid">
        <section>
          <div class="panel">
            <h2>Brief</h2>
            <form id="brief-form">
              <div class="form-grid">
                <label class="span-2"><span>Prompt</span>
                  <textarea id="prompt">Create a 28 second TikTok UGC review ad for Glow Focus Serum. Keep it proof-led, premium, and easy to approve before render spend.</textarea>
                </label>
                <label><span>Project ID</span><input id="project-id" value="short_create_shell"></label>
                <label><span>Platform</span>
                  <select id="platform">
                    <option value="tiktok">TikTok</option>
                    <option value="instagram_reels">Instagram Reels</option>
                    <option value="youtube_shorts">YouTube Shorts</option>
                    <option value="unknown">Flexible</option>
                  </select>
                </label>
                <label><span>Duration</span><input id="duration" type="number" min="15" max="60" value="28"></label>
                <label><span>Audio</span>
                  <select id="audio">
                    <option value="en">English VO</option>
                    <option value="vi">Vietnamese VO</option>
                    <option value="zh">Chinese VO</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <label><span>Product</span><input id="product-title" value="Glow Focus Serum"></label>
                <label><span>Category</span><input id="category" value="beauty"></label>
                <label class="span-2"><span>Allowed Claim</span><input id="claim" value="Visibly improves dull-looking skin"></label>
              </div>
              <div class="actions-row">
                <button type="submit" id="create-session">Create Session</button>
                <button type="button" class="secondary" id="refresh-contract" disabled>Refresh Contract</button>
              </div>
            </form>
          </div>
          <div class="panel">
            <h2>Recent Sessions</h2>
            <div class="list" id="sessions"><div class="empty">No sessions loaded.</div></div>
          </div>
        </section>
        <section>
          <div class="panel">
            <h2>Review Actions</h2>
            <div class="list" id="user-actions"><div class="empty">No contract loaded.</div></div>
          </div>
          <div class="panel">
            <h2>Backend Steps</h2>
            <div class="list" id="backend-steps"><div class="empty">No contract loaded.</div></div>
          </div>
          <div class="panel">
            <h2>Director</h2>
            <div id="director" class="detail">No contract loaded.</div>
          </div>
        </section>
      </div>
    </main>
  </div>
  <script>
    const root = document.querySelector(".app");
    const endpoints = {
      sessions: root.dataset.sessionEndpoint,
      sessionUi: root.dataset.sessionUiEndpoint,
      render: root.dataset.renderEndpoint
    };
    let activeSessionId = "";

    document.getElementById("auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      await loadSessions();
    });
    document.getElementById("brief-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      await createSession();
    });
    document.getElementById("refresh-contract").addEventListener("click", async () => {
      if (activeSessionId) await loadContract(activeSessionId);
    });

    async function createSession() {
      clearMessages();
      const payload = briefPayload();
      const response = await apiFetch(endpoints.sessions, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      activeSessionId = response.session.sessionId;
      document.getElementById("session-line").textContent = activeSessionId;
      document.getElementById("refresh-contract").disabled = false;
      showSuccess("Session created.");
      await loadContract(activeSessionId);
      await loadSessions();
    }

    async function loadSessions() {
      clearMessages();
      const response = await apiFetch(endpoints.sessions);
      const sessions = response.sessions || [];
      renderList("sessions", sessions, sessionTemplate);
    }

    async function loadContract(sessionId) {
      clearMessages();
      const endpoint = endpoints.sessionUi.replace("{sessionId}", encodeURIComponent(sessionId));
      const response = await apiFetch(endpoint);
      activeSessionId = sessionId;
      document.getElementById("session-line").textContent = sessionId;
      document.getElementById("refresh-contract").disabled = false;
      renderContract(response.uiContract);
    }

    async function apiFetch(path, options = {}) {
      const key = document.getElementById("api-key").value.trim();
      const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "X-CineJelly-Api-Key": key } : {})
      };
      try {
        const response = await fetch(path, { ...options, headers });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Request failed");
        }
        return payload;
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    function briefPayload() {
      const language = document.getElementById("audio").value;
      const audio = language === "off" ? { mode: "off" } : { mode: "voiceover", language };
      return {
        projectId: document.getElementById("project-id").value.trim(),
        userPrompt: document.getElementById("prompt").value.trim(),
        targetPlatform: document.getElementById("platform").value,
        targetDurationSeconds: Number(document.getElementById("duration").value),
        audio,
        product: {
          snapshot: {
            productTitle: document.getElementById("product-title").value.trim(),
            category: document.getElementById("category").value.trim(),
            claims: [document.getElementById("claim").value.trim()].filter(Boolean)
          }
        },
        brandKit: {
          brandName: "Operator Brand",
          tone: "premium but clear",
          language: language === "off" ? "en" : language,
          allowedClaims: [document.getElementById("claim").value.trim()].filter(Boolean),
          forbiddenClaims: ["guaranteed cure", "instant medical result"],
          ctaRules: ["Use one CTA only"]
        },
        messages: [
          { role: "user", text: document.getElementById("prompt").value.trim() }
        ]
      };
    }

    function renderContract(contract) {
      document.getElementById("side-status").textContent = contract.status;
      document.getElementById("side-scenes").textContent = String(contract.outputContract.expectedSceneCount);
      document.getElementById("side-pending").textContent = String(contract.review.requiredPendingCount);
      document.getElementById("side-provider").textContent = contract.render.canSubmitToProviderNow ? "ready" : "locked";
      document.getElementById("metric-workflow").textContent = contract.duration.recommendedWorkflowMode.replaceAll("_", " ");
      document.getElementById("metric-duration").textContent = contract.duration.targetSeconds + "s target";
      document.getElementById("metric-review").textContent = contract.review.status.replaceAll("_", " ");
      document.getElementById("metric-checkpoints").textContent = contract.review.checkpointCount + " checkpoint(s)";
      document.getElementById("metric-audio").textContent = contract.audioControls.selectedOptionId.replaceAll("_", " ");
      document.getElementById("metric-provider").textContent = contract.render.canSubmitToProviderNow ? "Ready" : "Locked";
      renderList("user-actions", contract.userRequiredActions, actionTemplate);
      renderList("backend-steps", contract.backendManagedSteps, actionTemplate);
      document.getElementById("director").textContent = [
        contract.director.creativeMode.replaceAll("_", " "),
        contract.director.durationStrategy.replaceAll("_", " "),
        contract.director.targetBeatCount + " beats",
        contract.director.hookWindowSeconds + "s hook"
      ].join(" | ");
    }

    function renderList(id, items, template) {
      const node = document.getElementById(id);
      if (!items || !items.length) {
        node.innerHTML = '<div class="empty">None.</div>';
        return;
      }
      node.innerHTML = items.map(template).join("");
    }

    function sessionTemplate(session) {
      return '<button type="button" class="session-button" onclick="loadContract(' +
        "'" + escapeAttribute(session.sessionId) + "'" +
        ')"><div class="row"><div><div class="title">' +
        escapeHtml(session.projectId) + '</div><div class="detail">' +
        escapeHtml(session.sessionId) + '</div></div><span class="pill ' +
        pillClass(session.planStatus || "info") + '">' +
        escapeHtml(session.planStatus || "stored") + '</span></div></button>';
    }

    function actionTemplate(action) {
      return '<article class="item"><div class="row"><div><div class="title">' +
        escapeHtml(action.label) + '</div><div class="detail">' +
        escapeHtml(action.reason) + '</div></div><span class="pill ' +
        pillClass(action.status) + '">' + escapeHtml(action.status.replaceAll("_", " ")) +
        '</span></div></article>';
    }

    function pillClass(status) {
      if (status === "ready" || status === "approved" || status === "pass") return "ready";
      if (status === "needs_review" || status === "review_required") return "warn";
      if (status === "blocked" || status === "fail" || status === "rejected") return "bad";
      if (status === "optional") return "teal";
      return "info";
    }

    function clearMessages() {
      document.getElementById("error").style.display = "none";
      document.getElementById("success").style.display = "none";
    }

    function showError(message) {
      const node = document.getElementById("error");
      node.textContent = message;
      node.style.display = "block";
    }

    function showSuccess(message) {
      const node = document.getElementById("success");
      node.textContent = message;
      node.style.display = "block";
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function escapeAttribute(value) {
      return escapeHtml(value).replaceAll("\\", "\\\\");
    }
  </script>
</body>
</html>`;
}
