/**
 * Durability drivers for the customer account store.
 *
 * The account store keeps its working state in memory and WRITES THROUGH every mutation to
 * a durability driver chosen by CINEJELLY_DATABASE_KIND:
 *   - "json"     (default) one JSON file with atomic tmp+rename writes — zero setup.
 *   - "sqlite"   real SQL tables via the Node built-in node:sqlite (Node >= 22.5, which the
 *                production Docker image already uses) — durable, WAL, single-node scale.
 *   - "postgres" real SQL via the operator-installed `pg` package (npm install pg) — for
 *                managed/cloud databases and long-term scale; writes are serialized through
 *                an internal queue.
 * All drivers load the full state on boot, so reads stay in-memory and synchronous (the
 * auth guard resolves sessions synchronously on every request).
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const requireModule = createRequire(import.meta.url);

export interface PersistedAccountState {
  schemaVersion: string;
  users: unknown[];
  sessions: unknown[];
  entries: unknown[];
  topups: unknown[];
  refundRequests?: unknown[];
}

export interface AccountPersistenceDriver {
  readonly kind: "json" | "sqlite" | "postgres";
  /** Load the full state once at boot. Resolves to undefined when no data exists yet. */
  load(): PersistedAccountState | undefined;
  /** Persist the full current state after a mutation. Must never throw into the caller. */
  persist(state: PersistedAccountState): void;
  /**
   * Fast path for an APPEND-ONLY ledger mutation (a charge/settle/refund that only appended credit
   * entries and touched no other collection). Row-backed drivers (sqlite/postgres) INSERT just the
   * new entries and SKIP rewriting the bounded mutable tables entirely — so a charge costs one INSERT,
   * not a full rewrite of users+sessions+topups+refunds (which, on a remote DB like Neon, was O(all)
   * sequential network round-trips per charge). The single-file JSON driver has no cheaper option than
   * a whole-file write, so it falls back to persist(). Callers MUST only use this when no mutable
   * collection changed. Must never throw into the caller.
   */
  appendCreditEntries(state: PersistedAccountState): void;
  /** Resolves when the driver is fully ready (postgres finishes its async boot load). */
  ready(): Promise<void>;
  /**
   * Resolves once all queued writes have been flushed durably. Synchronous drivers (json/sqlite) write
   * inline so this resolves immediately; the async postgres driver awaits its serialized write chain.
   * Used by the migration tool to guarantee data is committed before the process exits.
   */
  flush(): Promise<void>;
}

export type DatabaseKind = "json" | "sqlite" | "postgres";

export function readDatabaseKind(env: NodeJS.ProcessEnv = process.env): DatabaseKind {
  const raw = env.CINEJELLY_DATABASE_KIND?.trim().toLowerCase() || "json";
  if (raw === "json" || raw === "sqlite" || raw === "postgres") {
    return raw;
  }
  throw new Error('CINEJELLY_DATABASE_KIND must be one of "json", "sqlite", "postgres".');
}

/** JSON-file driver: the zero-setup default, atomic tmp+rename like the other API stores. */
export class JsonFileAccountDriver implements AccountPersistenceDriver {
  public readonly kind = "json" as const;
  private readonly storePath: string;

  public constructor(storePath: string) {
    this.storePath = storePath;
  }

