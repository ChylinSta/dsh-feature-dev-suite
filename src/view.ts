import fs from "node:fs";
import path from "node:path";
import { STAGE_DEFS } from "./phases.js";
import { runDir } from "./state.js";
import type { RunState } from "./state.js";

export interface StageView {
  id: string;
  title: string;
  status: string;
  humanGate: boolean;
}

export interface RunView {
  id: string;
  featureSummary: string;
  risks: string[];
  adversarialDesign: boolean;
  adversarialCode: boolean;
  createdAt: string;
  updatedAt: string;
  current: string;
  status: string;
  blocked: boolean;
  approved: boolean;
  humanGate: boolean;
  gate: "design_review" | "human_diff" | null;
  stages: StageView[];
  artifactDir: string;
  artifactPath: string;
  files: string[];
  notes: string[];
}

export function presentRun(state: RunState): RunView {
  const dir = runDir(state.workspaceRoot, state.runId);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    names = [];
  }
  const currentDef = STAGE_DEFS.find((stage) => stage.id === state.current);
  const status = state.statusByStage[state.current] ?? "pending";
  const humanGate = currentDef?.humanGate === true && state.current !== "done";
  const gate = humanGate && status === "blocked" && (state.current === "design_review" || state.current === "human_diff")
    ? state.current
    : null;
  return {
    id: state.runId,
    featureSummary: state.featureSummary,
    risks: [...state.risks],
    adversarialDesign: state.adversarialDesign,
    adversarialCode: state.adversarialCode,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    current: state.current,
    status,
    blocked: status === "blocked",
    approved: status === "approved",
    humanGate,
    gate,
    stages: state.stages.map((id) => {
      const def = STAGE_DEFS.find((stage) => stage.id === id);
      return {
        id,
        title: def?.title ?? id,
        status: state.statusByStage[id] ?? "pending",
        humanGate: def?.humanGate === true,
      };
    }),
    artifactDir: `.feature-dev/${state.runId}`,
    artifactPath: dir,
    files: names.filter((name) => name !== "state.json").sort(),
    notes: state.notes.slice(-8),
  };
}
