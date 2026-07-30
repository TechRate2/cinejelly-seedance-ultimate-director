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

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

/**
 * Password hashing on the libuv threadpool, never the event loop. scryptSync would block the
 * single Node thread for ~50-80ms per call, so a burst of login/register attempts could stall
 * the whole server (an unauthenticated event-loop DoS). The async form keeps the loop free.
 */
function hashPasswordAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, (error, derivedKey) => {
      if (error) {
        reject(error);
      } else {
        resolve(derivedKey);
      }
    });
  });
}
import {
  createAccountPersistenceDriver,
  JsonFileAccountDriver,
  type AccountPersistenceDriver,
  type PersistedAccountState
} from "./account-persistence.js";

export const STORE_SCHEMA_VERSION = "cinejelly.user-account-store.v1";
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
  /**
   * Anti-farm trial pack: claimable ONCE per account. Requires a real (admin-approved) payment,
   * so it can't be farmed across throwaway accounts, and credits can't be cashed out — only spent.
   */
  readonly oncePerAccount?: boolean;
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
 * Settings tab. Credits NEVER expire (one-time top-ups — a deliberate edge over Topview's
 * monthly-reset credits). With metered pipeline pricing (1 credit = ~$0.01 of real provider
 * cost), the per-credit SELL price is the margin: it steps down from +25% (Starter) toward ~+7%
 * (Business) to reward bigger top-ups and pull buyers up the ladder. The 🎁 trial pack is a
 * once-per-account paid hook (slight loss-leader, farm-proof: real admin-approved payment, no
 * cash-out). Tune everything (prices, credits, unit costs, markup) live in admin Settings.
 */
export const DEFAULT_CREDIT_PACKAGES: readonly CreditPackage[] = [
  { packageId: "goi_dungthu", label: "🎁 Dùng thử", credits: 400, priceUsd: 3, priceVnd: 81_000, bonusNote: "1 LẦN/tài khoản • tặng +33% • dùng thử render thật", oncePerAccount: true },
  { packageId: "goi_khoidiem", label: "⚡ Khởi điểm", credits: 1_600, priceUsd: 20, priceVnd: 540_000, bonusNote: "Vào cửa" },
  { packageId: "goi_creator", label: "🎬 Creator", credits: 6_000, priceUsd: 69, priceVnd: 1_863_000, bonusNote: "Rẻ hơn ~8%/credit" },
  { packageId: "goi_pro", label: "⭐ Pro", credits: 9_000, priceUsd: 99, priceVnd: 2_673_000, bonusNote: "PHỔ BIẾN NHẤT • rẻ hơn ~12%/credit" },
  { packageId: "goi_business", label: "👑 Business", credits: 28_000, priceUsd: 299, priceVnd: 8_073_000, bonusNote: "RẺ NHẤT mỗi credit • credits KHÔNG hết hạn" }
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

export type CreditEntryType = "topup" | "render_charge" | "render_refund" | "render_settled" | "admin_adjust";

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
  // Coerce a non-finite/NaN duration to the default so the charge is always a real number
  // (a NaN here would slip past a "balance < credits" check and leave a job queued but uncharged).
  const requestedSeconds = input.durationTargetSeconds;
  const safeSeconds = Number.isFinite(requestedSeconds) ? (requestedSeconds as number) : 15;
  const seconds = Math.max(1, Math.min(3_600, safeSeconds));
  const rawMultiplier = input.pricing.qualityMultipliers[input.qualityMode ?? "standard"];
  // Default an unknown/unpriced quality tier to 1.0 (standard), never below — an unrecognised
  // mode must never bill LESS than standard.
  const multiplier = Number.isFinite(rawMultiplier) && (rawMultiplier as number) > 0 ? (rawMultiplier as number) : 1;
  return Math.max(
    input.pricing.minimumChargeCredits,
    Math.ceil(seconds * input.pricing.creditsPerRenderSecond * multiplier)
  );
}

