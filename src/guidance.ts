/**
 * What should happen next for one run. The chat tool and the sidebar read
 * this from the same state. It does not choose a different transition than
 * `runFeatureDev` — it only describes the transition that runner already makes.
 */

import { STAGE_DEFS } from "./phases.js";
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

export function chatAdvanceCall(runId: string): ChatCall {
  return {
    tool: "feature_dev",
    action: "advance",
    runId,
    text: `Use the feature_dev tool with action "advance" and runId "${runId}". Do not start a new run. Execute only the current stage, then stop.`,
  };
}

export function expectedArtifact(state: RunState): { file: string; relativePath: string } | null {
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
      return `Gate ${step.stage} is approved. The next advance only leaves the gate and activates the following stage. It does not execute that stage. Call advance again in chat to execute it.${where}`;
    case "retry_in_chat":
      return `Stage ${step.stage} failed. Retry with feature_dev advance in a chat session. The sidebar has no session agent, so its Advance stays off.${where}`;
    case "execute_in_chat":
      if (context.session && context.engine) {
        return `Stage ${step.stage} is ready. This caller can execute it with feature_dev advance. A sidebar that was not given this session agent cannot.${where}`;
      }
      if (context.session && !context.engine) {
        return `Stage ${step.stage} needs workflowEngine, and this caller does not have one. Load the feature-dev bundle group, then advance in chat.${where}`;
      }
      return `Stage ${step.stage} is ready. Execute it with feature_dev advance in a chat session. The sidebar shares this run but has no session agent, so Advance stays off.${where}`;
  }
}
