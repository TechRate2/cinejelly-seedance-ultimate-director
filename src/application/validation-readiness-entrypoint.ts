/**
 * Production CLI entrypoint for Phase 6 validation readiness reporting.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { redactApiLocalPaths } from "../api/api-response-redaction.js";
import { RuntimePreflight } from "./runtime-preflight.js";
import { Phase6ValidationReadinessReporter } from "./validation-readiness-report.js";
import { writeFileEnsuringDirectory } from "../utils/files.js";
import { redactUnknown } from "../utils/redaction.js";

interface ValidationReadinessCliOptions {
  readonly outputPath?: string;
}

export async function runValidationReadinessCli(
  args: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const options = parseOptions(args);
  const preflight = await new RuntimePreflight(env).run();
  const report = new Phase6ValidationReadinessReporter().build(preflight);
  const safeReport = redactApiLocalPaths(redactUnknown(report));
  const serialized = `${JSON.stringify(safeReport, null, 2)}\n`;

  if (options.outputPath) {
    await writeFileEnsuringDirectory(options.outputPath, serialized);
  }
  process.stdout.write(serialized);
  return report.decision === "blocked" ? 1 : 0;
}

function parseOptions(args: readonly string[]): ValidationReadinessCliOptions {
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--output") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Usage: npm.cmd run validation:readiness -- --output <report-path>");
      }
      outputPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      const value = arg.slice("--output=".length);
      if (!value) {
        throw new Error("Usage: npm.cmd run validation:readiness -- --output <report-path>");
      }
      outputPath = value;
      continue;
    }
    throw new Error(`Unknown validation readiness option: ${arg}`);
  }
  return outputPath ? { outputPath } : {};
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  runValidationReadinessCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify(
          {
            status: "fail",
            error: redactApiLocalPaths(redactUnknown(error instanceof Error ? error.message : String(error)))
          },
          null,
          2
        )}\n`
      );
      process.exitCode = 1;
    });
}