/**
 * Metered "total pipeline cost" pricing. Instead of a flat per-second proxy, the customer is
 * charged the REAL provider cost of producing their clip — the dominant driver being video
 * render seconds × the number of candidate passes the chosen quality renders (economy 1 /
 * standard 2 / high 3 / ultimate 4), at the chosen speed tier's Atlas $/second — plus a small
 * overhead multiplier that covers keyframe stills, the planning LLM call, and audio. The cost is
 * expressed in credits via a fixed cost-basis (1 credit = creditCostBasisUsd of provider cost);
 * the profit margin lives in the package price (what a credit is SOLD for), not here. So this
 * number is the honest cost floor, and it auto-tracks Atlas price moves (feed live rates in).
 */
export interface PipelineCostConfig {
  /** Provider-cost value of ONE credit, in USD (e.g. 0.01 → 1 credit = 1 cent of Atlas cost). */
  readonly creditCostBasisUsd: number;
  /** Atlas $/second of video, per speed tier (mini/fast/standard). The cost driver (~85-95%). */
  readonly videoCostUsdPerSecondByTier: Readonly<Record<string, number>>;
  /** Candidate render passes billed per quality mode (each pass re-renders the full duration). */
  readonly candidateCountByQuality: Readonly<Record<string, number>>;
  /**
   * Repair render passes billed per quality mode. The pipeline re-renders (repairs) failed shots
   * up to this many times on the higher tiers; billing them conservatively (worst case) keeps the
   * charge >= real provider cost so margin can't invert on high/ultimate. Matches
   * repairAttemptCountForQuality: economy 0 / standard 1 / high 2 / ultimate 3.
   */
  readonly repairCountByQuality: Readonly<Record<string, number>>;
  /** Extra render-seconds per shot for QC test-takes on non-economy modes (0 = disabled). */
  readonly testTakeSecondsPerShot: number;
  /** Rough seconds-per-shot used to estimate shot count (for the test-take allowance). */
  readonly avgSecondsPerShot: number;
  /** Multiplier (>=1) covering keyframe images + planning LLM + audio on top of the video cost. */
  readonly overheadMultiplier: number;
  /** Never charge below this many credits (covers tiny clips + minimum viable margin). */
  readonly minimumChargeCredits: number;
}

export function loadPipelineCostConfig(env: NodeJS.ProcessEnv = process.env): PipelineCostConfig {
  const standardRate = readPositiveNumber(env.CINEJELLY_VIDEO_COST_USD_PER_SECOND_STANDARD, 0.09);
  const fastRate = readPositiveNumber(env.CINEJELLY_VIDEO_COST_USD_PER_SECOND_FAST, 0.072);
  const miniRate = readPositiveNumber(env.CINEJELLY_VIDEO_COST_USD_PER_SECOND_MINI, 0.045);
  return {
    creditCostBasisUsd: readPositiveNumber(env.CINEJELLY_CREDIT_COST_BASIS_USD, 0.01),
    videoCostUsdPerSecondByTier: { mini: miniRate, fast: fastRate, standard: standardRate },
    candidateCountByQuality: { economy: 1, standard: 2, high: 3, ultimate: 4 },
    repairCountByQuality: { economy: 0, standard: 1, high: 2, ultimate: 3 },
    testTakeSecondsPerShot: readNonNegativeNumber(env.CINEJELLY_TEST_TAKE_SECONDS_PER_SHOT, 4),
    avgSecondsPerShot: Math.max(1, readPositiveNumber(env.CINEJELLY_AVG_SECONDS_PER_SHOT, 5)),
    overheadMultiplier: readPositiveNumber(env.CINEJELLY_PIPELINE_OVERHEAD_MULTIPLIER, 1.15),
    minimumChargeCredits: Math.max(1, Math.round(readPositiveNumber(env.CINEJELLY_MIN_CHARGE_CREDITS, 20)))
  };
}

export interface PipelineCostEstimate {
  readonly credits: number;
  readonly estimatedCostUsd: number;
  readonly billedRenderSeconds: number;
  readonly candidateCount: number;
  readonly tier: string;
}

/**
 * Estimate the credits to charge for one clip. Deterministic and conservative: uses the actual
 * candidate multiplier of the chosen quality so re-render passes are billed (never eaten), and a
 * safety overhead multiplier so real cost rarely exceeds the quote.
 */
