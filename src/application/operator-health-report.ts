/**
 * Turns the raw preflight + live-Atlas + database signals into a short, plain-Vietnamese health report
 * for the operator "🩺 Sức khỏe hệ thống" tab — each row is a green/amber/red status with a concrete
 * "cách sửa". Pure (no network / no I/O): the caller gathers the inputs (preflight run, the no-spend
 * Atlas probe, the DB flags) and passes them here, so this is fully testable. It intentionally exposes
 * only STATUS, never secret values (no API key, no DB URL).
 */

export type OperatorHealthStatus = "ok" | "warn" | "fail";

export interface OperatorHealthRow {
  readonly key: string;
  readonly label: string;
  readonly status: OperatorHealthStatus;
  readonly message: string;
}

export interface OperatorHealthReport {
  readonly overall: OperatorHealthStatus;
  readonly rows: readonly OperatorHealthRow[];
  readonly checkedAt: string;
}

interface PreflightCheckLike {
  readonly name: string;
  readonly status: "pass" | "warn" | "fail";
  readonly message: string;
}

interface AtlasProbeLike {
  readonly keyAuthFailed: boolean;
  readonly missing: readonly { readonly field: string; readonly modelId: string }[];
  readonly probeSkipped: boolean;
  readonly checkedModelCount: number;
}

const RANK: Record<OperatorHealthStatus, number> = { ok: 0, warn: 1, fail: 2 };

