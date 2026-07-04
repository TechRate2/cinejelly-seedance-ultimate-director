/**
 * Customer accounts, sessions, and the credit ledger.
 *
 * The commercial flow is Topview-style: a customer registers with email + password, tops
 * up a credit balance by buying a package (MVP: bank transfer + operator approval; a
 * payment-gateway adapter can replace approval later without touching this ledger), and
 * every render charges credits up front with an automatic refund if the job never runs or
 * fails. Passwords are stored as scrypt hashes and session tokens are stored hashed, so a
 * leaked store file exposes neither. Persistence is a single JSON file with atomic
 * tmp+rename writes, matching the other API stores.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import {
  createAccountPersistenceDriver,
  JsonFileAccountDriver,
  type AccountPersistenceDriver,
  type PersistedAccountState
} from "./account-persistence.js";

const STORE_SCHEMA_VERSION = "cinejelly.user-account-store.v1";
const DEFAULT_OUTPUT_DIR = "assets/output_deliverables";
const DEFAULT_STORE_FILE = "user-accounts.json";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARACTER_GLOBAL_PATTERN = /[\u0000-\u001f\u007f]/g;
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,24}$/;
const MIN_PASSWORD_LENGTH = 8;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_KEY_LENGTH = 64;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_STATEMENT_ENTRIES = 200;
const MAX_TOPUPS_PER_USER_PENDING = 3;

export class UserAccountError extends Error {
  public readonly statusCode: 400 | 401 | 402 | 403 | 404 | 409 | 429 | 503;

  public constructor(message: string, statusCode: 400 | 401 | 402 | 403 | 404 | 409 | 429 | 503) {
    super(message);
    this.name = "UserAccountError";
    this.statusCode = statusCode;
  }
}

export interface CreditPackage {
  readonly packageId: string;
  readonly label: string;
  readonly credits: number;
  /** Headline value in USD (Higgsfield-style tiers). Source of truth for the price. */
  readonly priceUsd: number;
  /** VND transfer amount = round(priceUsd × exchange rate). Computed when packages are served
   * (so changing CINEJELLY_USD_TO_VND updates every pack); the value here is a 27k seed. */
  readonly priceVnd: number;
  readonly bonusNote?: string;
}

/** Default USD→VND exchange rate used to convert package prices for the bank transfer. */
export const DEFAULT_USD_TO_VND = 27_000;

/** Fill a package's VND transfer amount from its USD price at the given exchange rate. */
export function withComputedVnd(creditPackage: CreditPackage, usdToVnd: number): CreditPackage {
  const rate = Number.isFinite(usdToVnd) && usdToVnd > 0 ? usdToVnd : DEFAULT_USD_TO_VND;
  return { ...creditPackage, priceVnd: Math.round(creditPackage.priceUsd * rate) };
}

/**
 * Default catalog; override with CINEJELLY_CREDIT_PACKAGES_JSON, or edit live in the admin
 * Settings tab. Credits never expire (one-time top-ups, no monthly). Pricing is designed for
 * a healthy ~2.5–3x margin over Atlas cost at the STANDARD tier (so cheaper tiers earn even
 * more), with the per-credit price dropping ~16% from the trial to the Studio pack to reward
 * bigger top-ups. IMPORTANT: these assume roughly ~45–50k VND provider cost per 15s standard
 * video (150 credits at 10 credits/sec) — verify against your real Atlas dashboard + FX rate
 * and tune the numbers (or the whole ladder) in the admin Settings tab.
 */
export const DEFAULT_CREDIT_PACKAGES: readonly CreditPackage[] = [
  { packageId: "goi_dungthu", label: "⚡ Trial", credits: 150, priceUsd: 5, priceVnd: 135_000, bonusNote: "Làm thử 1 video 15 giây" },
  { packageId: "goi_phobien", label: "⭐ Starter", credits: 500, priceUsd: 15, priceVnd: 405_000, bonusNote: "PHỔ BIẾN NHẤT • ~3 video" },
  { packageId: "goi_chuyennghiep", label: "💎 Plus", credits: 1_400, priceUsd: 39, priceVnd: 1_053_000, bonusNote: "~9 video • tiết kiệm ~16%/credit" },
  { packageId: "goi_studio", label: "👑 Ultra", credits: 4_000, priceUsd: 99, priceVnd: 2_673_000, bonusNote: "RẺ NHẤT mỗi video • ~26 video • credits KHÔNG hết hạn" }
];

