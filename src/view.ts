import fs from "node:fs";
import path from "node:path";
import { listExpectedArtifacts, stageIdForArtifact } from "./artifacts.js";
import type { ExpectedArtifact } from "./artifacts.js";
import { expectedArtifact, nextHint, nextStep, sidebarCanAdvance, chatAdvanceCall } from "./guidance.js";
import type { ChatCall, ExecutionContext, NextCode } from "./guidance.js";
import { STAGE_DEFS } from "./phases.js";
import { runDir } from "./state.js";
import type { RunState } from "./state.js";

export interface StageView {
  id: string;
  title: string;
  status: string;
  humanGate: boolean;
}

export interface ArtifactFileView {
  name: string;
  relativePath: string;
  stageId: string | null;
  placeholder: boolean;
}

export interface NextView {
  code: NextCode;
  advanceEnabled: boolean;
  stage: string;
  gate: "design_review" | "human_diff" | null;
  hint: string;
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
  execution: { session: boolean; engine: boolean };
  next: NextView;
  chatCall: ChatCall | null;
  expectedFile: string | null;
  expectedRelative: string | null;
  artifactFiles: ArtifactFileView[];
  /** Every file this run's stage list expects, including ones not written yet. */
  expectedArtifacts: ExpectedArtifact[];
  /** `null` when this run does not constrain the implement stage. */
  implementTools: string[] | null;
}

function isPlaceholder(file: string): boolean {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(512);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.toString("utf8", 0, read).includes("(skeleton placeholder)");
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function presentRun(state: RunState, context: Partial<ExecutionContext> = {}): RunView {
  const session = context.session === true;
  const engine = context.engine === true;
  const caller = { session, engine };
  const dir = runDir(state.workspaceRoot, state.runId);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    names = [];
  }
  const visible = names.filter((name) => name !== "state.json" && !name.endsWith(".tmp")).sort();
  const currentDef = STAGE_DEFS.find((stage) => stage.id === state.current);
  const status = state.statusByStage[state.current] ?? "pending";
  const humanGate = currentDef?.humanGate === true && state.current !== "done";
  const step = nextStep(state);
  const gate = step.code === "await_decision" ? step.gate : null;
  const expected = expectedArtifact(state);
  const wantsChat = step.code === "execute_in_chat" || step.code === "retry_in_chat";
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
    files: visible,
    notes: state.notes.slice(-8),
    execution: caller,
    next: {
      code: step.code,
      advanceEnabled: sidebarCanAdvance(step, caller),
      stage: step.stage,
      gate: step.gate,
      hint: nextHint(state, step, caller),
    },
    chatCall: wantsChat ? chatAdvanceCall(state) : null,
    implementTools: Array.isArray(state.implementTools) ? [...state.implementTools] : null,
    expectedFile: expected?.file ?? null,
    expectedRelative: expected?.relativePath ?? null,
    expectedArtifacts: listExpectedArtifacts(state),
    artifactFiles: visible.map((name) => ({
      name,
      relativePath: `.feature-dev/${state.runId}/${name}`,
      stageId: stageIdForArtifact(name),
      placeholder: isPlaceholder(path.join(dir, name)),
    })),
  };
}
