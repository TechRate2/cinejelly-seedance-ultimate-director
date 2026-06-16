# Reference Implementation: Deployment Readiness Capture

Implementation status as of 2026-06-16: implemented as a CineJelly-owned no-spend Node.js capture script, JSON schema, package command, business-readiness input, and operator documentation. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Operator-facing readiness reports and preflight discipline. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Practical production deployment checks before real traffic. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | MIT | Archivable evidence discipline for video pipeline handoff. |

## Behavior To Preserve

1. The capture must be no-spend and must never call render endpoints.
2. The capture must use the real API surface that operators and future UI clients use.
3. The report must redact secrets, never print bearer tokens, and never require raw keys in CLI arguments.
4. Localhost captures are valid smoke evidence but cannot satisfy the business-readiness deployment gate.
5. Real deployment evidence must come from an HTTPS non-localhost host.
6. `/health`, `/v1/preflight`, `/v1/validation-readiness`, and `/v1/render-settings` must all be captured.
7. Real deployment evidence must include the current `atlascloud_docs_conformance` preflight check and it must pass before the deployment gate can count for business readiness.
8. Warnings are preserved as warnings and require explicit operator acceptance.

## Reference Implementation

```ts
type DeploymentReadinessStatus = "pass" | "warn" | "fail";
type DeploymentEnvironmentKind = "deployment" | "local";

interface DeploymentReadinessEndpoint {
  name: "health" | "preflight" | "validation_readiness" | "render_settings";
  method: "GET";
  path: string;
  httpStatus?: number;
  ok: boolean;
  durationMs: number;
  payload?: unknown;
  error?: string;
  status: DeploymentReadinessStatus;
  message: string;
}

interface DeploymentReadinessCaptureReport {
  schemaVersion: "cinejelly.deployment-readiness-capture.v1";
  generatedAt: string;
  status: DeploymentReadinessStatus;
  environmentKind: DeploymentEnvironmentKind;
  baseUrl: string;
  auth: {
    mode: "bearer" | "none";
    tokenEnvName: string;
    tokenProvided: boolean;
    sentAuthorizationToV1Endpoints: boolean;
  };
  endpoints: DeploymentReadinessEndpoint[];
  releaseGateSummary: {
    canUseAsBusinessReadinessDeploymentEvidence: boolean;
    canRunPaidValidationFromHost: boolean;
    canReleaseToCustomerTraffic: false;
    releaseBlocker: string;
  };
  summary: {
    atlasCloudDocsConformanceStatus: "pass" | "warn" | "fail" | "missing";
  };
  nextActions: string[];
}
```

## CineJelly Translation Plan

- Done: add `scripts/capture-deployment-readiness.mjs`.
- Done: add `npm.cmd run validation:deployment-readiness`.
- Done: add `schemas/deployment-readiness-capture-report.schema.json`.
- Done: make `validation:business-readiness` accept only real deployment captures for the deployment gate.
- Done: require deployed preflight evidence to include passing `atlascloud_docs_conformance` before business-readiness can count deployment evidence.
- Done: document local smoke versus deployment evidence.

## Validation Checklist

- Localhost capture can pass as local smoke but fails the business deployment evidence gate.
- HTTPS deployment capture can pass the business deployment evidence gate only when every endpoint passes.
- The script rejects base URLs with credentials, query strings, or fragments.
- Plain HTTP is accepted only for localhost.
- The script sends bearer auth to `/v1/*` endpoints only when an env token is present.
- The script does not call `/v1/render`, `/v1/render-jobs`, Atlas, or any provider path.
- Reports from older deployments that lack `atlascloud_docs_conformance` are rejected as business-readiness deployment evidence until the current build is deployed and recaptured.
