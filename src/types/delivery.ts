/**
 * Delivery gate contracts for final commercial output validation.
 * The gate is deterministic and provider-neutral; semantic checks stay in Guardian/visual inspection.
 */

export type DeliveryGateStatus = "pass" | "warn" | "block";

export interface DeliveryGateFinding {
  readonly status: DeliveryGateStatus;
  readonly checkpoint: string;
  readonly evidence: string;
  readonly repair: string;
}

export interface DeliveryGateReport {
  readonly status: DeliveryGateStatus;
  readonly findings: readonly DeliveryGateFinding[];
}
