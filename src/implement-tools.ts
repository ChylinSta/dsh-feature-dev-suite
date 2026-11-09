/**
 * Tool names the implement stage is asked to stay inside.
 * workflow `agent()` rejects any option other than label, phase, schema,
 * provider, and model, so this list cannot be a runtime toolFilter. It is
 * snapshotted onto the run and written into the implement prompt.
 * `null` means unrestricted (legacy runs, or an explicit opt-out).
 */

import { FeatureDevError } from "./errors.js";

export const DEFAULT_IMPLEMENT_TOOLS = [
  "read",
  "write",
  "edit",
  "apply_patch",
  "grep",
  "glob",
  "bash",
  "todo_write",
] as const;

const TOOL_NAME = /^[A-Za-z0-9_.:-]+$/;

export function resolveImplementTools(value: unknown): string[] | null {
  if (value === undefined) return [...DEFAULT_IMPLEMENT_TOOLS];
  if (value === false || value === null) return null;
  if (!Array.isArray(value) || value.length === 0) {
    throw new FeatureDevError(
      "implementTools must be a non-empty list of tool names, or false to leave implement unrestricted.",
      { code: "implement_tools_invalid", status: 400 },
    );
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      throw new FeatureDevError(
        "implementTools must be a non-empty list of tool names, or false to leave implement unrestricted.",
        { code: "implement_tools_invalid", status: 400 },
      );
    }
    const name = item.trim();
    if (!TOOL_NAME.test(name)) {
      throw new FeatureDevError(
        `implementTools entry "${name}" is not a tool name.`,
        { code: "implement_tools_invalid", status: 400 },
      );
    }
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function implementToolLine(tools: string[] | null | undefined): string {
  if (!tools || tools.length === 0) return "(unrestricted)";
  return tools.join(", ");
}
