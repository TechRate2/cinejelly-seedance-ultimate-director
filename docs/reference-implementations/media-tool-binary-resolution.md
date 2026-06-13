# Reference Implementation: Media Tool Binary Resolution

Implementation status as of 2026-06-14: implemented as CineJelly-owned TypeScript in media-tool command resolution, runtime preflight, FFmpeg/FFprobe-backed engines, deployment docs, and source lineage records. This Reference Implementation is documentation-only and must not import or execute upstream snapshot code.

## Upstream Sources

| Source | Snapshot path | License | Behavior used |
| --- | --- | --- | --- |
| `vericontext/vibeframe` | `external/upstream/vibeframe` | MIT | Deterministic preflight/report discipline and deployment-ready build checks. |
| `harry0703/MoneyPrinterTurbo` | `external/upstream/moneyprinterturbo` | MIT | Operator-friendly video pipeline deployment where media tooling availability must be visible before long-running work. |
| `calesthio/OpenMontage` | `external/upstream/openmontage` | AGPL-3.0 | ffprobe/frame/audio/subtitle self-review concepts, used only as AGPL-aware behavior notes. |

## Behavior To Preserve

1. Media tool availability must be checked before paid render or long-form assembly work.
2. Operators should be able to use portable FFmpeg/FFprobe binaries without modifying global `PATH`.
3. Preflight and runtime media engines must resolve the same command source.
4. Preflight output must not expose server-local filesystem paths when a configured binary fails.
5. Runtime execution must continue to use argument arrays through the shared process runner, never shell-built command strings.

## Edge Cases

- No env override and command is missing on `PATH`: keep the existing `ffmpeg` or `ffprobe` hard blocker.
- Env override is configured and executable: pass the corresponding env check without echoing the absolute path.
- Env override is configured but cannot execute: fail the corresponding env check without echoing the configured value.
- Env override contains control characters: fail immediately before spawning.
- A path contains spaces: pass it as the spawn command string, not through a shell.

## Reference Implementation

```ts
type MediaToolName = "ffmpeg" | "ffprobe";

function mediaToolEnvName(tool: MediaToolName): string {
  return tool === "ffmpeg" ? "CINEJELLY_FFMPEG_PATH" : "CINEJELLY_FFPROBE_PATH";
}

function readMediaToolCommand(tool: MediaToolName, env: NodeJS.ProcessEnv): string {
  const configured = normalizeCommand(env[mediaToolEnvName(tool)]);
  return configured || tool;
}

async function preflightMediaTool(tool: MediaToolName): Promise<PreflightCheck> {
  const envName = mediaToolEnvName(tool);
  const configured = normalizeCommand(process.env[envName]);
  if (configured && hasControlCharacters(configured)) {
    return fail(envName, `${envName} must not contain control characters.`);
  }

  try {
    await runProcess(readMediaToolCommand(tool, process.env), ["-version"]);
    return pass(configured ? envName : tool, configured ? `${envName} is configured and executable.` : `${tool} is available on PATH.`);
  } catch {
    return fail(configured ? envName : tool, configured ? `${envName} is configured but cannot be executed.` : `${tool} is missing from PATH.`);
  }
}
```

## CineJelly Translation Plan

- Add a shared media-tool command resolver under `src/utils`.
- Update runtime preflight to honor `CINEJELLY_FFMPEG_PATH` and `CINEJELLY_FFPROBE_PATH`.
- Update every FFmpeg/FFprobe-backed engine to use the resolver instead of hardcoded command names.
- Update README, operator runbook, project context, roadmap, and source snapshot inventory.
- Record source lineage in `src/core/source-logic-translation-records.ts`.

## Validation Checklist

- `npm.cmd run typecheck` passes.
- `npm.cmd run build` passes.
- Preflight still reports missing default `ffmpeg`/`ffprobe` when no override is configured and tools are not on `PATH`.
- A configured invalid binary path fails under `CINEJELLY_FFMPEG_PATH` or `CINEJELLY_FFPROBE_PATH` without printing the configured value.
- A configured executable command passes the corresponding media-tool check.
- Runtime media engines import no code from `external/upstream/`.
- `git diff --check`, import-boundary check, and redacted secret audit pass.