export function estimatePipelineRenderCredits(input: {
  readonly durationTargetSeconds?: number;
  readonly qualityMode?: string;
  readonly tier?: string;
  readonly config: PipelineCostConfig;
}): PipelineCostEstimate {
  const config = input.config;
  const requestedSeconds = input.durationTargetSeconds;
  const safeSeconds = Number.isFinite(requestedSeconds) ? (requestedSeconds as number) : 15;
  const seconds = Math.max(1, Math.min(3_600, safeSeconds));
  const quality = input.qualityMode ?? "standard";
  const rawCandidates = config.candidateCountByQuality[quality];
  // Unknown quality must never bill fewer passes than standard (never under-charge).
  const candidateCount = Math.max(
    1,
    Number.isFinite(rawCandidates) ? (rawCandidates as number) : config.candidateCountByQuality.standard ?? 2
  );
  // Repair passes are billed too (the pipeline re-renders failed shots on higher tiers). Billing
  // the worst case keeps the charge >= real cost so margin can't invert on high/ultimate.
  const rawRepairs = config.repairCountByQuality[quality];
  const repairCount = Math.max(
    0,
    Number.isFinite(rawRepairs) ? (rawRepairs as number) : config.repairCountByQuality.standard ?? 1
  );
  const tier = input.tier && config.videoCostUsdPerSecondByTier[input.tier] !== undefined ? input.tier : "standard";
  const rawTierRate = config.videoCostUsdPerSecondByTier[tier];
  const tierRate = Number.isFinite(rawTierRate) && (rawTierRate as number) > 0 ? (rawTierRate as number) : 0.09;
  // Test-takes: short QC renders per shot on non-economy modes. Estimate shot count from duration.
  const isEconomy = quality === "economy";
  const estimatedShots = Math.max(1, Math.ceil(seconds / Math.max(1, config.avgSecondsPerShot)));
  const testTakeSeconds =
    !isEconomy && config.testTakeSecondsPerShot > 0 ? estimatedShots * config.testTakeSecondsPerShot : 0;
  const billedRenderSeconds = seconds * (candidateCount + repairCount) + testTakeSeconds;
  const videoUsd = billedRenderSeconds * tierRate;
  const overhead = Number.isFinite(config.overheadMultiplier) && config.overheadMultiplier >= 1 ? config.overheadMultiplier : 1;
  const totalUsd = videoUsd * overhead;
  const basis = Number.isFinite(config.creditCostBasisUsd) && config.creditCostBasisUsd > 0 ? config.creditCostBasisUsd : 0.01;
  const credits = Math.max(config.minimumChargeCredits, Math.ceil(totalUsd / basis));
  return {
    credits,
    estimatedCostUsd: Math.round(totalUsd * 10_000) / 10_000,
    billedRenderSeconds,
    candidateCount,
    tier
  };
}

/**
 * Package IDs that are ALWAYS once-per-account, independent of the editable catalog. Backstops the
 * `oncePerAccount` flag so re-saving packages (admin Settings / env JSON) can't silently disable
 * the paid-trial farm guard. Override with CINEJELLY_ONCE_PER_ACCOUNT_PACKAGE_IDS (comma list).
 */
