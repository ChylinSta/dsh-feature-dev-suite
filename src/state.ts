import fs from "node:fs";
import path from "node:path";
import { STAGE_DEFS, buildStageOrder } from "./phases.js";

export interface RunState {
  runId: string;
  createdAt: string;
  updatedAt: string;
  featureSummary: string;
  risks: string[];
  adversarialDesign: boolean;
  adversarialCode: boolean;
  maxCodeReviewRounds: number;
  stages: string[];
  statusByStage: Record<string, string>;
  current: string;
  notes: string[];
  workspaceRoot: string;
}

export interface CreateRunInput {
  workspaceRoot: string;
  featureSummary: string;
  risks?: string[];
  adversarialDesign?: boolean;
  adversarialCode?: boolean;
  maxCodeReviewRounds?: number;
}

export function runDir(workspaceRoot: string, runId: string): string {
  return path.join(workspaceRoot, ".feature-dev", runId);
}

function ensureRunDir(workspaceRoot: string, runId: string): string {
  const dir = runDir(workspaceRoot, runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function statePath(workspaceRoot: string, runId: string): string {
  return path.join(runDir(workspaceRoot, runId), "state.json");
}

export function writeState(state: RunState): void {
  const dir = ensureRunDir(state.workspaceRoot, state.runId);
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath(state.workspaceRoot, state.runId), JSON.stringify(state, null, 2), "utf8");
  const def = STAGE_DEFS.find((s) => s.id === state.current);
  if (def?.artifact) {
    const p = path.join(dir, def.artifact);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(
        p,
        [
          `# ${def.title}`,
          "",
          `_Status: ${state.statusByStage[state.current] ?? "pending"}_`,
          "",
          "(skeleton placeholder)",
          "",
        ].join("\n"),
        "utf8",
      );
    }
  }
}

export function readState(workspaceRoot: string, runId: string): RunState {
  const raw = fs.readFileSync(statePath(workspaceRoot, runId), "utf8");
  return JSON.parse(raw) as RunState;
}

export function createRun(input: CreateRunInput): RunState {
  const runId = `fd-${Date.now().toString(36)}`;
  const risks = input.risks ?? [];
  const adversarialDesign = input.adversarialDesign ?? false;
  const adversarialCode = input.adversarialCode ?? false;
  const stages = buildStageOrder({ risks, adversarialDesign, adversarialCode });
  const statusByStage: Record<string, string> = {};
  for (const id of stages) statusByStage[id] = id === "requirements" ? "active" : "pending";
  const state: RunState = {
    runId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    featureSummary: input.featureSummary,
    risks,
    adversarialDesign,
    adversarialCode,
    maxCodeReviewRounds: input.maxCodeReviewRounds ?? 2,
    stages,
    statusByStage,
    current: "requirements",
    notes: [],
    workspaceRoot: input.workspaceRoot,
  };
  writeState(state);
  const dir = runDir(input.workspaceRoot, runId);
  fs.writeFileSync(
    path.join(dir, "00-brief.md"),
    [
      "# Feature brief",
      "",
      input.featureSummary,
      "",
      `Risks: ${risks.join(", ") || "(none)"}`,
      "",
    ].join("\n"),
    "utf8",
  );
  return state;
}

function stageIndex(state: RunState, id = state.current): number {
  return state.stages.indexOf(id);
}

export function nextStage(state: RunState): string | null {
  const i = stageIndex(state);
  if (i < 0 || i >= state.stages.length - 1) return null;
  return state.stages[i + 1]!;
}
