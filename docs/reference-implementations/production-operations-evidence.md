# Reference Implementation: Production Operations Evidence

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js evidence script, JSON schema, package command, business-readiness input, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Dry-run and operator report discipline before release. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Operational status and task-progress awareness for video jobs. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | MIT | Evidence-first delivery checks and review records. |

## Behavior To Preserve

1. The evidence capture must be no-spend and must never call render endpoints, Atlas, or inspect customer media.
2. Local preflight is not enough for commercial production operations evidence.
3. Passing evidence requires a real HTTPS deployment endpoint capture and a non-secret operator attestation.
4. The attestation must cover durable storage, retention, backups, restore testing, monitoring, alerting, on-call/support, incident handling, rollback, post-incident review, log redaction, secret rotation, and customer artifact deletion.
5. Reports must redact token-like values and must not include provider secrets, local private paths, raw logs, or customer media.
6. Missing evidence fails closed with concrete next actions.

## Attestation Contract

The operator-owned attestation file is non-secret JSON. It records the production operations controls that live around the CineJelly render engine.

```json
{
  "schemaVersion": "cinejelly.production-operations-attestation.v1",
  "approvedAt": "2026-06-16T00:00:00.000Z",
  "approvedBy": "Operations owner name or team",
  "operationsOwner": "Production owner/team",
  "supportContact": "support@example.com",
  "securityContact": "security@example.com",
  "incidentEscalationContact": "on-call escalation path",
  "storage": {
    "provider": "s3",
    "durableStorage": true,
    "artifactRetentionDays": 30,
    "backupEnabled": true,
    "backupCadence": "daily",
    "restoreTestedAt": "2026-06-16T00:00:00.000Z",
    "restoreRunbookUrl": "https://example.com/runbooks/restore"
  },
  "observability": {
    "provider": "observability provider",
    "dashboardUrl": "https://example.com/dashboards/cinejelly",
    "alertingEnabled": true,
    "onCallSchedule": "primary and backup rotation",
    "requestIdSearchProcedure": "how support finds X-CineJelly-Request-Id traces"
  },
  "incidentResponse": {
    "runbookUrl": "https://example.com/runbooks/incidents",
    "severityPolicy": "severity definitions",
    "rollbackProcedure": "how to roll back or disable traffic",
    "postIncidentReviewProcedure": "how incident reviews are recorded"
  },
  "supportWorkflow": {
    "supportRunbookUrl": "https://example.com/runbooks/support",
    "responseSlo": "initial response target",
    "customerEscalationProcedure": "how customer-impacting issues escalate"
  },
  "dataProtection": {
    "logRedactionReviewPassed": true,
    "secretRotationProcedure": "how keys and tokens are rotated",
    "customerArtifactDeletionProcedure": "how deletion requests are fulfilled",
    "dataRetentionPolicyUrl": "https://example.com/data-retention"
  }
}
```

## Reference Implementation

```ts
interface ProductionOperationsReport {
  schemaVersion: "cinejelly.production-operations.v1";
  generatedAt: string;
  status: "pass" | "warn" | "fail";
  environmentKind: "deployment" | "local";
  checks: Array<{
    name: string;
    status: "pass" | "warn" | "fail";
    message: string;
  }>;
  attestation: {
    configured: boolean;
    storageProvider?: string;
    observabilityProvider?: string;
  };
  endpointCapture: {
    captured: boolean;
    baseUrl?: string;
    requiredPreflightChecks?: Record<string, string>;
  };
  releaseGateSummary: {
    canUseAsBusinessReadinessOperationsEvidence: boolean;
    canOpenPaidCustomerTraffic: false;
    releaseBlocker: string;
  };
  nextActions: string[];
}
```

## CineJelly Translation Plan

- Done: add `scripts/capture-production-operations.mjs`.
- Done: add `npm.cmd run validation:production-ops`.
- Done: add `schemas/production-operations-report.schema.json`.
- Done: add `schemas/production-operations-attestation.schema.json`, `schemas/operator-attestation-promotion-report.schema.json`, no-spend `npm.cmd run validation:ops-config` pre-capture validation/draft tooling, and `npm.cmd run ops:promote-attestations` so completed non-secret drafts can be validated before they become ignored `ops/*.json` inputs. With `--write-drafts`, the ops-config tooling also writes a Markdown fill-out packet that lists the production operations fields, validation loop, and deployment-capture commands without claiming release evidence.
- Done: add report-contract coverage for the ignored raw `ops/production-operations-attestation.json` packet when it exists, including clean runbook/dashboard URLs, non-placeholder operations procedure text, durable storage, at least 30 days retention, backups, alerting, log-redaction review, and secret/signed-URL rejection.
- Done: make `validation:business-readiness` evaluate the versioned production operations report explicitly.
- Done: require production-operations endpoint capture to include passing `atlascloud_docs_conformance` alongside output directory, API auth, FFmpeg, and FFprobe checks.
- Done: document the non-secret attestation contract.

## Validation Checklist

- Missing deployment base URL fails.
- Localhost deployment capture fails for commercial readiness.
- Missing or failing `atlascloud_docs_conformance` fails production-operations evidence before customer traffic.
- Missing attestation fails.
- `validation:report-contracts` validates the raw ignored attestation when present before later production-operations evidence can trust it.
- Missing durable storage/backup/restore/monitoring/incident/support/log-redaction controls fail.
- `/health`, `/v1/preflight`, `/v1/validation-readiness`, and `/v1/render-settings` must pass from the real deployment host.
- Required deployment preflight checks for `CINEJELLY_OUTPUT_DIR`, `CINEJELLY_API_AUTH_TOKEN`, `ffmpeg`, and `ffprobe` must pass.
