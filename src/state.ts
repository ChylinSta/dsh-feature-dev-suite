import fs from "node:fs";
import path from "node:path";
import { FeatureDevError } from "./errors.js";
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

function writeAtomic(file: string, contents: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, "utf8");
  try {
    fs.renameSync(tmp, file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EACCES") {
      try { fs.unlinkSync(tmp); } catch { /* keep the previous state.json */ }
      throw error;
    }
    try { fs.unlinkSync(file); } catch { /* the destination may already be gone */ }
    try {
      fs.renameSync(tmp, file);
    } catch (renameError) {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      throw renameError;
    }
  }
}

export function writeState(state: RunState): void {
  const dir = ensureRunDir(state.workspaceRoot, state.runId);
  state.updatedAt = new Date().toISOString();
  writeAtomic(statePath(state.workspaceRoot, state.runId), JSON.stringify(state, null, 2));
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

function coerceRun(value: unknown, workspaceRoot: string, runId: string): RunState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const state = value as RunState;
  if (state.runId !== runId) return null;
  if (typeof state.current !== "string" || !Array.isArray(state.stages)) return null;
  if (state.stages.some((stage) => typeof stage !== "string")) return null;
  if (typeof state.statusByStage !== "object" || state.statusByStage === null || Array.isArray(state.statusByStage)) return null;
  if (typeof state.featureSummary !== "string") state.featureSummary = "";
  if (!Array.isArray(state.notes)) state.notes = [];
  else state.notes = state.notes.filter((note) => typeof note === "string");
  if (!Array.isArray(state.risks)) state.risks = [];
  else state.risks = state.risks.filter((risk) => typeof risk === "string");
  if (typeof state.workspaceRoot !== "string" || state.workspaceRoot === "") state.workspaceRoot = workspaceRoot;
  if (typeof state.createdAt !== "string") state.createdAt = "";
  if (typeof state.updatedAt !== "string") state.updatedAt = state.createdAt;
  if (typeof state.adversarialDesign !== "boolean") state.adversarialDesign = false;
  if (typeof state.adversarialCode !== "boolean") state.adversarialCode = false;
  if (typeof state.maxCodeReviewRounds !== "number") state.maxCodeReviewRounds = 2;
  return state;
}

export function readState(workspaceRoot: string, runId: string): RunState {
  let raw: string;
  try {
    raw = fs.readFileSync(statePath(workspaceRoot, runId), "utf8");
  } catch (error) {
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FeatureDevError(`Run ${runId} state is unreadable.`, { code: "unreadable_run", status: 400 });
  }
  const state = coerceRun(parsed, workspaceRoot, runId);
  if (!state) {
    throw new FeatureDevError(`Run ${runId} state is unreadable.`, { code: "unreadable_run", status: 400 });
  }
  return state;
}

const RUN_DIR_NAME = /^fd-[a-z0-9-]+$/;

/** Runs stored under `<workspace>/.feature-dev`, newest first. A bad entry is skipped; it does not hide the others. */
export function listRunStates(workspaceRoot: string): RunState[] {
  const home = path.join(workspaceRoot, ".feature-dev");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(home, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    if (code === "ENOTDIR") {
      throw new FeatureDevError("`.feature-dev` is not a directory, so runs cannot be listed.", {
        code: "runs_unreadable",
        status: 400,
      });
    }
    throw error;
  }
  const runs: RunState[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !RUN_DIR_NAME.test(entry.name)) continue;
    try {
      runs.push(readState(workspaceRoot, entry.name));
    } catch {
      continue;
    }
  }
  runs.sort((a, b) => {
    const byTime = (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
    if (byTime !== 0) return byTime;
    return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
  });
  return runs;
}

function allocateRunId(workspaceRoot: string): string {
  const base = `fd-${Date.now().toString(36)}`;
  if (!fs.existsSync(runDir(workspaceRoot, base))) return base;
  for (let n = 1; n <= 8; n += 1) {
    const candidate = `${base}-${n.toString(36)}`;
    if (!fs.existsSync(runDir(workspaceRoot, candidate))) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRun(input: CreateRunInput): RunState {
  const runId = allocateRunId(input.workspaceRoot);
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
