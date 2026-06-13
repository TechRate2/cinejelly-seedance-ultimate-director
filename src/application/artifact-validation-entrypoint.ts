/**
 * Production CLI entrypoint for validating durable run artifacts after provider validation.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectArtifactValidator } from "../core/project-artifact-validator.js";
import { redactUnknown } from "../utils/redaction.js";

export async function runArtifactValidationCli(args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const artifactDirectory = args[0];
  if (!artifactDirectory) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "fail",
          checkedAt: new Date(),
          checks: [
            {
              name: "artifact_directory_argument",
              status: "fail",
              message: "Usage: npm.cmd run validate:artifacts -- <artifact-directory-or-project-artifact-directory>"
            }
          ]
        },
        null,
        2
      )}\n`
    );
    return 1;
  }

  const report = await new ProjectArtifactValidator().validate(artifactDirectory);
  process.stdout.write(`${JSON.stringify(redactUnknown(report), null, 2)}\n`);
  return report.status === "fail" ? 1 : 0;
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  runArtifactValidationCli()
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