export function oncePerAccountPackageIds(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const raw = env.CINEJELLY_ONCE_PER_ACCOUNT_PACKAGE_IDS?.trim();
  if (!raw) {
    return ["goi_dungthu"];
  }
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
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
      ...(record.bonusNote?.trim() ? { bonusNote: record.bonusNote.trim() } : {}),
      ...(record.oncePerAccount === true ? { oncePerAccount: true as const } : {})
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

/**
 * Live sessions one account may hold. A person uses a handful of devices; anything beyond that is
 * accumulated history that only grows the accounts file and slows every session lookup.
 */
const MAX_SESSIONS_PER_ACCOUNT = 10;

export class UserAccountStore {
  private readonly driver: AccountPersistenceDriver;
  private readonly packages: readonly CreditPackage[];
  private readonly pricing: RenderCreditPricing;
  // Reassigned once by hydrate() for async (postgres) drivers after their boot load completes.
  private state: StoreState;
  // False only while an async (postgres) driver is still loading; writes are blocked until true so an
  // empty boot snapshot can never overwrite durable account data.
  private hydrated = true;
  // Set true when the boot load REJECTED (DB unreachable) — distinguishes a transient "still loading"
  // 503 from a hard "database is down, fix it and restart" outage so the operator sees the real cause.
  private hydrationFailed = false;
  // Resolves when durable state is fully loaded (immediately for json/sqlite; after the boot load +
  // reload for postgres). `ready()` returns it so callers can await a hydrated store.
  private readonly hydrationPromise: Promise<void>;
  // > 0 when the DB backend was switched (kind != json) but its store is EMPTY while an old
  // user-accounts.json still holds accounts — an un-migrated switch. The data is SAFE (still in the
  // json file, and the write-guard above prevents a wipe) but not loaded; the operator must run
  // `npm run db:migrate`. Surfaced on boot, at /health, and to the operator.
  private orphanedJsonUserCount = 0;
  // Path of the JSON account file — used only for the orphan-detection check.
  private readonly jsonStorePath: string | undefined;
  private readonly balances = new Map<string, number>();
  private readonly loginFailures = new Map<string, { count: number; firstAt: number }>();
  // Emails with a login verification currently in flight. Serialising to one attempt per email
  // stops a burst of concurrent logins from all clearing the lockout check before any failure is
  // recorded across the scrypt `await` (a check-then-act race that would outrun the attempt cap).
  private readonly loginInFlight = new Set<string>();

  public constructor(input: {
    readonly storePath?: string;
    readonly driver?: AccountPersistenceDriver;
    readonly packages?: readonly CreditPackage[];
    readonly pricing?: RenderCreditPricing;
    /** JSON account-file path, for the "switched DB but old json still has accounts" orphan check. */
    readonly jsonStorePath?: string;
  }) {
    if (!input.driver && !input.storePath) {
      throw new Error("UserAccountStore needs a persistence driver or a JSON store path.");
    }
    this.driver = input.driver ?? new JsonFileAccountDriver(input.storePath as string);
    this.jsonStorePath = input.jsonStorePath ?? input.storePath;
    this.packages = input.packages ?? DEFAULT_CREDIT_PACKAGES;
    this.pricing = input.pricing ?? loadRenderCreditPricing();
    this.state = this.loadState();
    this.rebuildBalances();
    // The postgres driver loads ASYNCHRONOUSLY: its boot() populates load() only after an await, so at
    // construction time load() returned undefined and this.state is EMPTY. Re-hydrate once the driver is
    // ready, and BLOCK writes until then — otherwise the first persist() would DELETE-and-replace the
    // mutable tables with the empty snapshot and WIPE every existing account (silent data-loss on every
    // restart, exactly on the managed-SQL backend the deploy guide recommends for growth). Synchronous
    // drivers (json/sqlite) load fully in the constructor, so they are hydrated immediately.
    this.hydrated = this.driver.kind !== "postgres";
    this.hydrationPromise = this.hydrated
      ? Promise.resolve()
      : this.hydrate().catch((error: unknown) => {
          // Boot load failed (DB unreachable): stay un-hydrated so writes keep returning 503 instead of
          // wiping data; the node needs a reachable DB and a restart to recover.
          this.hydrationFailed = true;
          console.error(
            "[user-account-store] account hydrate failed (database unreachable):",
            error instanceof Error ? error.message : error
          );
        });
    // Sync drivers (json/sqlite) are fully loaded now, so the orphan check can run immediately; the
    // postgres path runs it inside hydrate() once its async load completes.
    if (this.hydrated) {
      this.detectOrphanedJsonStore();
    }
  }

  private rebuildBalances(): void {
    this.balances.clear();
    for (const entry of this.state.entries) {
      this.balances.set(entry.userId, (this.balances.get(entry.userId) ?? 0) + entry.credits);
    }
  }

  /**
   * Re-read durable state once an asynchronous driver (postgres) has finished its boot load, then
   * unblock writes. If the boot load REJECTS (DB unreachable), `hydrated` stays false so writes remain
   * blocked (a clear 503) rather than persisting an empty snapshot over real data — the node needs its
   * database to serve accounts, so refusing is the safe state until it is restarted with a reachable DB.
   */
  private async hydrate(): Promise<void> {
    await this.driver.ready();
    this.state = this.loadState();
    this.rebuildBalances();
    this.hydrated = true;
    this.detectOrphanedJsonStore();
  }

  /**
   * Detect an un-migrated DB switch: a non-json backend loaded EMPTY while the old user-accounts.json
   * still holds accounts. The data is safe (the write-guard prevents a wipe and the json file is intact)
   * but invisible until migrated, so warn loudly and expose it for /health + the operator.
   */
  private detectOrphanedJsonStore(): void {
    if (this.driver.kind === "json" || this.state.users.length > 0 || !this.jsonStorePath) {
      return;
    }
    try {
      const jsonState = new JsonFileAccountDriver(this.jsonStorePath).load();
      const jsonUserCount = jsonState?.users?.length ?? 0;
      if (jsonUserCount > 0) {
        this.orphanedJsonUserCount = jsonUserCount;
        console.warn(
          `\n[CẢNH BÁO] Đang chạy CINEJELLY_DATABASE_KIND=${this.driver.kind} nhưng cơ sở dữ liệu này ĐANG RỖNG, ` +
            `trong khi file cũ ${this.jsonStorePath} còn ${jsonUserCount} tài khoản. Dữ liệu KHÔNG mất (vẫn ở file json) ` +
            `nhưng chưa được chuyển sang — khách hàng cũ sẽ thấy như bị mất tài khoản. Chạy "npm run db:migrate" để chuyển, ` +
            `hoặc đổi lại CINEJELLY_DATABASE_KIND=json.\n`
        );
      }
    } catch {
      // The json file is unreadable/absent — no orphan to claim.
    }
  }

  /** Diagnosis surface: number of accounts stranded in an old JSON file after an un-migrated DB switch. */
  public orphanedJsonAccountCount(): number {
    return this.orphanedJsonUserCount;
  }

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): UserAccountStore {
    return new UserAccountStore({
      driver: createAccountPersistenceDriver({
        env,
        jsonStorePath: readUserAccountStorePath(env),
        schemaVersion: STORE_SCHEMA_VERSION
      }),
      packages: loadCreditPackages(env),
      pricing: loadRenderCreditPricing(env),
      jsonStorePath: readUserAccountStorePath(env)
    });
  }

  /** Resolves when the store is fully hydrated (driver boot load + in-memory reload complete). */
  public ready(): Promise<void> {
    return this.hydrationPromise;
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

  public async register(input: {
    readonly email: string;
    readonly password: string;
    readonly displayName?: string;
  }): Promise<{ readonly user: PublicUser; readonly sessionToken: string }> {
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
    const hash = await hashPasswordAsync(input.password, salt);
    // Re-check AFTER the scrypt await (which yields the event loop): two concurrent registers for the
    // same email both passed the pre-await check, and without this both would push a duplicate user
    // record for one email — later .find(email) picks the first and orphans the second + its credits
    // (deep-audit LOW: register had no equivalent of loginInFlight).
    if (this.state.users.some((existing) => existing.email === email)) {
      throw new UserAccountError("Email này đã có tài khoản. Hãy đăng nhập.", 409);
    }
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

  public async login(input: { readonly email: string; readonly password: string }): Promise<{
    readonly user: PublicUser;
    readonly sessionToken: string;
  }> {
    const email = normalizeEmail(input.email);
    this.assertLoginNotLocked(email);
    // One in-flight attempt per email: a concurrent burst can't all slip past the lockout check
    // before any of them records a failure across the scrypt await.
    if (this.loginInFlight.has(email)) {
      throw new UserAccountError("Đang xử lý một lần đăng nhập cho email này — thử lại sau giây lát.", 429);
    }
    this.loginInFlight.add(email);
    try {
      const user = this.state.users.find((candidate) => candidate.email === email);
      const presented = typeof input.password === "string" ? input.password : "";
      // Always run scrypt so wrong-email and wrong-password take the same time.
      const salt = user ? Buffer.from(user.passwordSaltHex, "hex") : randomBytes(16);
      const presentedHash = await hashPasswordAsync(presented, salt);
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
    } finally {
      this.loginInFlight.delete(email);
    }
  }

  /** Self-service password change; revokes every other session for safety. */
  public async changePassword(input: {
    readonly userId: string;
    readonly currentPassword: string;
    readonly newPassword: string;
  }): Promise<{ readonly sessionToken: string }> {
    const index = this.state.users.findIndex((candidate) => candidate.userId === input.userId);
    const user = index >= 0 ? this.state.users[index] : undefined;
    if (!user || user.status !== "active") {
      throw new UserAccountError("Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại.", 401);
    }
    const presentedHash = await hashPasswordAsync(
      typeof input.currentPassword === "string" ? input.currentPassword : "",
      Buffer.from(user.passwordSaltHex, "hex")
    );
    const expectedHash = Buffer.from(user.passwordHashHex, "hex");
    if (presentedHash.length !== expectedHash.length || !timingSafeEqual(presentedHash, expectedHash)) {
      throw new UserAccountError("Mật khẩu hiện tại chưa đúng.", 401);
    }
    if (typeof input.newPassword !== "string" || input.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new UserAccountError(`Mật khẩu mới cần tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`, 400);
    }
    await this.setPassword(index, input.newPassword);
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
  public async adminResetPassword(input: { readonly email: string }): Promise<{ readonly temporaryPassword: string }> {
    const email = normalizeEmail(input.email);
    const index = this.state.users.findIndex((candidate) => candidate.email === email);
    if (index < 0) {
      throw new UserAccountError("Không tìm thấy tài khoản với email này.", 404);
    }
    const temporaryPassword = generateTemporaryPassword();
    await this.setPassword(index, temporaryPassword);
    this.revokeSessionsFor((this.state.users[index] as UserRecord).userId);
    this.loginFailures.delete(email);
    this.persist();
    return { temporaryPassword };
  }

  private async setPassword(userIndex: number, newPassword: string): Promise<void> {
    const user = this.state.users[userIndex] as UserRecord;
    const salt = randomBytes(16);
    const hash = await hashPasswordAsync(newPassword, salt);
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
    // Anti-farm: a once-per-account pack (the paid trial) can be claimed a single time. Any prior
    // non-rejected request for it blocks a second claim, so throwaway accounts can't re-farm the
    // bonus (and the payment itself is admin-approved, adding a human gate). The rule fires on the
    // package's flag OR a server-side protected-ID set, so it survives even if the editable catalog
    // (admin Settings / env JSON) drops the flag when packages are re-saved.
    const isOncePerAccount =
      creditPackage.oncePerAccount === true || oncePerAccountPackageIds().includes(creditPackage.packageId);
    if (isOncePerAccount) {
      const alreadyClaimed = this.state.topups.some(
        (topup) =>
          topup.userId === input.userId && topup.packageId === creditPackage.packageId && topup.status !== "rejected"
      );
      if (alreadyClaimed) {
        throw new UserAccountError("Gói dùng thử chỉ dùng được 1 lần mỗi tài khoản. Hãy chọn gói khác.", 409);
      }
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

  /**
   * A customer cancels their OWN still-pending top-up request (e.g. picked the wrong package). No
   * money has moved yet — a pending top-up is only a request — so this just removes the request. Scoped
   * to the owner and to pending state; an approved/rejected/other-user's top-up cannot be cancelled.
   */
  public cancelPendingTopup(input: { readonly userId: string; readonly topupId: string }): void {
    const index = this.state.topups.findIndex((topup) => topup.topupId === input.topupId);
    const existing = index >= 0 ? this.state.topups[index] : undefined;
    if (!existing || existing.userId !== input.userId) {
      throw new UserAccountError("Yêu cầu nạp không tồn tại.", 404);
    }
    if (existing.status !== "pending") {
      throw new UserAccountError("Chỉ hủy được yêu cầu nạp đang chờ duyệt.", 409);
    }
    this.state.topups.splice(index, 1);
    this.persist();
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
    // Never let a manual adjustment drive the balance below zero (a stuck-negative account would
    // silently swallow the customer's next top-up). Removing credits is capped at what they hold.
    if (adjustedCredits < 0) {
      const currentBalance = this.balanceOf(user.userId);
      if (currentBalance + adjustedCredits < 0) {
        throw new UserAccountError(
          `Không thể trừ ${Math.abs(adjustedCredits)} credits: khách chỉ còn ${currentBalance}. Nhập tối đa -${currentBalance}.`,
          400
        );
      }
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
    // Guard against charging twice for the SAME job while a prior charge is still OUTSTANDING
    // (not yet refunded) — a concurrent double-submit reuses that charge instead of paying again.
    // A charge that was already refunded (a failed render being retried) is NOT reused, so a
    // genuine retry after a refund charges correctly (stable series episode jobIds rely on this).
    const outstandingCharge = this.state.entries.find(
      (entry) => entry.userId === input.userId && entry.jobId === input.jobId && entry.type === "render_charge"
    );
    const chargeRefunded = outstandingCharge
      ? this.state.entries.some(
          (entry) => entry.userId === input.userId && entry.jobId === input.jobId && entry.type === "render_refund"
        )
      : false;
    if (outstandingCharge && !chargeRefunded) {
      return outstandingCharge;
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
    // Entry-only mutation: only the ledger grew, so append it without rewriting the mutable tables.
    this.appendLedger();
    return entry;
  }

  /**
   * Durable delivery marker (zero-credit ledger entry): recorded when a customer render is
   * confirmed SUCCEEDED, so boot-time reconciliation can distinguish "delivered but evicted from
   * the in-memory job history" from "crashed mid-render" and NEVER refund a video the customer
   * already received (finding F2). Idempotent per job. Does not change the balance.
   */
  public markRenderSettled(input: { readonly userId: string; readonly jobId: string }): void {
    if (!input.jobId) {
      return;
    }
    const alreadyMarked = this.state.entries.some(
      (entry) => entry.type === "render_settled" && entry.jobId === input.jobId && entry.userId === input.userId
    );
    if (alreadyMarked) {
      return;
    }
    this.appendEntry({
      userId: input.userId,
      type: "render_settled",
      credits: 0,
      note: `Đã giao video ${input.jobId}`,
      jobId: input.jobId
    });
    // Entry-only mutation: append the settlement marker without rewriting the mutable tables.
    this.appendLedger();
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
    // Bounded, linear reconcile (durability-audit F3): the old shape scanned ALL ledger entries
    // per charge (O(charges × entries) — quadratic boot slowdown as the ledger grows forever).
    // (1) Only entries from the last 7 days participate: an unknown-status charge older than 48h
    // is skipped by the guard below anyway, a known-status crash gap is caught by the FIRST boot
    // after the crash, and every refund/settle marker is written after its charge — so nothing
    // actionable lives outside the window. Unparseable timestamps stay in scope (fail-safe).
    // (2) Refund/settle markers become one-pass Sets, killing the inner scans entirely.
    // 30-day window (widened from 7 — adversarial-audit F6): a charge whose render FAILED but was
    // never refunded in real time (server down for the whole failure→refund gap) must still be
    // reconciled on the next boot; a week-long outage could otherwise age a real refund out of scope.
    // Still bounded so the scan stays linear; the settled/refunded marker Sets prevent double-refund.
    const RECONCILE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
    const reconcileCutoff = Date.now() - RECONCILE_WINDOW_MS;
    const recentEntries = this.state.entries.filter((entry) => {
      const at = Date.parse(entry.at);
      return !Number.isFinite(at) || at >= reconcileCutoff;
    });
    const refundedKeys = new Set<string>();
    const settledKeys = new Set<string>();
    for (const entry of recentEntries) {
      if (!entry.jobId) {
        continue;
      }
      if (entry.type === "render_refund") {
        refundedKeys.add(`${entry.userId}:${entry.jobId}`);
      } else if (entry.type === "render_settled") {
        settledKeys.add(`${entry.userId}:${entry.jobId}`);
      }
    }
    const charges = recentEntries.filter((entry) => entry.type === "render_charge" && entry.jobId);
    for (const charge of charges) {
      const jobId = charge.jobId as string;
      if (refundedKeys.has(`${charge.userId}:${jobId}`)) {
        continue;
      }
      if (settledKeys.has(`${charge.userId}:${jobId}`)) {
        // Durably-delivered video (marked on success): never refund, even after it aged out of the
        // in-memory job history and now reports an unknown status. This is the F2 fix — without it,
        // a delivered charge younger than 48h but evicted from the 100-entry history looked "crashed".
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
    // Entry-only mutation: append the refund without rewriting the mutable tables. When refundRender
    // is nested inside decideRefundRequest, that caller persists the refundRequest change separately.
    this.appendLedger();
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

  /**
   * Drop expired sessions, then cap how many an account may hold at once.
   *
   * Only expiry was pruned, and the TTL is thirty days, so a session row was appended on every login
   * and nothing removed it in between: an account logging in repeatedly grew the accounts file
   * without limit, and every session lookup scans that list. Nobody needs a hundred live sessions;
   * a person has a handful of devices. Keeping the newest and dropping the rest is also the
   * behaviour a customer expects from "sign out everywhere else".
   */
  private pruneSessions(now: number): void {
    for (let index = this.state.sessions.length - 1; index >= 0; index -= 1) {
      const session = this.state.sessions[index];
      if (session && Date.parse(session.expiresAt) <= now) {
        this.state.sessions.splice(index, 1);
      }
    }
    const countByUser = new Map<string, number>();
    for (let index = this.state.sessions.length - 1; index >= 0; index -= 1) {
      const session = this.state.sessions[index];
      if (!session) {
        continue;
      }
      // Walking backwards keeps the NEWEST sessions: issueSession appends, so later entries are more
      // recent. Per user, so one account's logins can never evict another's.
      const seen = (countByUser.get(session.userId) ?? 0) + 1;
      countByUser.set(session.userId, seen);
      if (seen > MAX_SESSIONS_PER_ACCOUNT) {
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
    // Opportunistically drop expired entries so a flood of distinct wrong emails can't grow
    // the map without bound (it is swept whenever any login fails, capped work per call).
    if (this.loginFailures.size > 1_000) {
      for (const [key, value] of this.loginFailures.entries()) {
        if (now - value.firstAt > LOGIN_FAILURE_WINDOW_MS) {
          this.loginFailures.delete(key);
        }
      }
    }
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

  /** True once durable state is loaded (always true for json/sqlite; after boot load for postgres). */
  public isHydrated(): boolean {
    return this.hydrated;
  }

  private assertHydrated(): void {
    if (this.hydrated) {
      return;
    }
    if (this.hydrationFailed) {
      // Hard outage: the boot load rejected, so this never recovers on its own — name the cause + fix.
      throw new UserAccountError(
        "Không kết nối được cơ sở dữ liệu tài khoản. Kiểm tra CINEJELLY_POSTGRES_URL / Neon (có thể đang ngủ hoặc sai chuỗi kết nối), rồi khởi động lại máy chủ.",
        503
      );
    }
    // Still loading (transient): the async boot load will finish shortly and unblock writes.
    throw new UserAccountError(
      "Hệ thống tài khoản đang tải dữ liệu từ cơ sở dữ liệu, vui lòng thử lại sau vài giây.",
      503
    );
  }

  /** Diagnosis surface: has the boot load hard-failed (DB unreachable)? Distinct from still-loading. */
  public hasHydrationFailed(): boolean {
    return this.hydrationFailed;
  }

  private persist(): void {
    // Block until the async boot load has hydrated real state — persisting the empty boot snapshot
    // would DELETE-and-replace the mutable tables and wipe every existing account.
    this.assertHydrated();
    this.driver.persist(this.state);
  }

  /**
   * Durably persist ONLY newly-appended credit entries, for a mutation that changed nothing but the
   * append-only ledger (chargeRender / markRenderSettled / refundRender). Row-backed drivers insert
   * just the new rows and skip rewriting the bounded mutable tables — turning a charge from an O(all)
   * table rewrite (catastrophic over a network DB) into a single INSERT. Must be called ONLY when no
   * mutable collection changed; every other mutation uses persist().
   */
  private appendLedger(): void {
    this.assertHydrated();
    this.driver.appendCreditEntries(this.state);
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

function readNonNegativeNumber(value: string | undefined, fallback: number): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Pipeline cost value must be a non-negative number.");
  }
  return parsed;
}
