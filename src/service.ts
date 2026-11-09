import path from "node:path";
import { runFeatureDev } from "./actions.js";
import type { FeatureDevArgs } from "./actions.js";
import type { WorkflowEngine } from "./runner.js";
import { listRunStates, readState } from "./state.js";
import { presentRun } from "./view.js";
import type { RunView } from "./view.js";

export interface ActionOutcome {
  message: string;
  run: RunView | null;
}

export interface FeatureApi {
  root: string;
  listRuns(): RunView[];
  getStatus(runId: string): RunView;
  start(input: {
    featureSummary?: unknown;
    risks?: unknown;
    adversarialDesign?: unknown;
    adversarialCode?: unknown;
  }): Promise<ActionOutcome>;
  advance(runId: string): Promise<ActionOutcome>;
  approve(runId: string, note: unknown): Promise<ActionOutcome>;
  reject(runId: string, reason: unknown): Promise<ActionOutcome>;
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
}): FeatureApi {
  const root = options.root;

  async function act(args: FeatureDevArgs): Promise<ActionOutcome> {
    const result = await runFeatureDev(options.engine, { ...args, workspaceRoot: root }, options.agent, options.signal);
    return {
      message: result.text,
      run: result.state ? presentRun(result.state) : null,
    };
  }

  return {
    root,
    listRuns() {
      return listRunStates(root).map(presentRun);
    },
    getStatus(runId: string) {
      return presentRun(readState(root, runId));
    },
    start(input) {
      return act({
        action: "start",
        featureSummary: typeof input.featureSummary === "string" ? input.featureSummary : undefined,
        risks: Array.isArray(input.risks) ? input.risks.filter((item): item is string => typeof item === "string") : [],
        adversarialDesign: input.adversarialDesign === true,
        adversarialCode: input.adversarialCode === true,
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
