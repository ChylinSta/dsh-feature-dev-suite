import path from "node:path";
import { runFeatureDev } from "./actions.js";
import type { FeatureDevArgs } from "./actions.js";
import { FeatureDevError } from "./errors.js";
import { resolveImplementTools } from "./implement-tools.js";
import type { WorkflowEngine } from "./runner.js";
import { listRunStates, readState } from "./state.js";
import type { RunState } from "./state.js";
import { presentRun } from "./view.js";
import type { RunView } from "./view.js";

export interface ActionOutcome {
  message: string;
  run: RunView | null;
  code: string;
  applied: boolean;
}

export interface HostExecution {
  session: boolean;
  engine: boolean;
}

export interface FeatureApi {
  root: string;
  execution: HostExecution;
  listRuns(): RunView[];
  getStatus(runId: string): RunView;
  present(state: RunState): RunView;
  start(input: {
    featureSummary?: unknown;
    risks?: unknown;
    adversarialDesign?: unknown;
    adversarialCode?: unknown;
    implementTools?: unknown;
  }): Promise<ActionOutcome>;
  advance(runId: string): Promise<ActionOutcome>;
  approve(runId: string, note: unknown): Promise<ActionOutcome>;
  reject(runId: string, reason: unknown): Promise<ActionOutcome>;
}

function readImplementOverride(value: unknown): string[] | false | undefined {
  if (value === undefined) return undefined;
  if (value === false || value === null) return false;
  if (!Array.isArray(value)) {
    throw new FeatureDevError(
      "implementTools must be a non-empty list of tool names, or false to leave implement unrestricted.",
      { code: "implement_tools_invalid", status: 400 },
    );
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function resolveRoot(config?: { root?: string } | null): string {
  const configured = typeof config?.root === "string" ? config.root.trim() : "";
  const fromEnv = typeof process.env.DSH_FEATURE_DEV_ROOT === "string"
    ? process.env.DSH_FEATURE_DEV_ROOT.trim()
    : "";
  return path.resolve(configured || fromEnv || process.cwd());
}

export function createFeatureApi(options: {
  root: string;
  engine?: WorkflowEngine;
  agent?: unknown;
  signal?: AbortSignal;
  /** Omit for the default implement allowlist. `false` leaves new runs unrestricted. */
  implementTools?: unknown;
}): FeatureApi {
  const root = options.root;
  const implementTools = resolveImplementTools(options.implementTools);
  const execution: HostExecution = {
    session: Boolean(options.agent),
    engine: Boolean(options.engine),
  };

  function present(state: RunState): RunView {
    return presentRun(state, execution);
  }

  async function act(args: FeatureDevArgs): Promise<ActionOutcome> {
    const result = await runFeatureDev(
      options.engine,
      { ...args, workspaceRoot: root },
      options.agent,
      options.signal,
      { implementTools },
    );
    return {
      message: result.text,
      run: result.state ? present(result.state) : null,
      code: result.code,
      applied: result.applied,
    };
  }

  return {
    root,
    execution,
    listRuns() {
      return listRunStates(root).map(present);
    },
    getStatus(runId: string) {
      return present(readState(root, runId));
    },
    present,
    start(input) {
      const implementOverride = readImplementOverride(input.implementTools);
      return act({
        action: "start",
        featureSummary: typeof input.featureSummary === "string" ? input.featureSummary : undefined,
        risks: Array.isArray(input.risks) ? input.risks.filter((item): item is string => typeof item === "string") : [],
        adversarialDesign: input.adversarialDesign === true,
        adversarialCode: input.adversarialCode === true,
        ...(implementOverride === undefined ? {} : { implementTools: implementOverride }),
      });
    },
    advance(runId) {
      return act({ action: "advance", runId });
    },
    approve(runId, note) {
      return act({ action: "approve", runId, reason: typeof note === "string" ? note : undefined });
    },
    reject(runId, reason) {
      return act({ action: "reject", runId, reason: typeof reason === "string" ? reason : undefined });
    },
  };
}
