/**
 * CineJelly Admin Center.
 *
 * A full operator control panel served at /operator/topups (and /operator/admin), driving
 * the existing /v1/admin/* endpoints. Everything an operator manages while LIVE: approve
 * top-ups and refunds, review videos, look up customers, adjust/gift credits, reset
 * passwords, and — on the Settings tab — edit render pricing, credit packages, provider
 * models, bank info, and studio content (announcement + featured images) without touching
 * the server. The page is static and credential-free: the operator pastes the deployment
 * key once (remembered per machine) and it is sent only on /v1/admin calls. Vietnamese,
 * mobile-friendly. All server data is rendered via textContent / created nodes (no
 * innerHTML of untrusted values).
 */

export function buildOperatorTopupPage(): string {
  return String.raw`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CineJelly — Trung tâm quản trị</title>
  <style>
    :root { --bg:#0b0e1d; --card:#141936; --line:rgba(255,255,255,.14); --ink:#eef1ff; --muted:#9aa3c7; --ok:#36f2aa; --bad:#ff5b72; --accent:#8f5cff; }
    * { box-sizing: border-box; margin: 0; }
    body { background: var(--bg); color: var(--ink); font: 14px/1.55 "Segoe UI", system-ui, sans-serif; padding: 16px; max-width: 960px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 2px; }
    .muted { color: var(--muted); font-size: 12px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-top: 14px; }
    label.lbl { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
    input, button, select, textarea { font: inherit; color: var(--ink); border-radius: 8px; border: 1px solid var(--line); background: rgba(255,255,255,.05); padding: 9px 11px; min-height: 42px; }
    input, textarea, select { width: 100%; }
    textarea { min-height: 64px; resize: vertical; }
    button { cursor: pointer; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .row > input, .row > select { flex: 1 1 200px; }
    .approve { background: rgba(54,242,170,.16); border-color: rgba(54,242,170,.55); }
    .reject { background: rgba(255,91,114,.14); border-color: rgba(255,91,114,.5); }
    .primary { background: linear-gradient(135deg, rgba(143,92,255,.85), rgba(17,183,255,.7)); border: 0; font-weight: 600; }
    .item { border-bottom: 1px dashed var(--line); padding: 10px 0; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
    .item:last-child { border-bottom: 0; }
    .status { margin-top: 8px; font-size: 13px; min-height: 18px; white-space: pre-line; }
    .status.ok { color: var(--ok); } .status.bad { color: var(--bad); }
    .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
    .tab { flex: 1 1 auto; min-height: 44px; border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 8px; }
    .tab.active { background: rgba(143,92,255,.25); border-color: rgba(143,92,255,.7); }
    .panel { display: none; }
    .panel.active { display: block; }
    .pkg-row { display: grid; grid-template-columns: 1.2fr 1.4fr 1fr 1fr auto; gap: 6px; margin-top: 6px; align-items: center; }
    .pkg-row input { min-height: 38px; }
    .del { background: rgba(255,91,114,.14); border-color: rgba(255,91,114,.5); min-height: 38px; }
    .kpi { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .kpi > div { background: rgba(255,255,255,.04); border-radius: 8px; padding: 10px; }
    .kpi strong { display: block; font-size: 17px; }
    .atlas-price-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
    .atlas-price-table th, .atlas-price-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
    .atlas-price-table th { color: var(--muted); font-weight: 600; }
    .atlas-price-table td:last-child { font-weight: 700; color: #34d399; }
    @media (max-width: 680px) { .pkg-row { grid-template-columns: 1fr 1fr; } .kpi { grid-template-columns: 1fr; } .atlas-price-table { display: block; overflow-x: auto; } }
  </style>
</head>
<body>
  <h1>🛠️ Trung tâm quản trị CineJelly</h1>
  <div class="muted">Quản lý tiền, khách hàng, và cấu hình dự án ngay trên trình duyệt.</div>

  <div class="card">
    <label class="lbl" for="admin-key">Khóa quản trị (CINEJELLY_API_AUTH_TOKEN trong .env — dán 1 lần, máy này tự nhớ)</label>
    <div class="row">
      <input id="admin-key" type="password" autocomplete="off" placeholder="Dán khóa quản trị...">
      <button id="load-btn" class="primary">Tải dữ liệu</button>
      <button id="forget-btn" title="Xoá khóa đã nhớ">✕</button>
    </div>
    <div class="status" id="status"></div>
  </div>

  <div class="tabs">
    <button class="tab active" data-tab="money">💰 Tiền <span id="badge-money" style="display:none;background:#c62828;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px"></span></button>
    <button class="tab" data-tab="customers">👥 Khách hàng</button>
    <button class="tab" data-tab="settings">⚙️ Cấu hình</button>
    <button class="tab" data-tab="health">🩺 Sức khỏe</button>
  </div>

  <div class="panel active" id="panel-money">
    <div class="card">
      <div class="kpi" id="revenue-kpi"><div class="muted">Bấm "Tải dữ liệu" để xem doanh thu.</div></div>
    </div>
    <div class="card">
      <strong>💎 Nạp credits chờ duyệt</strong>
      <div class="muted">Đối chiếu app ngân hàng rồi bấm Duyệt — credits cộng ngay.</div>
      <div id="topup-list"><div class="muted" style="margin-top:8px">—</div></div>
    </div>
    <div class="card">
      <strong>↩️ Yêu cầu hoàn tiền chờ xử lý</strong>
      <div class="muted">Video lỗi/hủy KHÔNG tự hoàn (có lợi cho bạn). Bạn quyết định từng ca ở đây.</div>
      <div id="refund-list"><div class="muted" style="margin-top:8px">—</div></div>
    </div>
    <div class="card">
      <strong>🎬 Video chờ duyệt</strong>
      <div class="muted">Bấm Duyệt để video chạy; Từ chối sẽ đưa vào hàng chờ hoàn tiền.</div>
      <div id="review-list"><div class="muted" style="margin-top:8px">—</div></div>
    </div>
    <div class="card">
      <strong>⏳ Video đang treo chờ bạn xử lý</strong>
      <div class="muted">Job gặp trục trặc phía hệ thống (thiếu API key, model sai, nhà cung cấp lỗi…). Khách CHỈ thấy "đang xử lý", tiền vẫn giữ. Sửa cấu hình rồi bấm "Thử lại ngay" — hoặc hệ thống tự thử lại định kỳ. Quá hạn sẽ tự hoàn tiền.</div>
      <div id="hold-list"><div class="muted" style="margin-top:8px">—</div></div>
    </div>
  </div>

  <div class="panel" id="panel-customers">
    <div class="card">
      <strong>🔎 Tra cứu khách hàng</strong>
      <div class="row"><input id="lookup-email" type="email" placeholder="email khách hàng"><button id="lookup-btn" class="primary">Tra cứu</button></div>
      <div id="lookup-result" class="muted" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <strong>💳 Cộng / trừ credits thủ công</strong>
      <div class="muted">Tặng khách, xử lý khiếu nại, hoặc trừ nhầm lẫn. Số âm để trừ.</div>
      <div class="row">
        <input id="adjust-email" type="email" placeholder="email khách">
        <input id="adjust-credits" type="number" placeholder="vd 500 hoặc -200">
        <input id="adjust-note" placeholder="ghi chú">
        <button id="adjust-btn" class="primary">Thực hiện</button>
      </div>
    </div>
    <div class="card">
      <strong>🔑 Cấp lại mật khẩu</strong>
      <div class="muted">Mật khẩu tạm hiện ở dòng trạng thái — gửi cho khách qua Zalo, nhắc khách đổi ngay.</div>
      <div class="row"><input id="reset-email" type="email" placeholder="email khách quên mật khẩu"><button id="reset-btn" class="primary">Cấp lại</button></div>
    </div>
  </div>

  <div class="panel" id="panel-settings">
    <div class="card">
      <strong>↩️ Chính sách hoàn tiền</strong>
      <div class="muted">Mặc định "Thủ công": video lỗi KHÔNG tự hoàn, bạn duyệt từng ca (có lợi cho bạn). "Tự động" sẽ hoàn ngay khi lỗi.</div>
      <div class="row">
        <select id="set-refund-policy">
          <option value="manual">Thủ công — bạn duyệt từng ca (khuyên dùng)</option>
          <option value="auto">Tự động — hoàn credits ngay khi video lỗi</option>
          <option value="off">Không hoàn — video lỗi KHÔNG trả credits (tiền mặt luôn giữ)</option>
        </select>
      </div>
    </div>
    <div class="card">
      <strong>💰 Giá bán video (markup lời)</strong>
      <div class="muted">GIÁ VIDEO = chi phí gốc × hệ số này. 1 = bán đúng giá gốc (không lời), 1.5 = cộng 50% lời, 2 = gấp đôi. Đây là cách chỉnh LỜI dễ nhất — đổi ngay, không cần sửa file/khởi động lại.</div>
      <div class="row">
        <input id="set-overhead-multiplier" type="number" step="0.05" min="1" max="50" placeholder="Hệ số giá (vd 1.5)">
        <input id="set-min-charge-credits" type="number" step="1" min="0" placeholder="Giá tối thiểu / video (credits)">
      </div>
    </div>
    <div class="card">
      <strong>💵 Giá redub / giá cũ (credits/giây)</strong>
      <div class="muted">Áp cho DỊCH/LỒNG TIẾNG (redub) và chế độ giá theo-giây cũ. Chi tiết chi phí gốc theo tier vẫn đặt trong .env (CINEJELLY_VIDEO_COST_USD_PER_SECOND_*); ô này KHÔNG đổi giá video (dùng ô "markup lời" ở trên).</div>
      <div class="row"><input id="set-credits-per-second" type="number" step="0.1" placeholder="credits / giây"></div>
      <div class="muted" style="margin-top:10px">Tỉ giá USD → VND (giá gói tính theo USD; số tiền khách chuyển = USD × tỉ giá):</div>
      <div class="row"><input id="set-usd-to-vnd" type="number" step="100" placeholder="ví dụ 27000"></div>
      <div class="muted" style="margin-top:6px">Hệ số theo chất lượng:</div>
      <div class="row">
        <input id="mult-draft" type="number" step="0.1" placeholder="draft (vd 0.6)">
        <input id="mult-standard" type="number" step="0.1" placeholder="standard (vd 1)">
        <input id="mult-high" type="number" step="0.1" placeholder="high (vd 1.5)">
        <input id="mult-ultimate" type="number" step="0.1" placeholder="ultimate (vd 2)">
      </div>
    </div>
    <div class="card">
      <strong>📡 Giá Atlas realtime</strong>
      <div class="muted">Bấm để đọc giá Atlas Cloud NGAY LÚC NÀY (giá gốc từng giây mỗi model + khuyến mãi đang chạy). Dùng để canh promo và chỉnh giá bán. Atlas không có API giá nên đây là đọc trực tiếp trang giá của họ — nếu đọc lỗi sẽ báo rõ, không bao giờ hiện số bịa.</div>
      <div class="row"><button id="check-atlas-pricing" class="primary">📡 Kiểm tra giá Atlas ngay</button></div>
      <div class="muted" id="atlas-pricing-status" style="margin-top:8px"></div>
      <div id="atlas-pricing-table" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <strong>📦 Gói nạp credits</strong>
      <div class="muted">Thêm / sửa / xoá gói. packageId chỉ gồm a-z, số, gạch.</div>
      <div id="package-editor"></div>
      <div class="row"><button id="add-package">➕ Thêm gói</button></div>
    </div>
    <div class="card">
      <strong>🏦 Thông tin chuyển khoản</strong>
      <div class="muted">Hiện cho khách khi nạp. Điền số tài khoản thật của bạn.</div>
      <textarea id="set-bank-info" placeholder="Vietcombank 0123456789 - NGUYEN VAN A. Nội dung: email của bạn."></textarea>
    </div>
    <div class="card">
      <strong>🤖 Model AI</strong>
      <div class="muted">Để trống = dùng mặc định trong .env. Chỉ đổi khi bạn biết model mới.</div>
      <div class="row"><input id="model-video" placeholder="Model video (Seedance)"></div>
      <div class="row"><input id="model-image" placeholder="Model ảnh (text-to-image)"><input id="model-image-reference" placeholder="Model ảnh tham chiếu (reference-to-image)"></div>
      <div class="row"><input id="model-llm" placeholder="Model CON MẮT (xem ảnh/video — LLM vision)"><input id="model-creative-llm" placeholder="Model NGƯỜI VIẾT kịch bản (nên dùng model mạnh)"></div>
      <div class="row"><input id="model-speech" placeholder="Model giọng nói"></div>
    </div>
    <div class="card">
      <strong>📣 Nội dung Studio khách thấy</strong>
      <div class="muted">Thông báo hiện đầu trang khách (khuyến mãi, lưu ý...). Ảnh nổi bật: dán handle upload:// (tải ảnh ở Studio rồi copy handle).</div>
      <textarea id="studio-announcement" placeholder="VD: Khuyến mãi Tết — nạp Gói Pro tặng thêm 20% credits!"></textarea>
      <div class="row"><input id="studio-images" placeholder="upload://... , upload://... (cách nhau bằng dấu phẩy)"></div>
    </div>
    <div class="card">
      <button id="save-settings" class="primary" style="width:100%">💾 Lưu toàn bộ cấu hình</button>
      <div class="muted" id="audit-line" style="margin-top:8px"></div>
    </div>
  </div>

  <div class="panel" id="panel-health">
    <div class="card">
      <strong>🩺 Sức khỏe hệ thống</strong>
      <div class="muted">Kiểm tra nhanh (chỉ đọc, không đổi gì): key/model Atlas còn dùng được không, cơ sở dữ liệu, ổ đĩa còn trống, ffmpeg. Nếu có ô ĐỎ, làm theo dòng "cách sửa" ngay dưới ô đó.</div>
      <div class="row"><button id="check-health" class="primary">🩺 Kiểm tra ngay</button></div>
      <div class="muted" id="health-status" style="margin-top:8px"></div>
      <div id="health-rows" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <strong>💳 Số dư Atlas (nhà cung cấp trả trước)</strong>
      <div class="muted" style="margin-top:6px">Atlas Cloud tính tiền TRẢ TRƯỚC — hệ thống KHÔNG đọc được số dư từ xa. <b>Hãy tự kiểm tra số dư trên trang Atlas định kỳ.</b> Dấu hiệu HẾT tiền: video khách <b>đột nhiên toàn báo lỗi / vào mục "Video đang treo"</b> ở tab Tiền dù mọi ô sức khỏe vẫn xanh → nạp thêm tiền vào tài khoản Atlas. Đặt cảnh báo số dư thấp ngay trên trang Atlas là tốt nhất.</div>
    </div>
  </div>

  <script>
    var KEY_STORAGE = "cinejelly_admin_key";
    var keyInput = document.getElementById("admin-key");
    var statusBox = document.getElementById("status");
    var currentSettings = null;
    try { keyInput.value = localStorage.getItem(KEY_STORAGE) || ""; } catch (e) {}
    keyInput.addEventListener("change", function () {
      try { if (keyInput.value.trim()) localStorage.setItem(KEY_STORAGE, keyInput.value.trim()); } catch (e) {}
    });
    document.getElementById("forget-btn").addEventListener("click", function () {
      try { localStorage.removeItem(KEY_STORAGE); } catch (e) {}
      keyInput.value = "";
      say("Đã xoá khóa khỏi máy này.", true);
    });
    function say(message, ok) { statusBox.textContent = message; statusBox.className = "status " + (ok ? "ok" : "bad"); }
    function headers() { return { "Content-Type": "application/json", "X-CineJelly-Api-Key": keyInput.value.trim() }; }
    function vnd(n) { return (n || 0).toLocaleString("vi-VN"); }

    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
        document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
        tab.classList.add("active");
        document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
      });
    });

    async function loadAll() {
      if (!keyInput.value.trim()) { say("Dán khóa quản trị trước.", false); return; }
      await Promise.all([loadTopups(), loadRefunds(), loadReviewQueue(), loadOperatorHolds(), loadRevenue(), loadSettings()]);
      say("Đã tải dữ liệu.", true);
    }

    function renderQueue(boxId, items, emptyText, buildRow) {
      var box = document.getElementById(boxId);
      box.innerHTML = "";
      if (!items || items.length === 0) {
        var empty = document.createElement("div");
        empty.className = "muted"; empty.style.marginTop = "8px"; empty.textContent = emptyText;
        box.appendChild(empty);
        return;
      }
      items.forEach(function (item) { box.appendChild(buildRow(item)); });
    }
    function actionRow(labelInfo, subInfo, buttons) {
      var row = document.createElement("div"); row.className = "item";
      var info = document.createElement("div");
      var strong = document.createElement("strong"); strong.textContent = labelInfo;
      var note = document.createElement("div"); note.className = "muted"; note.textContent = subInfo;
      info.appendChild(strong); info.appendChild(note);
      var actions = document.createElement("div"); actions.className = "row";
      buttons.forEach(function (b) {
        var btn = document.createElement("button"); btn.className = b.cls; btn.textContent = b.text;
        btn.addEventListener("click", b.onClick); actions.appendChild(btn);
      });
      row.appendChild(info); row.appendChild(actions);
      return row;
    }

    // Action-awareness badge (MVP audit A1): the owner must SEE waiting work — pending top-ups, refund
    // requests, videos to review, stuck jobs — without scrolling, or paid customers wait unseen.
    var pendingCounts = { topups: 0, refunds: 0, review: 0, holds: 0 };
    function updateMoneyBadge() {
      var total = pendingCounts.topups + pendingCounts.refunds + pendingCounts.review + pendingCounts.holds;
      var badge = document.getElementById("badge-money");
      if (!badge) { return; }
      if (total > 0) { badge.textContent = String(total); badge.style.display = "inline-block"; document.title = "(" + total + ") CineJelly Quản trị"; }
      else { badge.style.display = "none"; document.title = "CineJelly Quản trị"; }
    }
    async function loadTopups() {
      var res = await fetch("/v1/admin/topups", { headers: headers() });
      if (!res.ok) { say((await res.json()).error || "Không tải được.", false); return; }
      var payload = await res.json();
      pendingCounts.topups = (payload.pending || []).length; updateMoneyBadge();
      renderQueue("topup-list", payload.pending, "Không có yêu cầu nạp nào. 🎉", function (t) {
        return actionRow(
          t.email + " — " + vnd(t.credits) + " credits (" + vnd(t.amountVnd) + "đ)",
          (t.userNote ? "Ghi chú: " + t.userNote + " • " : "") + new Date(t.requestedAt).toLocaleString("vi-VN"),
          [
            { cls: "approve", text: "✅ Duyệt", onClick: function () { decideTopup(t.topupId, true); } },
            { cls: "reject", text: "❌ Từ chối", onClick: function () { decideTopup(t.topupId, false); } }
          ]
        );
      });
    }
    async function decideTopup(topupId, approve) {
      var res = await fetch("/v1/admin/topups/decide", { method: "POST", headers: headers(), body: JSON.stringify({ topupId: topupId, approve: approve }) });
      var payload = await res.json();
      if (!res.ok) { say(payload.error || "Lỗi.", false); return; }
      say(approve ? "Đã duyệt — credits đã cộng." : "Đã từ chối.", true);
      loadTopups(); loadRevenue();
    }

    async function loadRefunds() {
      var res = await fetch("/v1/admin/refunds", { headers: headers() });
      if (!res.ok) { return; }
      var payload = await res.json();
      pendingCounts.refunds = (payload.pending || []).length; updateMoneyBadge();
      renderQueue("refund-list", payload.pending, "Không có yêu cầu hoàn tiền nào. 🎉", function (r) {
        return actionRow(
          r.email + " — hoàn " + vnd(Math.abs(r.credits)) + " credits",
          "Lý do: " + r.reason + " • " + r.jobId,
          [
            { cls: "approve", text: "✅ Hoàn tiền", onClick: function () { decideRefund(r.refundRequestId, true); } },
            { cls: "reject", text: "🚫 Không hoàn", onClick: function () { decideRefund(r.refundRequestId, false); } }
          ]
        );
      });
    }
    async function decideRefund(refundRequestId, approve) {
      var res = await fetch("/v1/admin/refunds/decide", { method: "POST", headers: headers(), body: JSON.stringify({ refundRequestId: refundRequestId, approve: approve }) });
      var payload = await res.json();
      if (!res.ok) { say(payload.error || "Lỗi.", false); return; }
      say(approve ? "Đã hoàn credits cho khách." : "Đã từ chối hoàn (giữ nguyên credits).", true);
      loadRefunds();
    }

    async function loadReviewQueue() {
      var res = await fetch("/v1/render-jobs", { headers: headers() });
      if (!res.ok) { return; }
      var payload = await res.json();
      var paused = (payload.jobs || []).filter(function (j) { return j.status === "paused_for_review"; });
      pendingCounts.review = paused.length; updateMoneyBadge();
      renderQueue("review-list", paused, "Không có video nào chờ duyệt. 🎉", function (j) {
        return actionRow(
          (j.userInputPreview || j.jobId).slice(0, 90),
          j.jobId + " • " + new Date(j.createdAt).toLocaleString("vi-VN"),
          [
            { cls: "approve", text: "✅ Duyệt chạy", onClick: function () { decideReview(j.jobId, "approved"); } },
            { cls: "reject", text: "❌ Từ chối", onClick: function () { decideReview(j.jobId, "rejected"); } }
          ]
        );
      });
    }
    async function decideReview(jobId, decision) {
      var detailRes = await fetch("/v1/render-jobs/" + encodeURIComponent(jobId), { headers: headers() });
      var detail = await detailRes.json();
      if (!detailRes.ok) { say(detail.error || "Không tải được job.", false); return; }
      var report = detail.preRenderReviewApproval || detail.reviewApproval;
      var reviewedAt = new Date().toISOString();
      var checkpoints = ((report && report.checkpoints) || []).map(function (c) {
        return { surface: c.surface, label: c.label, subjectId: c.subjectId, required: c.required !== false, decision: decision, reviewer: "operator-desk", reviewedAt: reviewedAt, notes: decision === "approved" ? "duyet" : "tu choi" };
      });
      if (checkpoints.length === 0) { say("Job không có checkpoint để quyết định.", false); return; }
      var res = await fetch("/v1/render-jobs/" + encodeURIComponent(jobId) + "/review", { method: "POST", headers: headers(), body: JSON.stringify({ gate: (report && report.gate) || "pre_render", checkpoints: checkpoints }) });
      var payload = await res.json();
      if (!res.ok) { say(payload.error || "Lỗi.", false); return; }
      say(decision === "approved" ? "Đã duyệt — video chạy." : "Đã từ chối — vào hàng chờ hoàn tiền.", true);
      loadReviewQueue(); loadRefunds();
    }

    async function loadOperatorHolds() {
      var res = await fetch("/v1/admin/operator-holds", { headers: headers() });
      if (!res.ok) { return; }
      var payload = await res.json();
      pendingCounts.holds = (payload.holds || []).length; updateMoneyBadge();
      renderQueue("hold-list", payload.holds, "Không có video nào đang treo. 🎉", function (j) {
        var reason = j.operatorHoldReason || "Cấu hình hệ thống chưa đủ.";
        var attempts = j.operatorHoldAttempts ? " • đã thử " + j.operatorHoldAttempts + " lần" : "";
        return actionRow(
          (j.userInputPreview || j.jobId).slice(0, 80),
          "⚠️ " + reason + attempts + " • " + j.jobId,
          [
            { cls: "approve", text: "🔄 Thử lại ngay", onClick: function () { retryHold(j.jobId); } },
            { cls: "reject", text: "🚫 Hủy & hoàn tiền", onClick: function () { cancelHold(j.jobId); } }
          ]
        );
      });
    }
    async function retryHold(jobId) {
      var res = await fetch("/v1/admin/operator-holds/retry", { method: "POST", headers: headers(), body: JSON.stringify({ jobId: jobId }) });
      var payload = await res.json();
      if (!res.ok) { say(payload.error || "Không thử lại được.", false); return; }
      say(payload.requeued > 0 ? "Đã cho chạy lại. Nếu cấu hình đã đúng, video sẽ hoàn thành." : "Job không còn ở trạng thái treo.", true);
      loadOperatorHolds();
    }
    async function cancelHold(jobId) {
      var res = await fetch("/v1/render-jobs/" + encodeURIComponent(jobId), { method: "DELETE", headers: headers() });
      var payload = await res.json();
      if (!res.ok) { say(payload.error || "Không hủy được.", false); return; }
      say("Đã hủy — khách được hoàn tiền (theo chính sách hiện tại).", true);
      loadOperatorHolds(); loadRefunds();
    }

    async function loadRevenue() {
      var res = await fetch("/v1/admin/revenue-summary", { headers: headers() });
      if (!res.ok) { return; }
      var r = (await res.json()).revenue || {};
      var box = document.getElementById("revenue-kpi");
      box.innerHTML = "";
      var kpis = [
        ["Khách hàng", vnd(r.customerCount)],
        ["Lượt nạp đã duyệt", vnd(r.approvedTopupCount)],
        ["Doanh thu", vnd(r.totalRevenueVnd) + "đ"],
        ["Credits đã bán", vnd(r.totalCreditsSold)],
        ["Đang nợ khách", vnd(r.outstandingCreditsLiability) + " credits"]
      ];
      kpis.forEach(function (k) {
        var d = document.createElement("div");
        var s = document.createElement("strong"); s.textContent = k[1];
        var m = document.createElement("div"); m.className = "muted"; m.textContent = k[0];
        d.appendChild(s); d.appendChild(m); box.appendChild(d);
      });
    }

    document.getElementById("lookup-btn").addEventListener("click", async function () {
      var email = document.getElementById("lookup-email").value.trim();
      if (!email) { say("Nhập email khách trước.", false); return; }
      var res = await fetch("/v1/admin/accounts/lookup?email=" + encodeURIComponent(email), { headers: headers() });
      var payload = await res.json();
      if (!res.ok) { say(payload.error || "Không tra cứu được.", false); return; }
      var lines = ["Số dư: " + vnd(payload.account.balanceCredits) + " credits (" + payload.account.displayName + ")"];
      (payload.statement || []).slice(0, 8).forEach(function (e) {
        lines.push(new Date(e.at).toLocaleString("vi-VN") + " — " + (e.credits > 0 ? "+" : "") + e.credits + ": " + e.note);
      });
      document.getElementById("lookup-result").textContent = lines.join("\n");
      say("Đã tra cứu " + email + ".", true);
    });
    document.getElementById("adjust-btn").addEventListener("click", async function () {
      var res = await fetch("/v1/admin/credits/adjust", { method: "POST", headers: headers(), body: JSON.stringify({ email: document.getElementById("adjust-email").value.trim(), credits: Number(document.getElementById("adjust-credits").value), note: document.getElementById("adjust-note").value.trim() }) });
      var payload = await res.json();
      if (!res.ok) { say(payload.error || "Lỗi.", false); return; }
      say("Xong — số dư mới: " + vnd(payload.account.balanceCredits) + " credits.", true);
    });
    document.getElementById("reset-btn").addEventListener("click", async function () {
      var email = document.getElementById("reset-email").value.trim();
      if (!email) { say("Nhập email khách trước.", false); return; }
      var res = await fetch("/v1/admin/accounts/reset-password", { method: "POST", headers: headers(), body: JSON.stringify({ email: email }) });
      var payload = await res.json();
      if (!res.ok) { say(payload.error || "Lỗi.", false); return; }
      say("Mật khẩu tạm của " + email + ": " + (res.headers.get("X-CineJelly-Temporary-Password") || "") + " — gửi cho khách, nhắc đổi ngay.", true);
    });

    async function loadSettings() {
      var res = await fetch("/v1/admin/settings", { headers: headers() });
      if (!res.ok) { return; }
      currentSettings = (await res.json()).settings;
      document.getElementById("set-refund-policy").value = currentSettings.refundPolicy;
      document.getElementById("set-credits-per-second").value = currentSettings.pricing.creditsPerRenderSecond;
      document.getElementById("set-usd-to-vnd").value = currentSettings.usdToVnd || 27000;
      var pc = currentSettings.pipelineCost || {};
      if (pc.overheadMultiplier !== undefined) { document.getElementById("set-overhead-multiplier").value = pc.overheadMultiplier; }
      if (pc.minimumChargeCredits !== undefined) { document.getElementById("set-min-charge-credits").value = pc.minimumChargeCredits; }
      var mult = currentSettings.pricing.qualityMultipliers || {};
      ["draft", "standard", "high", "ultimate"].forEach(function (q) {
        var el = document.getElementById("mult-" + q);
        if (mult[q] !== undefined) { el.value = mult[q]; }
      });
      document.getElementById("set-bank-info").value = currentSettings.topupBankInfo || "";
      document.getElementById("model-video").value = (currentSettings.models && currentSettings.models.videoModel) || "";
      document.getElementById("model-image").value = (currentSettings.models && currentSettings.models.imageModel) || "";
      document.getElementById("model-image-reference").value = (currentSettings.models && currentSettings.models.imageReferenceModel) || "";
      document.getElementById("model-llm").value = (currentSettings.models && currentSettings.models.llmModel) || "";
      document.getElementById("model-creative-llm").value = (currentSettings.models && currentSettings.models.creativeLlmModel) || "";
      document.getElementById("model-speech").value = (currentSettings.models && currentSettings.models.speechModel) || "";
      document.getElementById("studio-announcement").value = (currentSettings.studio && currentSettings.studio.announcement) || "";
      document.getElementById("studio-images").value = ((currentSettings.studio && currentSettings.studio.featuredImages) || []).join(", ");
      renderPackages(currentSettings.packages || []);
      var audit = (currentSettings.auditTrail || [])[0];
      document.getElementById("audit-line").textContent = audit ? ("Sửa gần nhất: " + new Date(audit.at).toLocaleString("vi-VN") + " — " + audit.detail) : "";
    }
    function renderPackages(packages) {
      var editor = document.getElementById("package-editor");
      editor.innerHTML = "";
      packages.forEach(function (pkg) { editor.appendChild(packageRow(pkg)); });
    }
    function packageRow(pkg) {
      var row = document.createElement("div"); row.className = "pkg-row";
      function inp(val, ph) { var i = document.createElement("input"); i.value = val == null ? "" : val; i.placeholder = ph; return i; }
      var id = inp(pkg.packageId, "packageId"); id.dataset.f = "packageId";
      var label = inp(pkg.label, "Tên gói"); label.dataset.f = "label";
      var credits = inp(pkg.credits, "credits"); credits.type = "number"; credits.dataset.f = "credits";
      var price = inp(pkg.priceUsd, "giá USD"); price.type = "number"; price.step = "0.01"; price.dataset.f = "priceUsd";
      price.title = "Giá theo USD. Số tiền VND khách chuyển = USD × tỉ giá.";
      // Customer-facing marketing/notice line (e.g. "PHỔ BIẾN NHẤT • rẻ hơn ~12%/credit"). Must be an
      // EDITABLE field so a Settings save preserves it via the input collector instead of silently
      // dropping it — otherwise any unrelated save erases every package's bonusNote (finding F5).
      var note = inp(pkg.bonusNote, "ghi chú khuyến mãi (khách thấy)"); note.dataset.f = "bonusNote";
      note.title = "Dòng khuyến mãi hiển thị cho khách cạnh giá gói.";
      var del = document.createElement("button"); del.className = "del"; del.textContent = "🗑"; del.addEventListener("click", function () { row.remove(); });
      // Preserve the anti-farm once-per-account flag across edits (carried invisibly; the server
      // also protects known trial IDs so this can never silently re-open the trial).
      if (pkg.oncePerAccount) { row.dataset.once = "1"; label.title = "Gói dùng thử 1 lần/tài khoản (chống farm)"; }
      row.appendChild(id); row.appendChild(label); row.appendChild(credits); row.appendChild(price); row.appendChild(note); row.appendChild(del);
      return row;
    }
    document.getElementById("add-package").addEventListener("click", function () {
      document.getElementById("package-editor").appendChild(packageRow({ packageId: "", label: "", credits: 0, priceUsd: 0 }));
    });
    function fmtUsd(n) {
      if (n === null || n === undefined || isNaN(n)) { return "—"; }
      var s = Number(n).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
      return "$" + s;
    }
    function creditValueUsd() {
      // Cheapest $/credit across packages = best-value pack for the customer = worst-case (lowest) margin.
      if (!currentSettings || !currentSettings.packages) { return null; }
      var best = null;
      currentSettings.packages.forEach(function (p) {
        if (p && p.credits > 0 && typeof p.priceUsd === "number") {
          var per = p.priceUsd / p.credits;
          if (best === null || per < best) { best = per; }
        }
      });
      return best;
    }
    function atlasRowOf(cells, isHeader) {
      var tr = document.createElement("tr");
      cells.forEach(function (c) {
        var el = document.createElement(isHeader ? "th" : "td");
        el.textContent = c;
        tr.appendChild(el);
      });
      return tr;
    }
    function renderAtlasPricing(payload, tableEl, statusEl) {
      var models = (payload.models || []).slice();
      models.sort(function (a, b) { return (b.perSecond ? 1 : 0) - (a.perSecond ? 1 : 0); });
      var cvu = creditValueUsd();
      var perSec = (currentSettings && currentSettings.pricing) ? currentSettings.pricing.creditsPerRenderSecond : null;
      var retailPerSec = (cvu !== null && perSec !== null && perSec !== undefined) ? cvu * perSec : null;
      var when = new Date(payload.fetchedAtIso || Date.now());
      statusEl.textContent = "Cập nhật lúc " + when.toLocaleString("vi-VN") + " • " + models.length + " model"
        + (retailPerSec !== null ? (" • Bạn đang bán ~" + fmtUsd(retailPerSec) + "/giây") : "");
      var table = document.createElement("table"); table.className = "atlas-price-table";
      var thead = document.createElement("thead");
      thead.appendChild(atlasRowOf(["Model", "Đơn vị", "Giá gốc", "KM", "Giá Atlas", "Lãi vs giá bán"], true));
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      models.forEach(function (m) {
        var marginCell = "—";
        if (m.perSecond && retailPerSec !== null && m.ourPriceUsd > 0) {
          marginCell = "×" + (retailPerSec / m.ourPriceUsd).toFixed(1);
        }
        var discount = m.discountPercent ? ("-" + m.discountPercent + "%") : "—";
        // Flag a row whose list/discount/price figures disagree — don't retune off a suspect number.
        var priceCell = (m.rawOurPrice || fmtUsd(m.ourPriceUsd)) + (m.discountConsistent === false ? " ⚠" : "");
        tbody.appendChild(atlasRowOf([
          m.name,
          m.unit || "—",
          m.rawStandardPrice || "—",
          discount,
          priceCell,
          marginCell
        ], false));
      });
      table.appendChild(tbody);
      tableEl.innerHTML = "";
      // Partial-parse warning: some cards were detected but their price couldn't be read, so the
      // table is incomplete — say so instead of letting the operator price off a short list.
      if (payload.incompletePriceCount && payload.incompletePriceCount > 0) {
        var warn = document.createElement("div");
        warn.className = "muted"; warn.style.color = "#f59e0b"; warn.style.marginBottom = "6px";
        warn.textContent = "⚠ " + payload.incompletePriceCount + " model không đọc được giá (Atlas có thể đã đổi giao diện). Mở trang giá Atlas để đối chiếu.";
        tableEl.appendChild(warn);
      }
      tableEl.appendChild(table);
      var note = document.createElement("div"); note.className = "muted"; note.style.marginTop = "6px";
      note.textContent = "Lãi = giá bán của bạn ÷ giá Atlas (tính theo gói credit rẻ nhất → mức lãi thấp nhất). Khi bật giá pipeline (mặc định), GIÁ VIDEO chỉnh trong .env (CINEJELLY_VIDEO_COST_USD_PER_SECOND_* / overhead / basis) rồi khởi động lại — ô 'credits/giây' chỉ đổi giá redub.";
      tableEl.appendChild(note);
    }
    document.getElementById("check-atlas-pricing").addEventListener("click", async function () {
      var statusEl = document.getElementById("atlas-pricing-status");
      var tableEl = document.getElementById("atlas-pricing-table");
      if (!keyInput.value.trim()) { say("Dán khóa quản trị trước.", false); return; }
      statusEl.textContent = "Đang đọc giá Atlas ngay lúc này...";
      tableEl.innerHTML = "";
      var res;
      try {
        res = await fetch("/v1/admin/atlas-pricing", { headers: headers() });
      } catch (e) {
        statusEl.textContent = "Lỗi mạng khi đọc giá Atlas.";
        return;
      }
      var payload = await res.json();
      if (!res.ok) {
        statusEl.innerHTML = "";
        var msg = document.createElement("span");
        msg.textContent = (payload.error || "Không đọc được giá Atlas.") + " ";
        var a = document.createElement("a");
        a.href = payload.sourceUrl || "https://www.atlascloud.ai/pricing/models";
        a.target = "_blank"; a.rel = "noopener"; a.textContent = "Mở trang giá Atlas ↗";
        statusEl.appendChild(msg); statusEl.appendChild(a);
        return;
      }
      renderAtlasPricing(payload, tableEl, statusEl);
    });
    document.getElementById("check-health").addEventListener("click", async function () {
      var statusEl = document.getElementById("health-status");
      var rowsEl = document.getElementById("health-rows");
      if (!keyInput.value.trim()) { say("Dán khóa quản trị trước.", false); return; }
      statusEl.textContent = "Đang kiểm tra sức khỏe hệ thống (gọi thử Atlas không tốn tiền)...";
      rowsEl.innerHTML = "";
      var res;
      try {
        res = await fetch("/v1/admin/system-health", { headers: headers() });
      } catch (e) {
        statusEl.textContent = "Lỗi mạng khi kiểm tra.";
        return;
      }
      var payload = await res.json();
      if (!res.ok) {
        statusEl.textContent = (payload.error || "Không kiểm tra được — cần dán đúng khóa quản trị.");
        return;
      }
      statusEl.textContent = payload.overall === "ok"
        ? "✅ Mọi thứ ổn — sẵn sàng mời khách."
        : payload.overall === "warn"
          ? "⚠️ Có mục cần lưu ý (xem bên dưới)."
          : "❌ Có VẤN ĐỀ cần sửa trước khi mời khách (xem ô ĐỎ bên dưới).";
      (payload.rows || []).forEach(function (row) {
        var color = row.status === "ok" ? "#2e7d32" : (row.status === "warn" ? "#ef6c00" : "#c62828");
        var card = document.createElement("div");
        card.style.padding = "8px"; card.style.marginTop = "6px"; card.style.borderRadius = "8px";
        card.style.borderLeft = "4px solid " + color; card.style.background = "rgba(127,127,127,0.08)";
        var head = document.createElement("div");
        head.style.fontWeight = "600";
        head.textContent = (row.status === "ok" ? "✅ " : (row.status === "warn" ? "⚠️ " : "❌ ")) + row.label;
        var body = document.createElement("div");
        body.className = "muted"; body.style.marginTop = "2px"; body.textContent = row.message;
        card.appendChild(head); card.appendChild(body);
        rowsEl.appendChild(card);
      });
    });
    document.getElementById("save-settings").addEventListener("click", async function () {
      var packages = [];
      document.querySelectorAll("#package-editor .pkg-row").forEach(function (row) {
        var pkg = {};
        row.querySelectorAll("input").forEach(function (i) {
          pkg[i.dataset.f] = (i.type === "number") ? Number(i.value) : i.value.trim();
        });
        if (row.dataset.once === "1") { pkg.oncePerAccount = true; }
        packages.push(pkg);
      });
      var multipliers = {};
      ["draft", "standard", "high", "ultimate"].forEach(function (q) {
        var v = document.getElementById("mult-" + q).value;
        if (v !== "") { multipliers[q] = Number(v); }
      });
      var images = document.getElementById("studio-images").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var overheadVal = document.getElementById("set-overhead-multiplier").value;
      var minChargeVal = document.getElementById("set-min-charge-credits").value;
      var pipelineCost = {};
      if (overheadVal !== "") { pipelineCost.overheadMultiplier = Number(overheadVal); }
      if (minChargeVal !== "") { pipelineCost.minimumChargeCredits = Number(minChargeVal); }
      var patch = {
        refundPolicy: document.getElementById("set-refund-policy").value,
        creditsPerRenderSecond: Number(document.getElementById("set-credits-per-second").value),
        usdToVnd: Number(document.getElementById("set-usd-to-vnd").value),
        qualityMultipliers: multipliers,
        ...(Object.keys(pipelineCost).length ? { pipelineCost: pipelineCost } : {}),
        packages: packages,
        topupBankInfo: document.getElementById("set-bank-info").value.trim(),
        models: {
          videoModel: document.getElementById("model-video").value.trim(),
          imageModel: document.getElementById("model-image").value.trim(),
          imageReferenceModel: document.getElementById("model-image-reference").value.trim(),
          llmModel: document.getElementById("model-llm").value.trim(),
          creativeLlmModel: document.getElementById("model-creative-llm").value.trim(),
          speechModel: document.getElementById("model-speech").value.trim()
        },
        studio: {
          announcement: document.getElementById("studio-announcement").value.trim(),
          featuredImages: images
        }
      };
      var res = await fetch("/v1/admin/settings", { method: "PUT", headers: headers(), body: JSON.stringify(patch) });
      var payload = await res.json();
      if (!res.ok) { say(payload.error || "Không lưu được.", false); return; }
      currentSettings = payload.settings;
      say("✅ Đã lưu cấu hình. Áp dụng ngay cho các video và lượt nạp tiếp theo.", true);
      loadSettings();
    });

    document.getElementById("load-btn").addEventListener("click", loadAll);
    setInterval(function () { if (keyInput.value.trim()) { loadTopups(); loadRefunds(); loadReviewQueue(); loadOperatorHolds(); } }, 60000);
  </script>
</body>
</html>`;
}