  public load(): PersistedAccountState | undefined {
    try {
      return JSON.parse(readFileSync(this.storePath, "utf8")) as PersistedAccountState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  public persist(state: PersistedAccountState): void {
    mkdirSync(dirname(this.storePath), { recursive: true });
    const tempPath = `${this.storePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf8");
    renameSync(tempPath, this.storePath);
  }

  public appendCreditEntries(state: PersistedAccountState): void {
    // Single-file model: entries live in the same file as everything else, so there is no cheaper
    // option than the normal whole-file write. This is the dev/default backend at dev-scale data,
    // so the O(all) write is a non-issue; the fast path matters for the row-backed SQL drivers.
    this.persist(state);
  }

  public ready(): Promise<void> {
    return Promise.resolve();
  }

  public flush(): Promise<void> {
    return Promise.resolve();
  }
}

interface SqliteDatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...values: unknown[]): unknown;
    get(...values: unknown[]): unknown;
    all(...values: unknown[]): unknown[];
  };
}

/**
 * SQLite driver on the Node built-in node:sqlite (no npm dependency). State is stored as
 * four real tables so operators can inspect/backup with any SQLite tool; write-through
 * replaces rows inside one transaction per mutation.
 */
export class SqliteAccountDriver implements AccountPersistenceDriver {
  public readonly kind = "sqlite" as const;
  private readonly database: SqliteDatabaseLike;
  private readonly schemaVersion: string;
  // The credit ledger (account_credit_entries) is APPEND-ONLY — entries are never modified or
  // removed. So persist() inserts only the rows appended since the last write instead of rewriting
  // every row (the old DELETE-all + INSERT-all was O(all) per charge). This tracks how many entries
  // are already durable; it is set from the loaded count on boot and advanced after each commit.
  private persistedEntryCount = 0;

  public constructor(input: { readonly databasePath: string; readonly schemaVersion: string }) {
    this.schemaVersion = input.schemaVersion;
    let DatabaseSync: new (path: string) => SqliteDatabaseLike;
    try {
      // Feature-detected: available on Node >= 22.5 (the production image runs Node 22).
      DatabaseSync = (requireModule("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDatabaseLike })
        .DatabaseSync;
    } catch {
      throw new Error(
        'CINEJELLY_DATABASE_KIND="sqlite" needs Node.js >= 22.5 (node:sqlite). The production Docker image already runs Node 22; for local runs use Node 22 or CINEJELLY_DATABASE_KIND="json".'
      );
    }
    mkdirSync(dirname(input.databasePath), { recursive: true });
    this.database = new DatabaseSync(input.databasePath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec(
      "CREATE TABLE IF NOT EXISTS account_users (user_id TEXT PRIMARY KEY, record TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS account_sessions (token_sha256 TEXT PRIMARY KEY, record TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS account_credit_entries (entry_id TEXT PRIMARY KEY, record TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS account_topups (topup_id TEXT PRIMARY KEY, record TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS account_refund_requests (refund_request_id TEXT PRIMARY KEY, record TEXT NOT NULL);"
    );
  }

  public load(): PersistedAccountState | undefined {
    const users = this.database.prepare("SELECT record FROM account_users").all() as { record: string }[];
    const sessions = this.database.prepare("SELECT record FROM account_sessions").all() as { record: string }[];
    const entries = this.database.prepare("SELECT record FROM account_credit_entries").all() as { record: string }[];
    const topups = this.database.prepare("SELECT record FROM account_topups").all() as { record: string }[];
    const refundRequests = this.database.prepare("SELECT record FROM account_refund_requests").all() as { record: string }[];
    if (users.length === 0 && sessions.length === 0 && entries.length === 0 && topups.length === 0 && refundRequests.length === 0) {
      return undefined;
    }
    const parse = (rows: { record: string }[]): unknown[] => rows.map((row) => JSON.parse(row.record) as unknown);
    const parsedEntries = parse(entries);
    this.persistedEntryCount = parsedEntries.length;
    return {
      schemaVersion: this.schemaVersion,
      users: parse(users),
      sessions: parse(sessions),
      entries: parsedEntries,
      topups: parse(topups),
      refundRequests: parse(refundRequests)
    };
  }

  public persist(state: PersistedAccountState): void {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.replaceAll("account_users", "user_id", state.users, (record) => (record as { userId: string }).userId);
      this.replaceAll(
        "account_sessions",
        "token_sha256",
        state.sessions,
        (record) => (record as { tokenSha256: string }).tokenSha256
      );
      // Append-only ledger: insert only the new tail (entries are never modified/removed), so a
      // charge costs one INSERT, not a full-table rewrite. INSERT OR IGNORE keeps it idempotent if a
      // prior attempt advanced no further than a rolled-back commit.
      this.appendNewEntries(state.entries);
      this.replaceAll("account_topups", "topup_id", state.topups, (record) => (record as { topupId: string }).topupId);
      this.replaceAll(
        "account_refund_requests",
        "refund_request_id",
        state.refundRequests ?? [],
        (record) => (record as { refundRequestId: string }).refundRequestId
      );
      this.database.exec("COMMIT;");
      this.persistedEntryCount = state.entries.length;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  public appendCreditEntries(state: PersistedAccountState): void {
    // Ledger-only fast path: append the new entries and DO NOT touch the mutable tables — the caller
    // guarantees a charge/settle/refund changed nothing else. One INSERT per new entry, no full-table
    // rewrites.
    if (state.entries.length <= this.persistedEntryCount) {
      return;
    }
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.appendNewEntries(state.entries);
      this.database.exec("COMMIT;");
      this.persistedEntryCount = state.entries.length;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  private appendNewEntries(entries: readonly unknown[]): void {
    if (entries.length <= this.persistedEntryCount) {
      return;
    }
    const insert = this.database.prepare(
      "INSERT OR IGNORE INTO account_credit_entries (entry_id, record) VALUES (?, ?)"
    );
    for (let index = this.persistedEntryCount; index < entries.length; index += 1) {
      const record = entries[index];
      insert.run((record as { entryId: string }).entryId, JSON.stringify(record));
    }
  }

  public ready(): Promise<void> {
    return Promise.resolve();
  }

  public flush(): Promise<void> {
    return Promise.resolve();
  }

  private replaceAll(table: string, keyColumn: string, records: unknown[], keyOf: (record: unknown) => string): void {
    this.database.exec(`DELETE FROM ${table};`);
    const insert = this.database.prepare(`INSERT INTO ${table} (${keyColumn}, record) VALUES (?, ?)`);
    for (const record of records) {
      insert.run(keyOf(record), JSON.stringify(record));
    }
  }
}

interface PgPoolLike {
  query(sql: string, values?: unknown[]): Promise<{ rows: { record: string }[] }>;
}

/**
 * PostgreSQL driver via the operator-installed `pg` package (npm install pg). The store
 * stays synchronous: writes are enqueued and applied in order; the boot load is awaited
 * through ready() before account routes serve traffic.
 */
export class PostgresAccountDriver implements AccountPersistenceDriver {
  public readonly kind = "postgres" as const;
  private readonly schemaVersion: string;
  private pool: PgPoolLike | undefined;
  private readonly bootReady: Promise<void>;
  private loaded: PersistedAccountState | undefined;
  private writeChain: Promise<void> = Promise.resolve();
  // Append-only ledger cursor (see SqliteAccountDriver): how many credit entries are already durable,
  // so each write INSERTs only the new tail instead of a full DELETE-all + re-INSERT — the latter was
  // O(all) SEQUENTIAL network round-trips per charge, catastrophic on a managed/remote DB (e.g. Neon).
  private persistedEntryCount = 0;

  public constructor(input: { readonly connectionString: string; readonly schemaVersion: string }) {
    this.schemaVersion = input.schemaVersion;
    this.bootReady = this.boot(input.connectionString);
  }

  private async boot(connectionString: string): Promise<void> {
    let PoolConstructor: new (config: { connectionString: string }) => PgPoolLike;
    try {
      // Optional operator-installed dependency; the specifier is computed so the compiler
      // does not require pg types when the operator has not chosen postgres.
      const pgModuleName = "pg";
      const pg = (await import(pgModuleName)) as unknown as {
        Pool: new (config: { connectionString: string }) => PgPoolLike;
      };
      PoolConstructor = pg.Pool;
    } catch {
      throw new Error(
        'CINEJELLY_DATABASE_KIND="postgres" needs the pg package: run `npm install pg` on the server, or switch to "sqlite"/"json".'
      );
    }
    this.pool = new PoolConstructor({ connectionString });
    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS account_users (user_id TEXT PRIMARY KEY, record TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS account_sessions (token_sha256 TEXT PRIMARY KEY, record TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS account_credit_entries (entry_id TEXT PRIMARY KEY, record TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS account_topups (topup_id TEXT PRIMARY KEY, record TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS account_refund_requests (refund_request_id TEXT PRIMARY KEY, record TEXT NOT NULL);"
    );
    const [users, sessions, entries, topups, refundRequests] = await Promise.all([
      this.pool.query("SELECT record FROM account_users"),
      this.pool.query("SELECT record FROM account_sessions"),
      this.pool.query("SELECT record FROM account_credit_entries"),
      this.pool.query("SELECT record FROM account_topups"),
      this.pool.query("SELECT record FROM account_refund_requests")
    ]);
    const parse = (rows: { record: string }[]): unknown[] => rows.map((row) => JSON.parse(row.record) as unknown);
    if (users.rows.length || sessions.rows.length || entries.rows.length || topups.rows.length || refundRequests.rows.length) {
      const parsedEntries = parse(entries.rows);
      this.persistedEntryCount = parsedEntries.length;
      this.loaded = {
        schemaVersion: this.schemaVersion,
        users: parse(users.rows),
        sessions: parse(sessions.rows),
        entries: parsedEntries,
        topups: parse(topups.rows),
        refundRequests: parse(refundRequests.rows)
      };
    }
  }

  public load(): PersistedAccountState | undefined {
    // Boot load is awaited via ready(); by the time routes serve traffic this is populated.
    return this.loaded;
  }

  public persist(state: PersistedAccountState): void {
    // Deep-copy so later in-memory mutations cannot corrupt the queued snapshot.
    const snapshot = JSON.parse(JSON.stringify(state)) as PersistedAccountState;
    this.writeChain = this.writeChain
      .then(() => this.writeSnapshot(snapshot))
      .catch((error: unknown) => {
        // Durability failures must not take down the API; they surface in server logs.
        console.error("[account-persistence] postgres write failed:", error instanceof Error ? error.message : error);
      });
  }

  public appendCreditEntries(state: PersistedAccountState): void {
    // Ledger-only fast path: queue an INSERT of just the new entries, skipping the mutable-table
    // rewrites. Deep-copied like persist() so a later in-memory mutation cannot corrupt the snapshot.
    const snapshot = JSON.parse(JSON.stringify(state)) as PersistedAccountState;
    this.writeChain = this.writeChain
      .then(() => this.appendEntriesOnly(snapshot))
      .catch((error: unknown) => {
        console.error("[account-persistence] postgres ledger append failed:", error instanceof Error ? error.message : error);
      });
  }

  public ready(): Promise<void> {
    return this.bootReady;
  }

  public flush(): Promise<void> {
    // Await the serialized write chain so every queued snapshot/append has committed.
    return this.writeChain.then(() => undefined);
  }

  private async appendEntriesOnly(state: PersistedAccountState): Promise<void> {
    if (!this.pool || state.entries.length <= this.persistedEntryCount) {
      return;
    }
    await this.pool.query("BEGIN");
    try {
      await this.insertNewEntries(state);
      await this.pool.query("COMMIT");
      this.persistedEntryCount = state.entries.length;
    } catch (error) {
      await this.pool.query("ROLLBACK");
      throw error;
    }
  }

  private async insertNewEntries(state: PersistedAccountState): Promise<void> {
    // Append-only ledger: INSERT only the tail beyond persistedEntryCount. ON CONFLICT DO NOTHING is
    // idempotent if a prior attempt committed some rows before failing. writeChain serialises writes
    // and each snapshot's entries is a superset of the last, so slicing from the cursor is correct.
    for (let index = this.persistedEntryCount; index < state.entries.length; index += 1) {
      const record = state.entries[index];
      await this.pool?.query(
        "INSERT INTO account_credit_entries VALUES ($1, $2) ON CONFLICT (entry_id) DO NOTHING",
        [(record as { entryId: string }).entryId, JSON.stringify(record)]
      );
    }
  }

  private async writeSnapshot(state: PersistedAccountState): Promise<void> {
    if (!this.pool) {
      throw new Error("Postgres pool is not ready.");
    }
    const writeTable = async (table: string, records: unknown[], keyOf: (record: unknown) => string): Promise<void> => {
      await this.pool?.query(`DELETE FROM ${table}`);
      for (const record of records) {
        await this.pool?.query(`INSERT INTO ${table} VALUES ($1, $2)`, [keyOf(record), JSON.stringify(record)]);
      }
    };
    await this.pool.query("BEGIN");
    try {
      await writeTable("account_users", state.users, (record) => (record as { userId: string }).userId);
      await writeTable("account_sessions", state.sessions, (record) => (record as { tokenSha256: string }).tokenSha256);
      // Append-only ledger: INSERT only the new tail instead of deleting and re-inserting every row.
      await this.insertNewEntries(state);
      await writeTable("account_topups", state.topups, (record) => (record as { topupId: string }).topupId);
      await writeTable(
        "account_refund_requests",
        state.refundRequests ?? [],
        (record) => (record as { refundRequestId: string }).refundRequestId
      );
      await this.pool.query("COMMIT");
      this.persistedEntryCount = state.entries.length;
    } catch (error) {
      await this.pool.query("ROLLBACK");
      throw error;
    }
  }
}

export function createAccountPersistenceDriver(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly jsonStorePath: string;
  readonly schemaVersion: string;
}): AccountPersistenceDriver {
  const kind = readDatabaseKind(input.env);
  if (kind === "sqlite") {
    const databasePath = input.env.CINEJELLY_SQLITE_PATH?.trim() || input.jsonStorePath.replace(/\.json$/u, ".sqlite");
    return new SqliteAccountDriver({ databasePath, schemaVersion: input.schemaVersion });
  }
  if (kind === "postgres") {
    const connectionString = input.env.CINEJELLY_POSTGRES_URL?.trim();
    if (!connectionString) {
      throw new Error('CINEJELLY_DATABASE_KIND="postgres" needs CINEJELLY_POSTGRES_URL (postgres://user:pass@host:5432/db).');
    }
    return new PostgresAccountDriver({ connectionString, schemaVersion: input.schemaVersion });
  }
  return new JsonFileAccountDriver(input.jsonStorePath);
}
