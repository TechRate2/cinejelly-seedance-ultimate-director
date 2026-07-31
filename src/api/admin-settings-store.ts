/**
 * Runtime operator settings — the admin dashboard's backing store.
 *
 * Everything a Vietnamese solo operator tunes while the product is LIVE, editable from the
 * admin UI without touching the server: render pricing (credits/second + quality
 * multipliers), the credit-package catalog, bank-transfer instructions, provider model ids,
 * the refund policy, and studio content (announcement + featured images). Values here
 * OVERRIDE the .env defaults; anything not set falls back to the environment, so a fresh
 * deploy still boots from the single .env file.
 *
 * Money policy: refundPolicy defaults to "manual" — failed/canceled/rejected render charges
 * are queued for the operator to decide instead of refunding automatically. Switching to
 * "auto" restores automatic refunds. Every change is appended to an audit trail.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_CREDIT_PACKAGES,
  DEFAULT_USD_TO_VND,
  loadCreditPackages,
  loadPipelineCostConfig,
  loadRenderCreditPricing,
  UserAccountError,
  withComputedVnd,
  type CreditPackage,
  type PipelineCostConfig,
  type RenderCreditPricing
} from "./user-account-store.js";

const SETTINGS_SCHEMA_VERSION = "cinejelly.admin-settings.v1";
const DEFAULT_OUTPUT_DIR = "assets/output_deliverables";
const DEFAULT_SETTINGS_FILE = "admin-settings.json";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_AUDIT_ENTRIES = 200;
const MAX_PACKAGES = 12;
const MAX_FEATURED_IMAGES = 8;
const MODEL_ID_PATTERN = /^[A-Za-z0-9._\/-]{2,160}$/;
const UPLOAD_HANDLE_PATTERN = /^upload:\/\/up_[a-f0-9]{16,64}\.(png|jpg|webp)$/;

// "manual" = failed jobs land in the operator refund queue (admin decides each case).
// "auto"   = failed jobs auto-refund credits to the customer's balance.
// "off"    = failed jobs never return credits (credits consumed). Cash is never returned
//            under ANY policy — only in-app credits differ. Pair with operator-hold ON so
//            infra failures retry to success rather than consuming credits.
export type RefundPolicy = "manual" | "auto" | "off";

export interface AdminStudioContent {
  readonly announcement?: string;
  readonly featuredImages?: readonly string[];
}

export interface AdminModelOverrides {
  readonly videoModel?: string;
  readonly imageModel?: string;
  readonly imageReferenceModel?: string;
  readonly llmModel?: string;
  /** "Writer" model for the creative text stages (script/styleDna/dialogue); empty = share llmModel. */
  readonly creativeLlmModel?: string;
  readonly speechModel?: string;
}

export interface AdminSettingsState {
  schemaVersion: string;
  refundPolicy?: RefundPolicy;
  creditsPerRenderSecond?: number;
  usdToVnd?: number;
  qualityMultipliers?: Record<string, number>;
  packages?: CreditPackage[];
  topupBankInfo?: string;
  models?: AdminModelOverrides;
  studio?: AdminStudioContent;
  pipelineCost?: PipelineCostOverride;
  auditTrail: { at: string; action: string; detail: string }[];
}

export interface PipelineCostOverride {
  creditCostBasisUsd?: number;
  videoCostUsdPerSecondByTier?: Record<string, number>;
  overheadMultiplier?: number;
  minimumChargeCredits?: number;
}

export interface AdminSettingsPatch {
  readonly refundPolicy?: unknown;
  readonly creditsPerRenderSecond?: unknown;
  readonly usdToVnd?: unknown;
  readonly qualityMultipliers?: unknown;
  readonly packages?: unknown;
  readonly topupBankInfo?: unknown;
  readonly models?: unknown;
  readonly studio?: unknown;
  readonly pipelineCost?: unknown;
}

export function readAdminSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CINEJELLY_ADMIN_SETTINGS_PATH?.trim();
  const outputDir = env.CINEJELLY_OUTPUT_DIR?.trim() || DEFAULT_OUTPUT_DIR;
  const settingsPath = configured || join(outputDir, DEFAULT_SETTINGS_FILE);
  if (CONTROL_CHARACTER_PATTERN.test(settingsPath)) {
    throw new Error("CINEJELLY_ADMIN_SETTINGS_PATH must not contain control characters.");
  }
  return settingsPath;
}