export interface UserRecord {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordSaltHex: string;
  readonly passwordHashHex: string;
  readonly status: "active" | "disabled";
  readonly createdAt: string;
}

export interface SessionRecord {
  readonly tokenSha256: string;
  readonly userId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export type CreditEntryType = "topup" | "render_charge" | "render_refund" | "admin_adjust";

export interface CreditEntry {
  readonly entryId: string;
  readonly userId: string;
  readonly type: CreditEntryType;
  /** Positive adds credits, negative spends them. */
  readonly credits: number;
  readonly note: string;
  readonly jobId?: string;
  readonly topupId?: string;
  readonly at: string;
}

export interface TopupRequestRecord {
  readonly topupId: string;
  readonly userId: string;
  readonly packageId: string;
  readonly credits: number;
  readonly amountVnd: number;
  readonly userNote?: string;
  readonly status: "pending" | "approved" | "rejected";
  readonly requestedAt: string;
  readonly decidedAt?: string;
  readonly decisionNote?: string;
}

export interface RefundRequestRecord {
  readonly refundRequestId: string;
  readonly userId: string;
  readonly jobId: string;
  readonly credits: number;
  readonly reason: string;
  readonly status: "pending" | "refunded" | "dismissed";
  readonly requestedAt: string;
  readonly decidedAt?: string;
}

export interface PublicUser {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly balanceCredits: number;
}

interface StoreState {
  schemaVersion: string;
  users: UserRecord[];
  sessions: SessionRecord[];
  entries: CreditEntry[];
  topups: TopupRequestRecord[];
  refundRequests: RefundRequestRecord[];
}

export interface RenderCreditPricing {
  readonly creditsPerRenderSecond: number;
  readonly qualityMultipliers: Record<string, number>;
  readonly minimumChargeCredits: number;
}

export function loadRenderCreditPricing(env: NodeJS.ProcessEnv = process.env): RenderCreditPricing {
  const perSecond = readPositiveNumber(env.CINEJELLY_CREDITS_PER_RENDER_SECOND, 10);
  return {
    creditsPerRenderSecond: perSecond,
    qualityMultipliers: { draft: 0.6, standard: 1, high: 1.5, ultimate: 2 },
    minimumChargeCredits: Math.max(1, Math.round(perSecond * 3))
  };
}

/**
 * Customer-facing render pricing: predictable credits from requested duration and quality,
 * independent of provider-side price fluctuations. Charged up front, refunded on failure.
 */
export function estimateRenderCredits(input: {
  readonly durationTargetSeconds?: number;
  readonly qualityMode?: string;
  readonly pricing: RenderCreditPricing;
}): number {
  const seconds = Math.max(1, Math.min(3_600, input.durationTargetSeconds ?? 15));
  const multiplier = input.pricing.qualityMultipliers[input.qualityMode ?? "standard"] ?? 1;
  return Math.max(
    input.pricing.minimumChargeCredits,
    Math.ceil(seconds * input.pricing.creditsPerRenderSecond * multiplier)
  );
}

export function loadCreditPackages(env: NodeJS.ProcessEnv = process.env): readonly CreditPackage[] {
  const raw = env.CINEJELLY_CREDIT_PACKAGES_JSON?.trim();
  if (!raw) {
    return DEFAULT_CREDIT_PACKAGES;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("CINEJELLY_CREDIT_PACKAGES_JSON must be a non-empty JSON array.");
  }
  return parsed.map((item, index) => {
    const record = item as Partial<CreditPackage>;
    const hasUsd = Number.isFinite(record.priceUsd) && (record.priceUsd as number) > 0;
    const hasVnd = Number.isFinite(record.priceVnd) && (record.priceVnd as number) > 0;
    if (
      !record.packageId?.trim() ||
      !record.label?.trim() ||
      !Number.isFinite(record.credits) ||
      (record.credits as number) <= 0 ||
      (!hasUsd && !hasVnd)
    ) {
      throw new Error(`CINEJELLY_CREDIT_PACKAGES_JSON entry ${index} needs packageId, label, credits > 0, and priceUsd > 0 (or priceVnd > 0).`);
    }
    // priceUsd is the source of truth; accept a legacy priceVnd-only entry by deriving USD.
    const priceUsd = hasUsd ? (record.priceUsd as number) : (record.priceVnd as number) / DEFAULT_USD_TO_VND;
    const priceVnd = hasVnd ? Math.floor(record.priceVnd as number) : Math.round(priceUsd * DEFAULT_USD_TO_VND);
    return {
      packageId: record.packageId.trim(),
      label: record.label.trim(),
      credits: Math.floor(record.credits as number),
      priceUsd,
      priceVnd,
      ...(record.bonusNote?.trim() ? { bonusNote: record.bonusNote.trim() } : {})
    };
  });
}

export function readUserAccountStorePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CINEJELLY_USER_ACCOUNT_STORE_PATH?.trim();
  const outputDir = env.CINEJELLY_OUTPUT_DIR?.trim() || DEFAULT_OUTPUT_DIR;
  const storePath = configured || join(outputDir, DEFAULT_STORE_FILE);
  if (CONTROL_CHARACTER_PATTERN.test(storePath)) {
    throw new Error("CINEJELLY_USER_ACCOUNT_STORE_PATH must not contain control characters.");
  }
  return storePath;
}

