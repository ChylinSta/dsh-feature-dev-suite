/**
 * What should happen next for one run. The chat tool and the sidebar read
 * this from the same state. It does not choose a different transition than
 * `runFeatureDev` — it only describes the transition that runner already makes.
 */

import { STAGE_DEFS } from "./phases.js";
import { nextStage } from "./state.js";
import type { RunState } from "./state.js";

export type NextCode = "execute_in_chat" | "retry_in_chat" | "await_decision" | "leave_gate" | "done";

export interface NextStep {
  code: NextCode;
  stage: string;
  gate: "design_review" | "human_diff" | null;
}

export interface ChatCall {
  tool: "feature_dev";
  action: "advance";
  runId: string;
  /** One line a person can paste into the workspace chat. */
  text: string;
}

export interface ExecutionContext {
  /** True when this caller holds the live parent agent workflowEngine requires. */
  session: boolean;
  /** True when this caller was given a workflowEngine. */
  engine: boolean;
}

export function nextStep(state: RunState): NextStep {
  const stage = state.current;
  const status = state.statusByStage[stage] ?? "pending";
  if (stage === "done") return { code: "done", stage, gate: null };
  const def = STAGE_DEFS.find((item) => item.id === stage);
  const humanGate = def?.humanGate === true;
  const gate = humanGate && (stage === "design_review" || stage === "human_diff") ? stage : null;
  if (status === "failed") return { code: "retry_in_chat", stage, gate };
  if (humanGate && status === "blocked") return { code: "await_decision", stage, gate };
  if (humanGate && status === "approved") return { code: "leave_gate", stage, gate };
  return { code: "execute_in_chat", stage, gate };
}

/** Sidebar Advance starts a workflow only when this caller has both halves. Leaving an approved gate never does. */
export function sidebarCanAdvance(step: NextStep, context: ExecutionContext): boolean {
  if (step.code === "leave_gate") return true;
  if (!context.session || !context.engine) return false;
  return step.code === "execute_in_chat" || step.code === "retry_in_chat";
}

export function followingStage(state: RunState): string | null {
  return nextStage(state);
}

/** The human gate this stage became active from, when that gate is already done. */
export function justLeftGate(state: RunState): string | null {
  const index = state.stages.indexOf(state.current);
  if (index <= 0) return null;
  const previous = state.stages[index - 1];
  if (!previous) return null;
  const def = STAGE_DEFS.find((item) => item.id === previous);
  if (def?.humanGate !== true || state.statusByStage[previous] !== "done") return null;
  const status = state.statusByStage[state.current] ?? "pending";
  if (status !== "active" && status !== "failed") return null;
  return previous;
}

export function chatAdvanceCall(state: RunState): ChatCall {
  const stage = state.current;
  const left = justLeftGate(state);
  const text = left
    ? `Use the feature_dev tool with action "advance" and runId "${state.runId}". The previous advance only left the ${left} gate and did not execute ${stage}. This call executes ${stage}. Do not start a new run. Stop after this stage.`
    : `Use the feature_dev tool with action "advance" and runId "${state.runId}". This call executes the current stage (${stage}). Do not start a new run. Stop after this stage.`;
  return {
    tool: "feature_dev",
    action: "advance",
    runId: state.runId,
    text,
  };
}

export function expectedArtifact(state: RunState): { file: string; relativePath: string } | null {
  if ((state.iterate ?? 0) > 0 && state.iterateStage && state.iterateStage !== "done") {
    const file = `iterate-${state.iterate}.md`;
    return {
      file,
      relativePath: `.feature-dev/${state.runId}/${file}`,
    };
  }
  const def = STAGE_DEFS.find((item) => item.id === state.current);
  if (!def?.artifact) return null;
  return {
    file: def.artifact,
    relativePath: `.feature-dev/${state.runId}/${def.artifact}`,
  };
}

export function nextHint(state: RunState, step: NextStep, context: ExecutionContext): string {
  const expected = expectedArtifact(state);
  const where = expected ? ` Artifact: ${expected.relativePath}.` : "";
  switch (step.code) {
    case "done":
      return `Pipeline is done.${where}`;
    case "await_decision":
      return `Gate ${step.stage} is waiting for approve or reject. The sidebar and feature_dev both record that decision. Advance stays off until the gate is approved.${where}`;
    case "leave_gate":
      return leaveGateHint(state, step.stage, where);
    case "retry_in_chat":
      return `${executeLead(state, step.stage, true)} Retry with feature_dev advance in a chat session. The sidebar has no session agent, so its Advance stays off.${implementNote(state)}${where}`;
    case "execute_in_chat":
      return executeHint(state, step.stage, context, where);
  }
}

function leaveGateHint(state: RunState, stage: string, where: string): string {
  const next = followingStage(state);
  if (!next || next === "done") {
    return `Gate ${stage} is approved. The next feature_dev advance only leaves this gate and marks the run done. It does not execute another stage.${where}`;
  }
  return `Gate ${stage} is approved. The next feature_dev advance only leaves this gate and makes ${next} active. It does not execute ${next}. When ${next} is active, one more feature_dev advance in chat executes ${next}.${where}`;
}

function executeLead(state: RunState, stage: string, failed: boolean): string {
  const left = justLeftGate(state);
  if (failed && left) {
    return `Stage ${stage} failed. The advance that left ${left} did not execute ${stage}.`;
  }
  if (failed) return `Stage ${stage} failed.`;
  if (left) {
    return `Stage ${stage} is active. The advance that left ${left} did not execute ${stage}. The next feature_dev advance in chat is the one that executes ${stage}.`;
  }
  return `Stage ${stage} is ready. The next feature_dev advance in chat executes ${stage}.`;
}

function implementNote(state: RunState): string {
  if (state.current !== "implement" || !Array.isArray(state.implementTools) || state.implementTools.length === 0) return "";
  return ` Implement may call only: ${state.implementTools.join(", ")}.`;
}

function executeHint(state: RunState, stage: string, context: ExecutionContext, where: string): string {
  const lead = executeLead(state, stage, false);
  const tools = implementNote(state);
  if (context.session && context.engine) {
    return `${lead} This caller can run that advance. A sidebar without this session agent cannot.${tools}${where}`;
  }
  if (context.session && !context.engine) {
    return `${lead} This caller has no workflowEngine, so the advance cannot run until the feature-dev bundle group is loaded.${tools}${where}`;
  }
  return `${lead} The sidebar has no session agent, so Advance stays off.${tools}${where}`;
}