export function buildOperatorHealthReport(input: {
  readonly preflightChecks: readonly PreflightCheckLike[];
  readonly atlas: AtlasProbeLike | undefined;
  readonly hasApiKey: boolean;
  readonly databaseUnreachable: boolean;
  readonly orphanedAccountCount: number;
  /** True when CINEJELLY_TOPUP_BANK_INFO is empty or still the unfilled placeholder — the money path
   * is silently blocked (customers can't top up) while everything else looks green (deploy audit A4). */
  readonly bankInfoMissing?: boolean;
  readonly nowIso: string;
}): OperatorHealthReport {
  const byName = new Map(input.preflightChecks.map((check) => [check.name, check]));
  const rows: OperatorHealthRow[] = [];

  // 1. Atlas key + models — the thing that most often "looks fine but isn't".
  if (!input.hasApiKey) {
    rows.push({ key: "atlas", label: "Key + Model Atlas", status: "fail", message: "Chưa có ATLASCLOUD_API_KEY — điền key Atlas thật vào .env rồi khởi động lại. Không có key, khách tạo video sẽ lỗi." });
  } else if (!input.atlas) {
    rows.push({ key: "atlas", label: "Key + Model Atlas", status: "warn", message: "Chưa kiểm tra được key/model trực tiếp (thiếu mạng?). Bấm kiểm tra lại khi có mạng." });
  } else if (input.atlas.keyAuthFailed) {
    rows.push({ key: "atlas", label: "Key + Model Atlas", status: "fail", message: "Key Atlas SAI hoặc HẾT HẠN — vào Atlas Cloud tạo key mới, dán vào ATLASCLOUD_API_KEY trong .env, khởi động lại." });
  } else if (input.atlas.missing.length > 0) {
    const list = input.atlas.missing.map((item) => `${item.field}="${item.modelId}"`).join(", ");
    rows.push({ key: "atlas", label: "Key + Model Atlas", status: "fail", message: `Có model KHÔNG tồn tại trên tài khoản Atlas: ${list}. Sửa tên model ở .env (hoặc Cấu hình → Model).` });
  } else if (input.atlas.probeSkipped) {
    rows.push({ key: "atlas", label: "Key + Model Atlas", status: "warn", message: "Không kết nối được Atlas để kiểm key/model (lỗi mạng?). Thử lại khi có mạng." });
  } else {
    rows.push({ key: "atlas", label: "Key + Model Atlas", status: "ok", message: `Key hợp lệ và ${input.atlas.checkedModelCount} model đã cấu hình đều tồn tại.` });
  }

  // 2. Database — reachability + un-migrated switch + config validity.
  const dbConfig = byName.get("CINEJELLY_DATABASE_KIND");
  if (input.databaseUnreachable) {
    rows.push({ key: "database", label: "Cơ sở dữ liệu tài khoản", status: "fail", message: "Không kết nối được cơ sở dữ liệu — kiểm tra CINEJELLY_POSTGRES_URL / Neon (có thể đang ngủ) rồi khởi động lại. Khách không đăng nhập/nạp tiền được." });
  } else if (input.orphanedAccountCount > 0) {
    rows.push({ key: "database", label: "Cơ sở dữ liệu tài khoản", status: "fail", message: `Đã đổi loại cơ sở dữ liệu nhưng ${input.orphanedAccountCount} tài khoản cũ chưa được chuyển sang (dữ liệu vẫn an toàn trong file json). Chạy "npm run db:migrate", hoặc đổi lại CINEJELLY_DATABASE_KIND=json.` });
  } else if (dbConfig && dbConfig.status === "fail") {
    rows.push({ key: "database", label: "Cơ sở dữ liệu tài khoản", status: "fail", message: dbConfig.message });
  } else {
    rows.push({ key: "database", label: "Cơ sở dữ liệu tài khoản", status: "ok", message: dbConfig?.message ?? "Cơ sở dữ liệu hoạt động." });
  }

  // 3. Free disk.
  const disk = byName.get("Ổ đĩa trống (thư mục lưu video)");
  if (disk) {
    rows.push({ key: "disk", label: "Ổ đĩa", status: disk.status === "pass" ? "ok" : disk.status === "fail" ? "fail" : "warn", message: disk.message });
  }

  // 4. ffmpeg (video assembly).
  const ffmpeg = byName.get("ffmpeg");
  if (ffmpeg) {
    rows.push({
      key: "ffmpeg",
      label: "Ghép/xử lý video (ffmpeg)",
      status: ffmpeg.status === "pass" ? "ok" : "fail",
      message: ffmpeg.status === "pass" ? "ffmpeg sẵn sàng." : "Thiếu ffmpeg — cài ffmpeg trên máy chủ (bản Docker đã có sẵn). Không có ffmpeg thì không ghép được video."
    });
  }

  // 5. Advanced-feature models (each OFF = that feature simply unavailable, never a hard fail).
  const featureModels = [
    { name: "ATLASCLOUD_IMAGE_MODEL", label: "Tính năng: keyframe (ảnh mở đầu, khóa nhận diện)" },
    { name: "ATLASCLOUD_AVATAR_MODEL", label: "Tính năng: cảnh nhân vật nói (avatar khớp môi)" },
    { name: "ATLASCLOUD_TTS_MODEL", label: "Tính năng: đọc giọng thuyết minh (TTS)" },
    { name: "ATLASCLOUD_SPEECH_MODEL", label: "Tính năng: Lồng tiếng / Phụ đề (nhận giọng nói)" }
  ];
  for (const feature of featureModels) {
    const check = byName.get(feature.name);
    if (!check) {
      continue;
    }
    rows.push({
      key: feature.name,
      label: feature.label,
      status: check.status === "fail" ? "fail" : check.status === "warn" ? "warn" : "ok",
      message: check.status === "pass" ? "Đang bật." : check.message
    });
  }

  // 6. Bank/top-up config — customers cannot pay until a real account replaces the placeholder.
  if (input.bankInfoMissing) {
    rows.push({
      key: "topup_bank",
      label: "Tài khoản nhận tiền (nạp credits)",
      status: "fail",
      message: "Chưa điền số tài khoản nhận tiền THẬT — khách KHÔNG nạp được credits (mọi lượt nạp bị chặn). Điền CINEJELLY_TOPUP_BANK_INFO trong .env (hoặc Cấu hình → Thông tin chuyển khoản), viết đầy đủ ngân hàng + số TK + tên chủ TK."
    });
  }

  const overall = rows.reduce<OperatorHealthStatus>((worst, row) => (RANK[row.status] > RANK[worst] ? row.status : worst), "ok");
  return { overall, rows, checkedAt: input.nowIso };
}