export class AdminSettingsStore {
  private readonly settingsPath: string;
  private readonly env: NodeJS.ProcessEnv;
  private state: AdminSettingsState;

  public constructor(input: { readonly settingsPath: string; readonly env?: NodeJS.ProcessEnv }) {
    this.settingsPath = input.settingsPath;
    this.env = input.env ?? process.env;
    this.state = this.loadState();
  }

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): AdminSettingsStore {
    return new AdminSettingsStore({ settingsPath: readAdminSettingsPath(env), env });
  }

  // ---------- effective values (settings override env, env overrides defaults) ----------

  public refundPolicy(): RefundPolicy {
    if (this.state.refundPolicy) {
      return this.state.refundPolicy;
    }
    const fromEnv = this.env.CINEJELLY_REFUND_POLICY?.trim().toLowerCase();
    return fromEnv === "auto" ? "auto" : fromEnv === "off" ? "off" : "manual";
  }

  public pricing(): RenderCreditPricing {
    const base = loadRenderCreditPricing(this.env);
    const perSecond = this.state.creditsPerRenderSecond ?? base.creditsPerRenderSecond;
    return {
      creditsPerRenderSecond: perSecond,
      qualityMultipliers: { ...base.qualityMultipliers, ...(this.state.qualityMultipliers ?? {}) },
      minimumChargeCredits: Math.max(1, Math.round(perSecond * 3))
    };
  }

  /**
   * Metered pipeline cost config (env defaults + live admin overrides). Drives the customer's
   * per-clip charge = real provider cost of the clip → credits.
   */
  public pipelineCost(): PipelineCostConfig {
    const base = loadPipelineCostConfig(this.env);
    const override = this.state.pipelineCost;
    if (!override) {
      return base;
    }
    return {
      creditCostBasisUsd:
        typeof override.creditCostBasisUsd === "number" && override.creditCostBasisUsd > 0
          ? override.creditCostBasisUsd
          : base.creditCostBasisUsd,
      videoCostUsdPerSecondByTier: { ...base.videoCostUsdPerSecondByTier, ...(override.videoCostUsdPerSecondByTier ?? {}) },
      candidateCountByQuality: base.candidateCountByQuality,
      repairCountByQuality: base.repairCountByQuality,
      testTakeSecondsPerShot: base.testTakeSecondsPerShot,
      avgSecondsPerShot: base.avgSecondsPerShot,
      overheadMultiplier:
        typeof override.overheadMultiplier === "number" && override.overheadMultiplier >= 1
          ? override.overheadMultiplier
          : base.overheadMultiplier,
      minimumChargeCredits:
        typeof override.minimumChargeCredits === "number" && override.minimumChargeCredits >= 1
          ? Math.round(override.minimumChargeCredits)
          : base.minimumChargeCredits
    };
  }

  /** USD→VND exchange rate for converting package prices to the bank-transfer amount. */
  public usdToVnd(): number {
    if (this.state.usdToVnd && this.state.usdToVnd > 0) {
      return this.state.usdToVnd;
    }
    const fromEnv = Number(this.env.CINEJELLY_USD_TO_VND);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_USD_TO_VND;
  }

  public packages(): readonly CreditPackage[] {
    const rate = this.usdToVnd();
    // priceUsd is the source of truth; the VND transfer amount is derived live at the current
    // rate so changing the rate re-prices every pack without editing each one.
    const source =
      this.state.packages && this.state.packages.length > 0
        ? this.state.packages
        : (() => {
            try {
              return loadCreditPackages(this.env);
            } catch {
              return DEFAULT_CREDIT_PACKAGES;
            }
          })();
    return source.map((creditPackage) => withComputedVnd(creditPackage, rate));
  }

  public topupBankInfo(): string {
    return this.state.topupBankInfo?.trim() || this.env.CINEJELLY_TOPUP_BANK_INFO?.trim() || "";
  }

  public models(): AdminModelOverrides {
    return this.state.models ?? {};
  }

  public studio(): AdminStudioContent {
    return this.state.studio ?? {};
  }

  /** Everything the admin dashboard shows, plus the audit trail tail. */
  public snapshot(): {
    readonly refundPolicy: RefundPolicy;
    readonly pricing: RenderCreditPricing;
    readonly usdToVnd: number;
    readonly packages: readonly CreditPackage[];
    readonly topupBankInfo: string;
    readonly models: AdminModelOverrides;
    readonly studio: AdminStudioContent;
    readonly pipelineCost: PipelineCostConfig;
    readonly auditTrail: readonly { at: string; action: string; detail: string }[];
  } {
    return {
      refundPolicy: this.refundPolicy(),
      pricing: this.pricing(),
      usdToVnd: this.usdToVnd(),
      packages: this.packages(),
      topupBankInfo: this.topupBankInfo(),
      models: this.models(),
      studio: this.studio(),
      pipelineCost: this.pipelineCost(),
      auditTrail: this.state.auditTrail.slice(-30).reverse()
    };
  }

  /**
   * Apply persisted model overrides onto the process environment at boot so the per-job
   * director runtime (which reads env) uses the operator's choices after a restart.
   */
  public applyModelEnvOverrides(target: NodeJS.ProcessEnv = process.env): void {
    const models = this.models();
    if (models.videoModel) {
      target.ATLASCLOUD_SEEDANCE_STANDARD_MODEL = models.videoModel;
    }
    if (models.imageModel) {
      target.ATLASCLOUD_IMAGE_MODEL = models.imageModel;
    }
    if (models.imageReferenceModel) {
      target.ATLASCLOUD_IMAGE_REFERENCE_MODEL = models.imageReferenceModel;
    }
    if (models.llmModel) {
      target.ATLASCLOUD_LLM_MODEL = models.llmModel;
    }
    if (models.creativeLlmModel) {
      target.ATLASCLOUD_CREATIVE_LLM_MODEL = models.creativeLlmModel;
    }
    if (models.speechModel) {
      target.ATLASCLOUD_SPEECH_MODEL = models.speechModel;
    }
  }

  // ---------- validated updates from the admin UI ----------

  public update(patch: AdminSettingsPatch, updatedBy: string): void {
    const changes: string[] = [];

    if (patch.refundPolicy !== undefined) {
      if (patch.refundPolicy !== "manual" && patch.refundPolicy !== "auto" && patch.refundPolicy !== "off") {
        throw new UserAccountError('refundPolicy phải là "manual", "auto" hoặc "off".', 400);
      }
      this.state.refundPolicy = patch.refundPolicy;
      changes.push(`refundPolicy=${patch.refundPolicy}`);
    }

    if (patch.creditsPerRenderSecond !== undefined) {
      const value = Number(patch.creditsPerRenderSecond);
      if (!Number.isFinite(value) || value <= 0 || value > 10_000) {
        throw new UserAccountError("Giá credits/giây phải là số dương (tối đa 10000).", 400);
      }
      this.state.creditsPerRenderSecond = Math.round(value * 100) / 100;
      changes.push(`creditsPerRenderSecond=${this.state.creditsPerRenderSecond}`);
    }

    if (patch.usdToVnd !== undefined) {
      const value = Number(patch.usdToVnd);
      if (!Number.isFinite(value) || value < 1_000 || value > 1_000_000) {
        throw new UserAccountError("Tỉ giá USD→VND phải là số dương hợp lý (1.000–1.000.000).", 400);
      }
      this.state.usdToVnd = Math.round(value);
      changes.push(`usdToVnd=${this.state.usdToVnd}`);
    }

    if (patch.qualityMultipliers !== undefined) {
      this.state.qualityMultipliers = this.validatedMultipliers(patch.qualityMultipliers);
      changes.push(`qualityMultipliers=${JSON.stringify(this.state.qualityMultipliers)}`);
    }

    if (patch.packages !== undefined) {
      this.state.packages = this.validatedPackages(patch.packages);
      changes.push(`packages=${this.state.packages.length} gói`);
    }

    if (patch.topupBankInfo !== undefined) {
      const value = typeof patch.topupBankInfo === "string" ? patch.topupBankInfo.trim() : "";
      if (!value || value.length > 500 || CONTROL_CHARACTER_PATTERN.test(value)) {
        throw new UserAccountError("Thông tin chuyển khoản không hợp lệ (1-500 ký tự).", 400);
      }
      this.state.topupBankInfo = value;
      changes.push("topupBankInfo=đã cập nhật");
    }

    if (patch.models !== undefined) {
      // MERGE, don't replace: a model key absent or blank in the patch keeps its current
      // value. This prevents a stale/partial Settings form from silently wiping a model set
      // out-of-band — in particular speechModel (enabled via the Model tab or a direct API
      // PUT to power the Sub/Dub feature) must survive an admin who only edits the price and
      // saves. To CHANGE a model, send its new value; blank never means "clear".
      this.state.models = { ...this.state.models, ...this.validatedModels(patch.models) };
      changes.push(`models=${JSON.stringify(this.state.models)}`);
      // Live-apply so the very next render job uses the new models without a restart.
      this.applyModelEnvOverrides();
    }

    if (patch.studio !== undefined) {
      // MERGE like the models branch: an admin who PUTs only { studio: { announcement } } must not
      // wipe featuredImages (and vice-versa). validatedStudio returns only the fields present in the
      // patch, so absent fields keep their current value instead of being replaced away (gap [4]).
      this.state.studio = { ...this.state.studio, ...this.validatedStudio(patch.studio) };
      changes.push("studio=đã cập nhật");
    }

    if (patch.pipelineCost !== undefined) {
      // The CORE video price knob was previously .env-only (admin audit B1): the field existed in the
      // patch type but had no apply branch, so a non-technical owner could not retune their margin from
      // the panel. Now the overhead/markup multiplier and minimum-charge floor are UI-editable and
      // live-applied. MERGE so a partial patch keeps the other cost fields.
      const override = this.validatedPipelineCost(patch.pipelineCost);
      this.state.pipelineCost = { ...this.state.pipelineCost, ...override };
      changes.push(`pipelineCost=${JSON.stringify(this.state.pipelineCost)}`);
    }

    if (changes.length === 0) {
      throw new UserAccountError("Không có thay đổi hợp lệ nào trong yêu cầu.", 400);
    }
    this.state.auditTrail.push({
      at: new Date().toISOString(),
      action: `update bởi ${updatedBy}`,
      detail: changes.join("; ").slice(0, 500)
    });
    if (this.state.auditTrail.length > MAX_AUDIT_ENTRIES) {
      this.state.auditTrail.splice(0, this.state.auditTrail.length - MAX_AUDIT_ENTRIES);
    }
    this.persist();
  }

  private validatedPipelineCost(value: unknown): PipelineCostOverride {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new UserAccountError("pipelineCost phải là object.", 400);
    }
    const record = value as Record<string, unknown>;
    const result: PipelineCostOverride = {};
    if (record.overheadMultiplier !== undefined && record.overheadMultiplier !== "") {
      const overhead = Number(record.overheadMultiplier);
      // 1 = bán đúng giá gốc (không lời); >1 = có markup. Chặn 1..50 để không lỡ tay đặt lỗ hoặc quá cao.
      if (!Number.isFinite(overhead) || overhead < 1 || overhead > 50) {
        throw new UserAccountError("Hệ số giá (markup) phải từ 1 đến 50 (1 = giá gốc, 2 = gấp đôi).", 400);
      }
      result.overheadMultiplier = Math.round(overhead * 100) / 100;
    }
    if (record.minimumChargeCredits !== undefined && record.minimumChargeCredits !== "") {
      const minCredits = Number(record.minimumChargeCredits);
      if (!Number.isFinite(minCredits) || minCredits < 0 || minCredits > 100000) {
        throw new UserAccountError("Giá tối thiểu mỗi video (credits) phải từ 0 đến 100000.", 400);
      }
      result.minimumChargeCredits = Math.round(minCredits);
    }
    return result;
  }

  private validatedMultipliers(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new UserAccountError("qualityMultipliers phải là object {standard, high, ...}.", 400);
    }
    const allowed = new Set(["draft", "standard", "high", "ultimate"]);
    const result: Record<string, number> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!allowed.has(key)) {
        throw new UserAccountError(`Hệ số chất lượng không hợp lệ: ${key}.`, 400);
      }
      const multiplier = Number(raw);
      if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 100) {
        throw new UserAccountError(`Hệ số ${key} phải là số dương (tối đa 100).`, 400);
      }
      result[key] = Math.round(multiplier * 100) / 100;
    }
    return result;
  }

  private validatedPackages(value: unknown): CreditPackage[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PACKAGES) {
      throw new UserAccountError(`Danh sách gói phải có 1-${MAX_PACKAGES} gói.`, 400);
    }
    const seen = new Set<string>();
    // Provider-cost basis per credit (1 credit ≈ this much Atlas spend). Used to reject a package that
    // sells credits BELOW cost — a fat-fingered price (e.g. a dropped zero: "28000 credits for $1")
    // would otherwise save silently and lose money on every subsequent video.
    const creditCostBasisUsd = this.pipelineCost().creditCostBasisUsd;
    return value.map((item, index) => {
      const record = item as Partial<CreditPackage>;
      const packageId = typeof record.packageId === "string" ? record.packageId.trim() : "";
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const credits = Math.floor(Number(record.credits));
      const rawUsd = Number(record.priceUsd);
      const rawVnd = Number(record.priceVnd);
      const hasUsd = Number.isFinite(rawUsd) && rawUsd > 0;
      const hasVnd = Number.isFinite(rawVnd) && rawVnd > 0;
      if (!/^[a-z0-9_-]{2,40}$/.test(packageId)) {
        throw new UserAccountError(`Gói ${index + 1}: packageId chỉ gồm a-z, 0-9, gạch (2-40 ký tự).`, 400);
      }
      if (seen.has(packageId)) {
        throw new UserAccountError(`Gói ${index + 1}: packageId "${packageId}" bị trùng.`, 400);
      }
      seen.add(packageId);
      if (!label || label.length > 60 || CONTROL_CHARACTER_PATTERN.test(label)) {
        throw new UserAccountError(`Gói ${index + 1}: tên gói 1-60 ký tự.`, 400);
      }
      if (!Number.isFinite(credits) || credits <= 0 || credits > 10_000_000) {
        throw new UserAccountError(`Gói ${index + 1}: credits phải là số dương.`, 400);
      }
      if (!hasUsd && !hasVnd) {
        throw new UserAccountError(`Gói ${index + 1}: cần giá USD (priceUsd) dương.`, 400);
      }
      // priceUsd is the source of truth. A USD input rounds to cents; a legacy VND-only edit
      // keeps full precision so its VND transfer amount round-trips exactly at the base rate.
      const priceUsd = hasUsd ? Math.round(rawUsd * 100) / 100 : rawVnd / DEFAULT_USD_TO_VND;
      if (priceUsd <= 0 || priceUsd > 100_000) {
        throw new UserAccountError(`Gói ${index + 1}: giá USD phải là số dương hợp lý.`, 400);
      }
      // LOSS GUARD: catch a fat-fingered price that loses money on every render (e.g. a dropped zero).
      // A regular pack must sell each credit AT OR ABOVE its provider-cost basis. A trial pack
      // (oncePerAccount) is allowed to be a deliberate loss-leader, so it only trips on an absurd
      // near-zero price (10% of cost) — not on a normal promo discount. Break-even / thin margin is fine.
      const isTrialPack = (record as { oncePerAccount?: unknown }).oncePerAccount === true;
      const usdPerCredit = priceUsd / credits;
      const lossFloorUsd = isTrialPack ? creditCostBasisUsd * 0.1 : creditCostBasisUsd;
      if (creditCostBasisUsd > 0 && usdPerCredit < lossFloorUsd) {
        throw new UserAccountError(
          `Gói ${index + 1} ("${label}"): mỗi credit đang bán ${usdPerCredit.toFixed(5)} USD — ${isTrialPack ? "quá thấp bất thường" : "DƯỚI giá vốn"} (~${creditCostBasisUsd} USD/credit). Kiểm tra lại giá gói / số credits (thường là gõ nhầm rớt số 0).`,
          400
        );
      }
      const priceVnd = hasVnd ? Math.floor(rawVnd) : Math.round(priceUsd * DEFAULT_USD_TO_VND);
      const bonusNote = typeof record.bonusNote === "string" ? record.bonusNote.trim().slice(0, 80) : "";
      // Preserve the anti-farm once-per-account flag through admin edits (dropping it would silently
      // let the paid trial be re-claimed). The server-side protected-ID set backstops this too.
      const oncePerAccount = (record as { oncePerAccount?: unknown }).oncePerAccount === true;
      return {
        packageId,
        label,
        credits,
        priceUsd,
        priceVnd,
        ...(bonusNote ? { bonusNote } : {}),
        ...(oncePerAccount ? { oncePerAccount: true as const } : {})
      };
    });
  }

  private validatedModels(value: unknown): AdminModelOverrides {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new UserAccountError("models phải là object.", 400);
    }
    const record = value as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const key of ["videoModel", "imageModel", "imageReferenceModel", "llmModel", "creativeLlmModel", "speechModel"]) {
      const raw = record[key];
      if (raw === undefined || raw === null || raw === "") {
        continue;
      }
      if (typeof raw !== "string" || !MODEL_ID_PATTERN.test(raw.trim())) {
        throw new UserAccountError(`${key} không hợp lệ (chỉ chữ, số, dấu chấm, gạch, /).`, 400);
      }
      result[key] = raw.trim();
    }
    return result;
  }

  private validatedStudio(value: unknown): AdminStudioContent {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new UserAccountError("studio phải là object.", 400);
    }
    const record = value as Record<string, unknown>;
    const result: { announcement?: string; featuredImages?: string[] } = {};
    if (record.announcement !== undefined) {
      const announcement = typeof record.announcement === "string" ? record.announcement.trim() : "";
      if (announcement.length > 300 || CONTROL_CHARACTER_PATTERN.test(announcement)) {
        throw new UserAccountError("Thông báo studio tối đa 300 ký tự.", 400);
      }
      if (announcement) {
        result.announcement = announcement;
      }
    }
    if (record.featuredImages !== undefined) {
      if (!Array.isArray(record.featuredImages) || record.featuredImages.length > MAX_FEATURED_IMAGES) {
        throw new UserAccountError(`featuredImages là danh sách tối đa ${MAX_FEATURED_IMAGES} ảnh.`, 400);
      }
      const images = record.featuredImages.map((item, index) => {
        if (typeof item !== "string" || !UPLOAD_HANDLE_PATTERN.test(item)) {
          throw new UserAccountError(`Ảnh ${index + 1} phải là handle upload:// (ảnh png/jpg/webp đã tải lên).`, 400);
        }
        return item;
      });
      if (images.length > 0) {
        result.featuredImages = images;
      }
    }
    return result;
  }

  private loadState(): AdminSettingsState {
    try {
      const parsed = JSON.parse(readFileSync(this.settingsPath, "utf8")) as Partial<AdminSettingsState>;
      if (parsed.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
        throw new Error(`Admin settings schema mismatch at ${this.settingsPath}.`);
      }
      return {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        ...(parsed.refundPolicy === "auto" || parsed.refundPolicy === "manual" || parsed.refundPolicy === "off"
          ? { refundPolicy: parsed.refundPolicy }
          : {}),
        ...(typeof parsed.creditsPerRenderSecond === "number" ? { creditsPerRenderSecond: parsed.creditsPerRenderSecond } : {}),
        ...(typeof parsed.usdToVnd === "number" && parsed.usdToVnd > 0 ? { usdToVnd: parsed.usdToVnd } : {}),
        ...(parsed.qualityMultipliers && typeof parsed.qualityMultipliers === "object"
          ? { qualityMultipliers: parsed.qualityMultipliers as Record<string, number> }
          : {}),
        ...(Array.isArray(parsed.packages) ? { packages: parsed.packages as CreditPackage[] } : {}),
        ...(typeof parsed.topupBankInfo === "string" ? { topupBankInfo: parsed.topupBankInfo } : {}),
        ...(parsed.models && typeof parsed.models === "object" ? { models: parsed.models as AdminModelOverrides } : {}),
        ...(parsed.studio && typeof parsed.studio === "object" ? { studio: parsed.studio as AdminStudioContent } : {}),
        auditTrail: Array.isArray(parsed.auditTrail)
          ? (parsed.auditTrail as { at: string; action: string; detail: string }[])
          : []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { schemaVersion: SETTINGS_SCHEMA_VERSION, auditTrail: [] };
      }
      throw error;
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.settingsPath), { recursive: true });
    const tempPath = `${this.settingsPath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.state, null, 2), "utf8");
    renameSync(tempPath, this.settingsPath);
  }
}
