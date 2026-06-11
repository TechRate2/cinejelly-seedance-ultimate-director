/**
 * Production CLI entrypoint for deployment readiness checks.
 * It emits a redacted preflight report and exits non-zero only when a hard deployment gate fails.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimePreflight } from "./runtime-preflight.js";
import { redactUnknown } from "../utils/redaction.js";

export async function runPreflightCli(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const report = await new RuntimePreflight(env).run();
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return report.status === "fail" ? 1 : 0;
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  runPreflightCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify(
          {
            status: "fail",
            error: redactUnknown(error instanceof Error ? error.message : String(error))
          },
          null,
          2
        )}\n`
      );
      process.exitCode = 1;
    });
}
