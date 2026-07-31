/**
 * An error whose message is plain-customer guidance (Vietnamese-first) for a problem ONLY the
 * customer can fix — a mis-slotted upload, an unusable input — as opposed to internal/config
 * failures the customer must never see. The API's customer job summary strips every raw error
 * EXCEPT this type: it copies the message into `customerGuidance` so the create page can tell the
 * customer exactly what to change before retrying (otherwise they see a generic "failed, try
 * again" and hit the identical failure forever).
 *
 * Detection is BY NAME, not instanceof: the job store serializes errors to {name, message}
 * (render-job-manager errorPayload), so the name string is the contract. Never rename.
 */
export class CustomerActionableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CustomerActionableError";
  }
}