export class UserAccountStore {
  private readonly driver: AccountPersistenceDriver;
  private readonly packages: readonly CreditPackage[];
  private readonly pricing: RenderCreditPricing;
  private readonly state: StoreState;
  private readonly balances = new Map<string, number>();
  private readonly loginFailures = new Map<string, { count: number; firstAt: number }>();

  public constructor(input: {
    readonly storePath?: string;
    readonly driver?: AccountPersistenceDriver;
    readonly packages?: readonly CreditPackage[];
    readonly pricing?: RenderCreditPricing;
  }) {
    if (!input.driver && !input.storePath) {
      throw new Error("UserAccountStore needs a persistence driver or a JSON store path.");
    }
    this.driver = input.driver ?? new JsonFileAccountDriver(input.storePath as string);
    this.packages = input.packages ?? DEFAULT_CREDIT_PACKAGES;
    this.pricing = input.pricing ?? loadRenderCreditPricing();
    this.state = this.loadState();
    for (const entry of this.state.entries) {
      this.balances.set(entry.userId, (this.balances.get(entry.userId) ?? 0) + entry.credits);
    }
  }

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): UserAccountStore {
    return new UserAccountStore({
      driver: createAccountPersistenceDriver({
        env,
        jsonStorePath: readUserAccountStorePath(env),
        schemaVersion: STORE_SCHEMA_VERSION
      }),
      packages: loadCreditPackages(env),
      pricing: loadRenderCreditPricing(env)
    });
  }

  /** Resolves when the durability driver finished its boot load (postgres is async). */
  public ready(): Promise<void> {
    return this.driver.ready();
  }

  /** Which durability backend this store runs on (json | sqlite | postgres). */
  public databaseKind(): string {
    return this.driver.kind;
  }

  public listPackages(): readonly CreditPackage[] {
    return this.packages;
  }

  public renderPricing(): RenderCreditPricing {
    return this.pricing;
  }

  public register(input: {
    readonly email: string;
    readonly password: string;
    readonly displayName?: string;
  }): { readonly user: PublicUser; readonly sessionToken: string } {
    const email = normalizeEmail(input.email);
    if (!EMAIL_PATTERN.test(email)) {
      throw new UserAccountError("Email không hợp lệ.", 400);
    }
    if (typeof input.password !== "string" || input.password.length < MIN_PASSWORD_LENGTH) {
      throw new UserAccountError(`Mật khẩu cần tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`, 400);
    }
    if (this.state.users.some((user) => user.email === email)) {
      throw new UserAccountError("Email này đã có tài khoản. Hãy đăng nhập.", 409);
    }
    const displayName = sanitizeDisplayName(input.displayName) ?? email.split("@")[0] ?? "Creator";
    const salt = randomBytes(16);
    const hash = scryptSync(input.password, salt, SCRYPT_KEY_LENGTH);
    const user: UserRecord = {
      userId: `user_${randomBytes(8).toString("hex")}`,
      email,
      displayName,
      passwordSaltHex: salt.toString("hex"),
      passwordHashHex: hash.toString("hex"),
      status: "active",
      createdAt: new Date().toISOString()
    };
    this.state.users.push(user);
    const sessionToken = this.issueSession(user.userId);
    this.persist();
    return { user: this.publicUser(user), sessionToken };
  }

  public login(input: { readonly email: string; readonly password: string }): {
    readonly user: PublicUser;
    readonly sessionToken: string;
  } {
    const email = normalizeEmail(input.email);
    this.assertLoginNotLocked(email);
    const user = this.state.users.find((candidate) => candidate.email === email);
    const presented = typeof input.password === "string" ? input.password : "";
    // Always run scrypt so wrong-email and wrong-password take the same time.
    const salt = user ? Buffer.from(user.passwordSaltHex, "hex") : randomBytes(16);
    const presentedHash = scryptSync(presented, salt, SCRYPT_KEY_LENGTH);
    const expectedHash = user ? Buffer.from(user.passwordHashHex, "hex") : randomBytes(SCRYPT_KEY_LENGTH);
    const matches = presentedHash.length === expectedHash.length && timingSafeEqual(presentedHash, expectedHash);
    if (!user || !matches || user.status !== "active") {
      this.recordLoginFailure(email);
      throw new UserAccountError("Email hoặc mật khẩu chưa đúng.", 401);
    }
    this.loginFailures.delete(email);
    const sessionToken = this.issueSession(user.userId);
    this.persist();
    return { user: this.publicUser(user), sessionToken };
  }

  /** Self-service password change; revokes every other session for safety. */
  public changePassword(input: {
    readonly userId: string;
    readonly currentPassword: string;
    readonly newPassword: string;
  }): { readonly sessionToken: string } {
    const index = this.state.users.findIndex((candidate) => candidate.userId === input.userId);
    const user = index >= 0 ? this.state.users[index] : undefined;
    if (!user || user.status !== "active") {
      throw new UserAccountError("Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại.", 401);
    }
    const presentedHash = scryptSync(
      typeof input.currentPassword === "string" ? input.currentPassword : "",
      Buffer.from(user.passwordSaltHex, "hex"),
      SCRYPT_KEY_LENGTH
    );
    const expectedHash = Buffer.from(user.passwordHashHex, "hex");
    if (presentedHash.length !== expectedHash.length || !timingSafeEqual(presentedHash, expectedHash)) {
      throw new UserAccountError("Mật khẩu hiện tại chưa đúng.", 401);
    }
    if (typeof input.newPassword !== "string" || input.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new UserAccountError(`Mật khẩu mới cần tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`, 400);
    }
    this.setPassword(index, input.newPassword);
    this.revokeSessionsFor(user.userId);
    const sessionToken = this.issueSession(user.userId);
    this.persist();
    return { sessionToken };
  }

  /**
   * Operator password reset (no email infrastructure in the MVP): generates a readable
   * temporary password the operator hands to the customer over their support channel.
   * Every existing session is revoked.
   */
  public adminResetPassword(input: { readonly email: string }): { readonly temporaryPassword: string } {
    const email = normalizeEmail(input.email);
    const index = this.state.users.findIndex((candidate) => candidate.email === email);
    if (index < 0) {
      throw new UserAccountError("Không tìm thấy tài khoản với email này.", 404);
    }
    const temporaryPassword = generateTemporaryPassword();
    this.setPassword(index, temporaryPassword);
    this.revokeSessionsFor((this.state.users[index] as UserRecord).userId);
    this.loginFailures.delete(email);
    this.persist();
    return { temporaryPassword };
  }

  private setPassword(userIndex: number, newPassword: string): void {
    const user = this.state.users[userIndex] as UserRecord;
    const salt = randomBytes(16);
    const hash = scryptSync(newPassword, salt, SCRYPT_KEY_LENGTH);
    this.state.users[userIndex] = {
      ...user,
      passwordSaltHex: salt.toString("hex"),
      passwordHashHex: hash.toString("hex")
    };
  }

  private revokeSessionsFor(userId: string): void {
    for (let index = this.state.sessions.length - 1; index >= 0; index -= 1) {
      if (this.state.sessions[index]?.userId === userId) {
        this.state.sessions.splice(index, 1);
      }
    }
  }

  public logout(sessionToken: string): void {
    const tokenSha256 = sha256(sessionToken);
    const index = this.state.sessions.findIndex((session) => session.tokenSha256 === tokenSha256);
    if (index >= 0) {
      this.state.sessions.splice(index, 1);
      this.persist();
    }
  }

  /** Resolve a presented session token to its active user; used by the API auth guard. */
  public resolveSession(sessionToken: string | undefined): PublicUser | undefined {
    if (!sessionToken?.trim()) {
      return undefined;
    }
    const tokenSha256 = sha256(sessionToken.trim());
    const session = this.state.sessions.find((candidate) => candidate.tokenSha256 === tokenSha256);
    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      return undefined;
    }
    const user = this.state.users.find((candidate) => candidate.userId === session.userId);
    if (!user || user.status !== "active") {
      return undefined;
    }
    return this.publicUser(user);
  }

  public balanceOf(userId: string): number {
    return this.balances.get(userId) ?? 0;
  }

  public me(userId: string): PublicUser | undefined {
    const user = this.state.users.find((candidate) => candidate.userId === userId);
    return user && user.status === "active" ? this.publicUser(user) : undefined;
  }

  public statementOf(userId: string): readonly CreditEntry[] {
    return this.state.entries
      .filter((entry) => entry.userId === userId)
      .slice(-MAX_STATEMENT_ENTRIES)
      .reverse();
  }

  public requestTopup(input: {
    readonly userId: string;
    readonly packageId: string;
    readonly userNote?: string;
  }): TopupRequestRecord {
    const creditPackage = this.packages.find((candidate) => candidate.packageId === input.packageId);
    if (!creditPackage) {
      throw new UserAccountError("Gói nạp không tồn tại.", 404);
    }
    return this.requestTopupForPackage({
      userId: input.userId,
      creditPackage,
      ...(input.userNote !== undefined ? { userNote: input.userNote } : {})
    });
  }

  /** Same as requestTopup, but the caller resolves the package (admin-editable catalog). */
  public requestTopupForPackage(input: {
    readonly userId: string;
    readonly creditPackage: CreditPackage;
    readonly userNote?: string;
  }): TopupRequestRecord {
    const creditPackage = input.creditPackage;
    // Double-click / flaky-retry guard: an identical pending request is returned as-is,
    // so one bank transfer can never become two credited top-ups.
    const existingPending = this.state.topups.find(
      (topup) => topup.userId === input.userId && topup.status === "pending" && topup.packageId === creditPackage.packageId
    );
    if (existingPending) {
      return existingPending;
    }
    const pendingCount = this.state.topups.filter(
      (topup) => topup.userId === input.userId && topup.status === "pending"
    ).length;
    if (pendingCount >= MAX_TOPUPS_PER_USER_PENDING) {
      throw new UserAccountError("Bạn đang có quá nhiều yêu cầu nạp chờ duyệt. Vui lòng chờ xử lý xong.", 429);
    }
    const topup: TopupRequestRecord = {
      topupId: `topup_${randomBytes(8).toString("hex")}`,
      userId: input.userId,
      packageId: creditPackage.packageId,
      credits: creditPackage.credits,
      amountVnd: creditPackage.priceVnd,
      ...(sanitizeNote(input.userNote) ? { userNote: sanitizeNote(input.userNote) as string } : {}),
      status: "pending",
      requestedAt: new Date().toISOString()
    };
    this.state.topups.push(topup);
    this.persist();
    return topup;
  }

  public topupsOf(userId: string): readonly TopupRequestRecord[] {
    return this.state.topups.filter((topup) => topup.userId === userId).slice(-50).reverse();
  }

  public pendingTopups(): readonly (TopupRequestRecord & { readonly email: string })[] {
    return this.state.topups
      .filter((topup) => topup.status === "pending")
      .map((topup) => ({
        ...topup,
        email: this.state.users.find((user) => user.userId === topup.userId)?.email ?? "unknown"
      }));
  }

  public decideTopup(input: {
    readonly topupId: string;
    readonly approve: boolean;
    readonly decisionNote?: string;
  }): TopupRequestRecord {
    const index = this.state.topups.findIndex((topup) => topup.topupId === input.topupId);
    const existing = index >= 0 ? this.state.topups[index] : undefined;
    if (!existing) {
      throw new UserAccountError("Yêu cầu nạp không tồn tại.", 404);
    }
    if (existing.status !== "pending") {
      throw new UserAccountError("Yêu cầu nạp này đã được xử lý rồi.", 409);
    }
    const decided: TopupRequestRecord = {
      ...existing,
      status: input.approve ? "approved" : "rejected",
      decidedAt: new Date().toISOString(),
      ...(sanitizeNote(input.decisionNote) ? { decisionNote: sanitizeNote(input.decisionNote) as string } : {})
    };
    this.state.topups[index] = decided;
    if (input.approve) {
      this.appendEntry({
        userId: decided.userId,
        type: "topup",
        credits: decided.credits,
        note: `Nạp ${decided.credits} credits (${decided.packageId})`,
        topupId: decided.topupId
      });
    }
    this.persist();
    return decided;
  }

  /** One-line business health for the operator desk. */
  public revenueSummary(): {
    readonly customerCount: number;
    readonly approvedTopupCount: number;
    readonly totalRevenueVnd: number;
    readonly totalCreditsSold: number;
    readonly outstandingCreditsLiability: number;
  } {
    const approved = this.state.topups.filter((topup) => topup.status === "approved");
    let outstanding = 0;
    for (const balance of this.balances.values()) {
      outstanding += Math.max(0, balance);
    }
    return {
      customerCount: this.state.users.length,
      approvedTopupCount: approved.length,
      totalRevenueVnd: approved.reduce((sum, topup) => sum + topup.amountVnd, 0),
      totalCreditsSold: approved.reduce((sum, topup) => sum + topup.credits, 0),
      outstandingCreditsLiability: outstanding
    };
  }

  /** Operator support view: one customer's balance, latest movements, and top-ups. */
  public adminLookup(emailInput: string): {
    readonly account: PublicUser;
    readonly statement: readonly CreditEntry[];
    readonly topups: readonly TopupRequestRecord[];
  } {
    const email = normalizeEmail(emailInput);
    const user = this.state.users.find((candidate) => candidate.email === email);
    if (!user) {
      throw new UserAccountError("Không tìm thấy tài khoản với email này.", 404);
    }
    return {
      account: this.publicUser(user),
      statement: this.statementOf(user.userId).slice(0, 15),
      topups: this.topupsOf(user.userId).slice(0, 10)
    };
  }

  public adminAdjust(input: { readonly email: string; readonly credits: number; readonly note?: string }): PublicUser {
    const email = normalizeEmail(input.email);
    const user = this.state.users.find((candidate) => candidate.email === email);
    if (!user) {
      throw new UserAccountError("Không tìm thấy tài khoản với email này.", 404);
    }
    const adjustedCredits = Number.isFinite(input.credits) ? Math.trunc(input.credits) : 0;
    if (adjustedCredits === 0 || Math.abs(adjustedCredits) > 1_000_000) {
      throw new UserAccountError("Số credits điều chỉnh không hợp lệ.", 400);
    }
    this.appendEntry({
      userId: user.userId,
      type: "admin_adjust",
      credits: adjustedCredits,
      note: sanitizeNote(input.note) ?? "Điều chỉnh bởi quản trị viên"
    });
    this.persist();
    return this.publicUser(user);
  }

  public estimateChargeFor(input: { readonly durationTargetSeconds?: number; readonly qualityMode?: string }): number {
    return estimateRenderCredits({ ...input, pricing: this.pricing });
  }

  /** Charge a render up front; throws 402 when the balance cannot cover it. */
  public chargeRender(input: { readonly userId: string; readonly jobId: string; readonly credits: number }): CreditEntry {
    if (!Number.isFinite(input.credits) || input.credits <= 0) {
      throw new UserAccountError("Số credits tính phí không hợp lệ.", 400);
    }
    const balance = this.balanceOf(input.userId);
    if (balance < input.credits) {
      throw new UserAccountError(
        `Số dư không đủ: cần ${input.credits} credits, hiện có ${balance}. Hãy nạp thêm để tiếp tục.`,
        402
      );
    }
    const entry = this.appendEntry({
      userId: input.userId,
      type: "render_charge",
      credits: -input.credits,
      note: `Trừ ${input.credits} credits cho video ${input.jobId}`,
      jobId: input.jobId
    });
    this.persist();
    return entry;
  }

  /**
   * Boot-time settlement: charges are durable but refund callbacks live in process memory,
   * so a crash/restart could leave customers charged for jobs that will never finish.
   * For every unmatched render charge, ask the job manager for the job's status: jobs that
   * are gone (restart wiped them) or ended without success are refunded; live or succeeded
   * jobs keep their charge. Returns the number of refunds issued.
   */
  public reconcileRenderCharges(
    statusOf: (jobId: string) => string | undefined,
    options?: { readonly mode?: "refund" | "queue" }
  ): number {
    const mode = options?.mode ?? "refund";
    const KEEP_STATUSES = new Set(["queued", "running", "succeeded", "paused_for_review", "paused_for_revision"]);
    let refunded = 0;
    const charges = this.state.entries.filter((entry) => entry.type === "render_charge" && entry.jobId);
    for (const charge of charges) {
      const jobId = charge.jobId as string;
      const alreadyRefunded = this.state.entries.some(
        (entry) => entry.type === "render_refund" && entry.jobId === jobId && entry.userId === charge.userId
      );
      if (alreadyRefunded) {
        continue;
      }
      const status = statusOf(jobId);
      if (status && KEEP_STATUSES.has(status)) {
        continue;
      }
      if (!status) {
        // Unknown job: only refund RECENT charges (interrupted by a crash/restart).
        // Older unknown charges are almost always delivered videos that aged out of the
        // job-history retention window — never silently refund those.
        const chargeAgeMs = Date.now() - Date.parse(charge.at);
        if (!Number.isFinite(chargeAgeMs) || chargeAgeMs > 48 * 60 * 60 * 1000) {
          continue;
        }
      }
      if (mode === "queue") {
        if (this.queueRefundRequest({ userId: charge.userId, jobId, reason: "đối soát sau khi hệ thống khởi động lại" })) {
          refunded += 1;
        }
        continue;
      }
      this.refundRender({ userId: charge.userId, jobId, reason: "đối soát sau khi hệ thống khởi động lại" });
      refunded += 1;
    }
    return refunded;
  }

  /**
   * Manual-refund policy: queue the case for the operator instead of refunding
   * automatically (admin-favorable default). Idempotent per job — one queue entry, and
   * never queued once a refund already exists.
   */
  public queueRefundRequest(input: {
    readonly userId: string;
    readonly jobId: string;
    readonly reason: string;
  }): RefundRequestRecord | undefined {
    const charge = this.state.entries.find(
      (entry) => entry.userId === input.userId && entry.jobId === input.jobId && entry.type === "render_charge"
    );
    const alreadyRefunded = this.state.entries.some(
      (entry) => entry.userId === input.userId && entry.jobId === input.jobId && entry.type === "render_refund"
    );
    const alreadyQueued = this.state.refundRequests.some(
      (request) => request.jobId === input.jobId && request.userId === input.userId
    );
    if (!charge || alreadyRefunded || alreadyQueued) {
      return undefined;
    }
    const request: RefundRequestRecord = {
      refundRequestId: `refundreq_${randomBytes(8).toString("hex")}`,
      userId: input.userId,
      jobId: input.jobId,
      credits: -charge.credits,
      reason: sanitizeNote(input.reason) ?? "video khong thanh cong",
      status: "pending",
      requestedAt: new Date().toISOString()
    };
    this.state.refundRequests.push(request);
    this.persist();
    return request;
  }

  public pendingRefundRequests(): readonly (RefundRequestRecord & { readonly email: string })[] {
    return this.state.refundRequests
      .filter((request) => request.status === "pending")
      .map((request) => ({
        ...request,
        email: this.state.users.find((user) => user.userId === request.userId)?.email ?? "unknown"
      }));
  }

  public decideRefundRequest(input: { readonly refundRequestId: string; readonly approve: boolean }): RefundRequestRecord {
    const index = this.state.refundRequests.findIndex((request) => request.refundRequestId === input.refundRequestId);
    const existing = index >= 0 ? this.state.refundRequests[index] : undefined;
    if (!existing) {
      throw new UserAccountError("Yêu cầu hoàn tiền không tồn tại.", 404);
    }
    if (existing.status !== "pending") {
      throw new UserAccountError("Yêu cầu hoàn tiền này đã được xử lý rồi.", 409);
    }
    if (input.approve) {
      this.refundRender({ userId: existing.userId, jobId: existing.jobId, reason: "admin duyệt hoàn" });
    }
    const decided: RefundRequestRecord = {
      ...existing,
      status: input.approve ? "refunded" : "dismissed",
      decidedAt: new Date().toISOString()
    };
    this.state.refundRequests[index] = decided;
    this.persist();
    return decided;
  }

  /** Refund the charge for a job (idempotent — refunds at most once per job). */
  public refundRender(input: { readonly userId: string; readonly jobId: string; readonly reason: string }): CreditEntry | undefined {
    const charge = this.state.entries.find(
      (entry) => entry.userId === input.userId && entry.jobId === input.jobId && entry.type === "render_charge"
    );
    const alreadyRefunded = this.state.entries.some(
      (entry) => entry.userId === input.userId && entry.jobId === input.jobId && entry.type === "render_refund"
    );
    if (!charge || alreadyRefunded) {
      return undefined;
    }
    const entry = this.appendEntry({
      userId: input.userId,
      type: "render_refund",
      credits: -charge.credits,
      note: `Hoàn ${-charge.credits} credits (${input.reason}) cho video ${input.jobId}`,
      jobId: input.jobId
    });
    this.persist();
    return entry;
  }

  private publicUser(user: UserRecord): PublicUser {
    return {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      balanceCredits: this.balanceOf(user.userId)
    };
  }

  private issueSession(userId: string): string {
    const token = `sess_${randomBytes(24).toString("hex")}`;
    const now = Date.now();
    this.state.sessions.push({
      tokenSha256: sha256(token),
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
    });
    // Drop expired sessions so the store cannot grow without bound.
    this.pruneSessions(now);
    return token;
  }

  private pruneSessions(now: number): void {
    for (let index = this.state.sessions.length - 1; index >= 0; index -= 1) {
      const session = this.state.sessions[index];
      if (session && Date.parse(session.expiresAt) <= now) {
        this.state.sessions.splice(index, 1);
      }
    }
  }

  private assertLoginNotLocked(email: string): void {
    const failures = this.loginFailures.get(email);
    if (!failures) {
      return;
    }
    if (Date.now() - failures.firstAt > LOGIN_FAILURE_WINDOW_MS) {
      this.loginFailures.delete(email);
      return;
    }
    if (failures.count >= MAX_LOGIN_FAILURES) {
      throw new UserAccountError("Sai mật khẩu quá nhiều lần. Vui lòng thử lại sau 10 phút.", 429);
    }
  }

  private recordLoginFailure(email: string): void {
    const now = Date.now();
    const failures = this.loginFailures.get(email);
    if (!failures || now - failures.firstAt > LOGIN_FAILURE_WINDOW_MS) {
      this.loginFailures.set(email, { count: 1, firstAt: now });
      return;
    }
    failures.count += 1;
  }

  private appendEntry(input: {
    readonly userId: string;
    readonly type: CreditEntryType;
    readonly credits: number;
    readonly note: string;
    readonly jobId?: string;
    readonly topupId?: string;
  }): CreditEntry {
    const entry: CreditEntry = {
      entryId: `credit_${randomBytes(8).toString("hex")}`,
      userId: input.userId,
      type: input.type,
      credits: input.credits,
      note: input.note,
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.topupId ? { topupId: input.topupId } : {}),
      at: new Date().toISOString()
    };
    this.state.entries.push(entry);
    this.balances.set(entry.userId, (this.balances.get(entry.userId) ?? 0) + entry.credits);
    return entry;
  }

  private loadState(): StoreState {
    const persisted: PersistedAccountState | undefined = this.driver.load();
    if (!persisted) {
      return { schemaVersion: STORE_SCHEMA_VERSION, users: [], sessions: [], entries: [], topups: [], refundRequests: [] };
    }
    if (persisted.schemaVersion !== STORE_SCHEMA_VERSION) {
      throw new Error(`User account store schema mismatch (${this.driver.kind}).`);
    }
    return {
      schemaVersion: STORE_SCHEMA_VERSION,
      users: Array.isArray(persisted.users) ? (persisted.users as UserRecord[]) : [],
      sessions: Array.isArray(persisted.sessions) ? (persisted.sessions as SessionRecord[]) : [],
      entries: Array.isArray(persisted.entries) ? (persisted.entries as CreditEntry[]) : [],
      topups: Array.isArray(persisted.topups) ? (persisted.topups as TopupRequestRecord[]) : [],
      refundRequests: Array.isArray((persisted as { refundRequests?: unknown[] }).refundRequests)
        ? ((persisted as { refundRequests?: unknown[] }).refundRequests as RefundRequestRecord[])
        : []
    };
  }

  private persist(): void {
    this.driver.persist(this.state);
  }
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sanitizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = value.replace(CONTROL_CHARACTER_GLOBAL_PATTERN, " ").trim().slice(0, 60);
  return cleaned || undefined;
}

function sanitizeNote(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const cleaned = value.replace(CONTROL_CHARACTER_GLOBAL_PATTERN, " ").trim().slice(0, 240);
  return cleaned || undefined;
}

/** Readable, unambiguous temp password (no 0/O/1/l), 10 chars + digits. */
function generateTemporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let password = "";
  const bytes = randomBytes(10);
  for (const byte of bytes) {
    password += alphabet[byte % alphabet.length];
  }
  return password;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("CINEJELLY_CREDITS_PER_RENDER_SECOND must be a positive number.");
  }
  return parsed;
}
