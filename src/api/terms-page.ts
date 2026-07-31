/**
 * Customer-facing Terms of Service + refund policy page (Vietnamese-first).
 *
 * A commercial platform that takes bank-transfer top-ups needs the purchase terms visible BEFORE
 * payment: what a credit buys, when a failed render is refunded, what the platform will not make,
 * and the hard product limits (single video length ceiling, retention window). Without it the
 * operator carries avoidable dispute/chargeback exposure, and customers have no written answer to
 * "my video failed — do I get my money back?".
 *
 * Deliberately a plain static page with zero secrets and zero customer data: it is served without
 * authentication so a prospective buyer can read it before registering, and it never renders any
 * request input (no injection surface). Operator-configurable values (support contact, refund
 * policy, retention days, duration ceiling) are read from the environment at render time so the
 * page can never drift from how the system is actually configured.
 */

import { productName } from "../config/product-identity.js";

const MAX_VIDEO_SECONDS = 480;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface TermsPageOptions {
  /** Operator support channel (Zalo/phone/email) — the customer's route for refunds and disputes. */
  readonly supportContact?: string;
  /** "auto" | "manual" | "off" — how a failed render's credits are handled. */
  readonly refundPolicy?: string;
  /** Days a finished video stays downloadable; 0/undefined = kept until the operator removes it. */
  readonly outputRetentionDays?: number;
}

export function renderTermsPage(options: TermsPageOptions = {}): string {
  const brand = escapeHtml(productName());
  const support = options.supportContact?.trim()
    ? escapeHtml(options.supportContact.trim())
    : "người bán (chủ hệ thống)";
  const refundPolicy = (options.refundPolicy ?? "manual").trim().toLowerCase();
  const refundLine = refundPolicy === "auto"
    ? "Nếu video lỗi do hệ thống, credits được <strong>hoàn tự động</strong> vào tài khoản của bạn."
    : refundPolicy === "off"
      ? "Nếu video lỗi, vui lòng liên hệ hỗ trợ để được xem xét từng trường hợp."
      : "Nếu video lỗi do hệ thống, yêu cầu hoàn credits được <strong>gửi tới đội ngũ xem xét</strong> và hoàn trong thời gian sớm nhất.";
  const retentionDays = Number.isFinite(options.outputRetentionDays) ? Number(options.outputRetentionDays) : 0;
  const retentionLine = retentionDays > 0
    ? `Video đã tạo được lưu để tải về trong <strong>${retentionDays} ngày</strong>. Vui lòng tải và lưu bản của bạn trong thời gian này.`
    : "Video đã tạo được lưu để tải về cho tới khi bạn hoặc chúng tôi chủ động xoá. Bạn vẫn nên tải bản của mình về máy.";

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Điều khoản sử dụng &amp; Chính sách hoàn tiền — ${brand}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height:1.65;
         background:#f7f7f8; color:#16181d; }
  @media (prefers-color-scheme: dark) { body { background:#111317; color:#e8eaed; } .card { background:#191c22 !important; border-color:#2a2f38 !important; } }
  .wrap { max-width: 820px; margin: 0 auto; padding: 32px 20px 72px; }
  .card { background:#fff; border:1px solid #e3e5e9; border-radius:14px; padding:24px; margin-bottom:18px; }
  h1 { font-size:24px; margin:0 0 6px; }
  h2 { font-size:17px; margin:22px 0 8px; }
  .muted { opacity:.7; font-size:13px; }
  ul { padding-left:20px; margin:8px 0; }
  li { margin:5px 0; }
  a { color:#3b6ef0; }
  .back { display:inline-block; margin-top:10px; font-size:14px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>Điều khoản sử dụng &amp; Chính sách hoàn tiền</h1>
    <div class="muted">Vui lòng đọc trước khi nạp tiền và tạo video.</div>
  </div>

  <div class="card">
    <h2>1. Dịch vụ</h2>
    <p>${brand} tạo video bằng trí tuệ nhân tạo từ mô tả, ảnh và thiết lập bạn cung cấp. Kết quả do mô hình AI sinh ra nên <strong>có thể khác nhau giữa các lần tạo</strong> và không đảm bảo giống hệt hình dung của bạn.</p>
    <h2>2. Credits và thanh toán</h2>
    <ul>
      <li>Bạn nạp tiền để nhận <strong>credits</strong>; mỗi lần tạo video sẽ trừ credits theo báo giá hiển thị <em>trước</em> khi bạn xác nhận.</li>
      <li>Credits được trừ ngay khi bạn xác nhận tạo video, vì hệ thống bắt đầu tính phí với nhà cung cấp AI ngay lúc đó.</li>
      <li>Credits không phải là tiền mặt và không quy đổi ngược thành tiền, trừ trường hợp hoàn do lỗi hệ thống nêu ở mục 3.</li>
    </ul>
    <h2>3. Khi video bị lỗi</h2>
    <p>${refundLine}</p>
    <p class="muted">Lưu ý: video đã tạo ra thành công nhưng bạn <em>không hài lòng về ý tưởng/thẩm mỹ</em> không thuộc diện hoàn credits — bạn có thể chỉnh mô tả và tạo lại.</p>
    <h2>4. Giới hạn sản phẩm</h2>
    <ul>
      <li>Độ dài tối đa của một video là <strong>${MAX_VIDEO_SECONDS} giây (8 phút)</strong>. Nội dung dài hơn cần chia thành nhiều video/nhiều tập.</li>
      <li>${retentionLine}</li>
      <li>Thời gian tạo video phụ thuộc nhà cung cấp AI và có thể kéo dài hơn dự kiến khi hệ thống bận.</li>
    </ul>
    <h2>5. Nội dung bị cấm</h2>
    <p>Bạn cam kết không dùng dịch vụ để tạo: nội dung tình dục liên quan trẻ em, nội dung khiêu dâm, bạo lực đẫm máu, khủng bố, hàng cấm, hoặc nội dung vi phạm pháp luật Việt Nam. Yêu cầu vi phạm sẽ bị từ chối và có thể dẫn tới khoá tài khoản không hoàn credits.</p>
    <h2>6. Quyền với nội dung bạn tải lên</h2>
    <p>Bạn chịu trách nhiệm về quyền sử dụng ảnh, video, nhạc, thương hiệu và hình ảnh cá nhân mà bạn tải lên. Bạn cam kết có quyền hợp pháp với các tài sản đó và không sử dụng hình ảnh người khác khi chưa được phép.</p>
    <h2>7. Quyền với video tạo ra</h2>
    <p>Video do bạn tạo thuộc về bạn sử dụng cho mục đích của bạn. Chúng tôi có thể lưu bản sao kỹ thuật phục vụ vận hành và hỗ trợ.</p>
    <h2>8. Giới hạn trách nhiệm</h2>
    <p>Dịch vụ được cung cấp trên cơ sở hiện có. Trách nhiệm tối đa của chúng tôi trong mọi trường hợp giới hạn ở số credits bạn đã chi cho lần tạo video liên quan.</p>
    <h2>9. Liên hệ &amp; khiếu nại</h2>
    <p>Mọi vấn đề về nạp tiền, hoàn credits, quên mật khẩu hoặc khiếu nại, vui lòng liên hệ: <strong>${support}</strong>.</p>
  </div>

  <div class="card">
    <div class="muted">Điều khoản có thể được cập nhật; bản hiển thị tại trang này là bản đang áp dụng.</div>
    <a class="back" href="/short/create">← Quay lại tạo video</a>
  </div>
</div>
</body>
</html>`;
}
