/**
 * In-process cost and latency ledger for provider calls.
 * It records production telemetry without owning billing math or provider-specific pricing.
 */

import type { CostLedgerEntry } from "../types/provider.js";

export interface CostLedger {
  record(entry: CostLedgerEntry): void;
  list(): readonly CostLedgerEntry[];
  clear(): void;
}

export class ProviderCostLedger implements CostLedger {
  private readonly entries: CostLedgerEntry[] = [];

  public record(entry: CostLedgerEntry): void {
    this.entries.push(entry);
  }

  public list(): readonly CostLedgerEntry[] {
    return [...this.entries];
  }

  public clear(): void {
    this.entries.length = 0;
  }
}
