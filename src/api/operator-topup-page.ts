/**
 * Operator top-up desk.
 *
 * The daily money task — approving customer bank-transfer top-ups — as a one-screen web
 * page instead of raw curl commands. The page itself is static and credential-free: the
 * operator pastes the deployment API key once (remembered per machine) and every action
 * calls the existing /v1/admin endpoints. Vietnamese-first, mobile-friendly.
 */

export function buildOperatorTopupPage(): string {
  return String.raw`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CineJelly — Duyệt nạp credits</title>
  <style>
    :root { --bg:#0b0e1d; --card:#141936; --line:rgba(255,255,255,.14); --ink:#eef1ff; --muted:#9aa3c7; --ok:#36f2aa; --bad:#ff5b72; }
    * { box-sizing: border-box; margin: 0; }
    body { background: var(--bg); color: var(--ink); font: 14px/1.55 "Segoe UI", system-ui, sans-serif; padding: 18px; max-width: 860px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .muted { color: var(--muted); font-size: 12px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-top: 14px; }
    input, button { font: inherit; color: var(--ink); border-radius: 8px; border: 1px solid var(--line); background: rgba(255,255,255,.05); padding: 9px 11px; min-height: 42px; }
    input { width: 100%; }
    button { cursor: pointer; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .row > input { flex: 1 1 220px; }
    .approve { background: rgba(54,242,170,.16); border-color: rgba(54,242,170,.55); }
    .reject { background: rgba(255,91,114,.14); border-color: rgba(255,91,114,.5); }
    .topup { border-bottom: 1px dashed var(--line); padding: 10px 0; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
    .topup:last-child { border-bottom: 0; }
    .status { margin-top: 8px; font-size: 13px; min-height: 18px; }
    .status.ok { color: var(--ok); } .status.bad { color: var(--bad); }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: rgba(143,92,255,.22); font-size: 11px; }
    @media (max-width: 620px) { body { padding: 12px; } .topup { flex-direction: column; align-items: flex-start; } }
  </style>
</head>
<body>
  <h1>💎 Duyệt nạp credits</h1>
  <div class="muted">Khách chuyển khoản xong sẽ hiện ở đây. Đối chiếu với app ngân hàng của bạn rồi bấm Duyệt — credits cộng ngay lập tức.</div>

  <div class="card">
    <label class="muted" for="admin-key">Khóa quản trị (CINEJELLY_API_AUTH_TOKEN trong file .env — dán 1 lần, máy này tự nhớ)</label>
    <div class="row">
      <input id="admin-key" type="password" autocomplete="off" placeholder="Dán khóa quản trị...">
      <button id="load-btn">Tải danh sách</button>
      <button id="forget-btn" title="Xoá khóa đã nhớ">✕</button>
    </div>
    <div class="status" id="status"></div>
  </div>

  <div class="card">
    <strong>Yêu cầu đang chờ duyệt</strong>
    <div id="pending-list"><div class="muted" style="margin-top:8px">Bấm "Tải danh sách" để xem.</div></div>
  </div>

  <div class="card">
    <strong>🎬 Video chờ duyệt</strong>
    <div class="muted">Khách bấm tạo video xong sẽ chờ ở đây. Bấm Duyệt để video bắt đầu chạy (khách đã bị giữ credits; từ chối sẽ tự hoàn).</div>
    <div id="review-list"><div class="muted" style="margin-top:8px">Bấm "Tải danh sách" phía trên để xem.</div></div>
  </div>

  <div class="card">
    <strong>🔎 Tra cứu khách hàng</strong>
    <div class="row">
      <input id="lookup-email" type="email" placeholder="email khách hàng">
      <button id="lookup-btn">Tra cứu</button>
    </div>
    <div id="lookup-result" class="muted" style="margin-top:8px"></div>
  </div>

  <div class="card">
    <strong>📈 Doanh thu</strong>
    <div id="revenue-line" class="muted" style="margin-top:8px">Bấm "Tải danh sách" để cập nhật.</div>
  </div>

  <div class="card">
    <strong>Cộng/trừ credits thủ công</strong>
    <div class="muted">Dùng khi tặng khách, xử lý khiếu nại, hoặc trừ nhầm lẫn. Số âm để trừ.</div>
    <div class="row">
      <input id="reset-email" type="email" placeholder="email khách quên mật khẩu">
      <button id="reset-btn">🔑 Cấp lại mật khẩu</button>
    </div>
    <div class="muted">Mật khẩu tạm sẽ hiện ở dòng trạng thái — gửi cho khách qua Zalo/tin nhắn, khách đăng nhập rồi tự đổi.</div>
    <div class="row" style="margin-top:14px">
      <input id="adjust-email" type="email" placeholder="email khách hàng">
      <input id="adjust-credits" type="number" placeholder="số credits (vd 500 hoặc -200)">
      <input id="adjust-note" placeholder="ghi chú (vd: tặng khách mới)">
      <button id="adjust-btn">Thực hiện</button>
    </div>
  </div>

  <script>
    const KEY_STORAGE = "cinejelly_admin_key";
    const keyInput = document.getElementById("admin-key");
    const statusBox = document.getElementById("status");
    try { keyInput.value = localStorage.getItem(KEY_STORAGE) || ""; } catch (e) {}
    keyInput.addEventListener("change", function () {
      try { if (keyInput.value.trim()) localStorage.setItem(KEY_STORAGE, keyInput.value.trim()); } catch (e) {}
    });
    document.getElementById("forget-btn").addEventListener("click", function () {
      try { localStorage.removeItem(KEY_STORAGE); } catch (e) {}
      keyInput.value = "";
      say("Đã xoá khóa khỏi máy này.", true);
    });
    function say(message, ok) {
      statusBox.textContent = message;
      statusBox.className = "status " + (ok ? "ok" : "bad");
    }
    function headers() {
      return { "Content-Type": "application/json", "X-CineJelly-Api-Key": keyInput.value.trim() };
    }
    async function loadPending() {
      if (!keyInput.value.trim()) { say("Dán khóa quản trị trước.", false); return; }
      const response = await fetch("/v1/admin/topups", { headers: headers() });
      const payload = await response.json();
      if (!response.ok) { say(payload.error || "Không tải được.", false); return; }
      const box = document.getElementById("pending-list");
      box.innerHTML = "";
      const pending = payload.pending || [];
      if (pending.length === 0) {
        box.innerHTML = '<div class="muted" style="margin-top:8px">Không có yêu cầu nào đang chờ. 🎉</div>';
      }
      pending.forEach(function (topup) {
        const row = document.createElement("div");
        row.className = "topup";
        const info = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = topup.email + " — " + topup.credits.toLocaleString("vi-VN") + " credits (" + topup.amountVnd.toLocaleString("vi-VN") + "đ)";
        const note = document.createElement("div");
        note.className = "muted";
        note.textContent = (topup.userNote ? "Ghi chú: " + topup.userNote + " • " : "") + new Date(topup.requestedAt).toLocaleString("vi-VN");
        info.appendChild(strong); info.appendChild(note);
        const actions = document.createElement("div");
        actions.className = "row";
        const approveBtn = document.createElement("button");
        approveBtn.className = "approve"; approveBtn.textContent = "✅ Duyệt";
        approveBtn.addEventListener("click", function () { decide(topup.topupId, true); });
        const rejectBtn = document.createElement("button");
        rejectBtn.className = "reject"; rejectBtn.textContent = "❌ Từ chối";
        rejectBtn.addEventListener("click", function () { decide(topup.topupId, false); });
        actions.appendChild(approveBtn); actions.appendChild(rejectBtn);
        row.appendChild(info); row.appendChild(actions);
        box.appendChild(row);
      });
      say("Đang chờ: " + pending.length + " yêu cầu.", true);
    }
    async function decide(topupId, approve) {
      const response = await fetch("/v1/admin/topups/decide", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ topupId: topupId, approve: approve, note: approve ? "duyệt qua trang quản trị" : "từ chối qua trang quản trị" })
      });
      const payload = await response.json();
      if (!response.ok) { say(payload.error || "Không xử lý được.", false); return; }
      say(approve ? "Đã duyệt — credits đã cộng cho khách." : "Đã từ chối yêu cầu.", true);
      loadPending();
    }
    async function loadReviewQueue() {
      const response = await fetch("/v1/render-jobs", { headers: headers() });
      if (!response.ok) { return; }
      const payload = await response.json();
      const paused = (payload.jobs || []).filter(function (job) { return job.status === "paused_for_review"; });
      const box = document.getElementById("review-list");
      box.innerHTML = "";
      if (paused.length === 0) {
        box.innerHTML = '<div class="muted" style="margin-top:8px">Không có video nào chờ duyệt. 🎉</div>';
        return;
      }
      paused.forEach(function (job) {
        const row = document.createElement("div");
        row.className = "topup";
        const info = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = (job.userInputPreview || job.jobId).slice(0, 90);
        const note = document.createElement("div");
        note.className = "muted";
        note.textContent = job.jobId + " • " + new Date(job.createdAt).toLocaleString("vi-VN");
        info.appendChild(strong); info.appendChild(note);
        const actions = document.createElement("div");
        actions.className = "row";
        const approveBtn = document.createElement("button");
        approveBtn.className = "approve"; approveBtn.textContent = "✅ Duyệt chạy";
        approveBtn.addEventListener("click", function () { decideReview(job.jobId, "approved"); });
        const rejectBtn = document.createElement("button");
        rejectBtn.className = "reject"; rejectBtn.textContent = "❌ Từ chối";
        rejectBtn.addEventListener("click", function () { decideReview(job.jobId, "rejected"); });
        actions.appendChild(approveBtn); actions.appendChild(rejectBtn);
        row.appendChild(info); row.appendChild(actions);
        box.appendChild(row);
      });
    }
    async function decideReview(jobId, decision) {
      const detailResponse = await fetch("/v1/render-jobs/" + encodeURIComponent(jobId), { headers: headers() });
      const detail = await detailResponse.json();
      if (!detailResponse.ok) { say(detail.error || "Không tải được job.", false); return; }
      const report = detail.preRenderReviewApproval || detail.reviewApproval;
      const reviewedAt = new Date().toISOString();
      const checkpoints = ((report && report.checkpoints) || []).map(function (checkpoint) {
        return {
          surface: checkpoint.surface,
          label: checkpoint.label,
          ...(checkpoint.subjectId ? { subjectId: checkpoint.subjectId } : {}),
          required: checkpoint.required !== false,
          decision: decision,
          reviewer: "operator-desk",
          reviewedAt: reviewedAt,
          notes: decision === "approved" ? "duyệt qua trang quản trị" : "từ chối qua trang quản trị"
        };
      });
      if (checkpoints.length === 0) { say("Job không có checkpoint kiểm duyệt để quyết định.", false); return; }
      const response = await fetch("/v1/render-jobs/" + encodeURIComponent(jobId) + "/review", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ gate: (report && report.gate) || "pre_render", checkpoints: checkpoints })
      });
      const payload = await response.json();
      if (!response.ok) { say(payload.error || "Không xử lý được.", false); return; }
      say(decision === "approved" ? "Đã duyệt — video bắt đầu chạy." : "Đã từ chối — hệ thống tự hoàn credits cho khách.", true);
      loadReviewQueue();
    }
    async function loadRevenue() {
      const response = await fetch("/v1/admin/revenue-summary", { headers: headers() });
      if (!response.ok) { return; }
      const payload = await response.json();
      const revenue = payload.revenue || {};
      document.getElementById("revenue-line").textContent =
        (revenue.customerCount || 0) + " khách • " + (revenue.approvedTopupCount || 0) + " lượt nạp đã duyệt • " +
        (revenue.totalRevenueVnd || 0).toLocaleString("vi-VN") + "đ doanh thu • " +
        (revenue.totalCreditsSold || 0).toLocaleString("vi-VN") + " credits đã bán • còn nợ khách " +
        (revenue.outstandingCreditsLiability || 0).toLocaleString("vi-VN") + " credits";
    }
    document.getElementById("lookup-btn").addEventListener("click", async function () {
      const email = document.getElementById("lookup-email").value.trim();
      if (!email) { say("Nhập email khách trước.", false); return; }
      const response = await fetch("/v1/admin/accounts/lookup?email=" + encodeURIComponent(email), { headers: headers() });
      const payload = await response.json();
      if (!response.ok) { say(payload.error || "Không tra cứu được.", false); return; }
      const lines = [
        "Số dư: " + payload.account.balanceCredits.toLocaleString("vi-VN") + " credits (" + payload.account.displayName + ")"
      ];
      (payload.statement || []).slice(0, 6).forEach(function (entry) {
        lines.push(new Date(entry.at).toLocaleString("vi-VN") + " — " + (entry.credits > 0 ? "+" : "") + entry.credits + ": " + entry.note);
      });
      document.getElementById("lookup-result").textContent = lines.join("\n");
      document.getElementById("lookup-result").style.whiteSpace = "pre-line";
      say("Đã tra cứu " + email + ".", true);
    });
    document.getElementById("load-btn").addEventListener("click", function () {
      loadReviewQueue();
      loadRevenue();
    });
    document.getElementById("load-btn").addEventListener("click", loadPending);
    document.getElementById("reset-btn").addEventListener("click", async function () {
      const email = document.getElementById("reset-email").value.trim();
      if (!email) { say("Nhập email của khách trước.", false); return; }
      const response = await fetch("/v1/admin/accounts/reset-password", {
        method: "POST", headers: headers(), body: JSON.stringify({ email: email })
      });
      const payload = await response.json();
      if (!response.ok) { say(payload.error || "Không cấp lại được.", false); return; }
      const temporary = response.headers.get("X-CineJelly-Temporary-Password") || "";
      say("Mật khẩu tạm của " + email + ": " + temporary + " — gửi cho khách, nhắc khách đổi ngay sau khi vào.", true);
    });
    document.getElementById("adjust-btn").addEventListener("click", async function () {
      const email = document.getElementById("adjust-email").value.trim();
      const credits = Number(document.getElementById("adjust-credits").value);
      const note = document.getElementById("adjust-note").value.trim();
      const response = await fetch("/v1/admin/credits/adjust", {
        method: "POST", headers: headers(),
        body: JSON.stringify({ email: email, credits: credits, ...(note ? { note: note } : {}) })
      });
      const payload = await response.json();
      if (!response.ok) { say(payload.error || "Không thực hiện được.", false); return; }
      say("Xong — số dư mới của " + email + ": " + payload.account.balanceCredits.toLocaleString("vi-VN") + " credits.", true);
    });
    // Auto refresh the queue every 60s while the desk is open.
    setInterval(function () {
      if (keyInput.value.trim()) {
        loadPending();
        loadReviewQueue();
      }
    }, 60000);
  </script>
</body>
</html>`;
}
