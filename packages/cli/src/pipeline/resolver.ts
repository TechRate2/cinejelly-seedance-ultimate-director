/**
 * Variable resolver for pipeline steps.
 *
 * Resolves:
 * - $step_id.output  → output path from a previous step
 * - $step_id.data.X  → arbitrary data from a previous step result
 * - ${ENV_VAR}       → environment variable
 */

import type { StepResult } from "./types.js";

/**
 * Resolve all variable references in a step's parameters.
 * Returns a new object with all $refs replaced by actual values.
 */
export function resolveStepParams(
  params: Record<string, unknown>,
  completedSteps: Map<string, StepResult>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (key === "id" || key === "action") continue; // skip meta fields
    resolved[key] = resolveValue(value, completedSteps);
  }

  return resolved;
}

function resolveValue(
  value: unknown,
  completedSteps: Map<string, StepResult>,
): unknown {
  if (typeof value === "string") {
    return resolveString(value, completedSteps);
  }
  if (Array.isArray(value)) {
    return value.map(v => resolveValue(v, completedSteps));
  }
  if (value && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      resolved[k] = resolveValue(v, completedSteps);
    }
    return resolved;
  }
  return value;
}

function resolveString(
  str: string,
  completedSteps: Map<string, StepResult>,
): string {
  // Replace ${ENV_VAR} with environment variables
  let result = str.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, envVar) => {
    return process.env[envVar] || "";
  });

  // Replace $step_id.output or $step_id.data.field
  result = result.replace(/\$([a-z][a-z0-9_-]*)\.(output|data\.[a-z_]+)/gi, (_match, stepId, field) => {
    const step = completedSteps.get(stepId);
    if (!step) return _match; // leave unresolved if step not found

    if (field === "output") {
      return step.output || "";
    }
    if (field.startsWith("data.")) {
      const dataKey = field.slice(5);
      return String(step.data?.[dataKey] ?? "");
    }
    return _match;
  });

  return result;
}

/**
 * Validate that all $refs in a step can be resolved.
 * Returns list of unresolvable references.
 */
export function findUnresolvedRefs(
  params: Record<string, unknown>,
  availableStepIds: Set<string>,
): string[] {
  const unresolved: string[] = [];
  const json = JSON.stringify(params);

  const refs = json.matchAll(/\$([a-z][a-z0-9_-]*)\.(output|data\.[a-z_]+)/gi);
  for (const ref of refs) {
    if (!availableStepIds.has(ref[1])) {
      unresolved.push(ref[0]);
    }
  }

  return unresolved;
}
