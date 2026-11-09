/**
 * Shared feature_dev actions. The chat tool and the sidebar call this so a
 * transition made in either place is the transition the other one reads back.
 * Returned text matches the tool's previous messages.
 */

import { STAGE_DEFS } from "./phases.js";
import { executeStage } from "./runner.js";
import type { WorkflowEngine } from "./runner.js";
import { createRun, nextStage, readState, runDir, writeState } from "./state.js";
import type { RunState } from "./state.js";

export interface FeatureDevArgs {
  action: string;
  runId?: string;
  featureSummary?: string;
  workspaceRoot?: string;
  risks?: string[];
  adversarialDesign?: boolean;
  adversarialCode?: boolean;
  reason?: string;
}

export interface FeatureDevResult {
  text: string;
  state: RunState | null;
}

function summarize(state: RunState): string {
  const lines = [
    `runId: ${state.runId}`,
    `current: ${state.current}`,
    `status: ${state.statusByStage[state.current]}`,
    `dir: ${runDir(state.workspaceRoot, state.runId)}`,
    `stages: ${state.stages.join(" → ")}`,
    `risks: ${state.risks.join(", ") || "(none)"}`,
    `adversarialDesign: ${state.adversarialDesign}`,
    `adversarialCode: ${state.adversarialCode}`,
  ];
  const def = STAGE_DEFS.find((s) => s.id === state.current);
  if (def?.humanGate && state.statusByStage[state.current] === "blocked") {
    lines.push(`gate: waiting for human approve/reject on ${state.current}`);
  }
  if (state.notes.length) {
    lines.push("notes:");
    for (const n of state.notes.slice(-8)) lines.push(`- ${n}`);
  }
  return lines.join("\n");
}

function moveTo(state: RunState, nxt: string): void {
  state.current = nxt;
  const nxtDef = STAGE_DEFS.find((s) => s.id === nxt);
  state.statusByStage[nxt] = nxt === "done" ? "done" : "active";
  if (nxtDef?.humanGate && nxt !== "done") {
    state.statusByStage[nxt] = "active";
  }
}

export async function runFeatureDev(
  engine: WorkflowEngine | undefined,
  args: FeatureDevArgs,
  agent: unknown,
  signal: AbortSignal | undefined,
): Promise<FeatureDevResult> {
  const workspaceRoot = args.workspaceRoot?.trim() || process.cwd();
  if (args.action === "start") {
    if (!args.featureSummary?.trim()) {
      throw new Error("featureSummary is required for start");
    }
    const state = createRun({
      workspaceRoot,
      featureSummary: args.featureSummary.trim(),
      risks: args.risks ?? [],
      adversarialDesign: args.adversarialDesign === true,
      adversarialCode: args.adversarialCode === true,
    });
    return { text: `Started feature-dev run.\n${summarize(state)}`, state };
  }
  if (!args.runId?.trim()) throw new Error("runId is required");
  const state = readState(workspaceRoot, args.runId.trim());
  state.workspaceRoot = state.workspaceRoot || workspaceRoot;
  if (args.action === "status") {
    return { text: summarize(state), state };
  }
  if (args.action === "approve") {
    const cur = state.current;
    const def = STAGE_DEFS.find((s) => s.id === cur);
    if (!def?.humanGate) {
      throw new Error(`current stage ${cur} is not a human gate`);
    }
    if (state.statusByStage[cur] !== "blocked" && state.statusByStage[cur] !== "active") {
      // Published bundle keeps this branch and still records the approval.
    }
    state.statusByStage[cur] = "approved";
    state.notes.push(`approved ${cur}: ${args.reason?.trim() || "ok"}`);
    writeState(state);
    return { text: `Approved ${cur}. Call advance to continue.\n${summarize(state)}`, state };
  }
  if (args.action === "reject") {
    const cur = state.current;
    const def = STAGE_DEFS.find((s) => s.id === cur);
    if (!def?.humanGate) {
      throw new Error(`current stage ${cur} is not a human gate`);
    }
    const i = state.stages.indexOf(cur);
    const back = i > 0 ? state.stages[i - 1]! : cur;
    state.statusByStage[cur] = "pending";
    state.statusByStage[back] = "active";
    state.current = back;
    state.notes.push(`rejected ${cur} → back to ${back}: ${args.reason?.trim() || "(no reason)"}`);
    writeState(state);
    return { text: `Rejected ${cur}, returned to ${back}.\n${summarize(state)}`, state };
  }
  if (args.action === "advance") {
    const cur = state.current;
    if (cur === "done") {
      return { text: `Already done.\n${summarize(state)}`, state };
    }
    const def = STAGE_DEFS.find((s) => s.id === cur);
    const status = state.statusByStage[cur];
    if (def?.humanGate && status === "approved") {
      state.statusByStage[cur] = "done";
      const nxt = nextStage(state);
      if (!nxt) {
        state.current = "done";
        state.statusByStage.done = "done";
        writeState(state);
        return { text: `Left approved gate ${cur} → done.\n${summarize(state)}`, state };
      }
      moveTo(state, nxt);
      state.notes.push(`left approved gate ${cur} → ${nxt}`);
      writeState(state);
      return { text: `Left approved gate ${cur} → ${nxt}.\n${summarize(state)}`, state };
    }
    if (def?.humanGate && status === "blocked") {
      return { text: `Cannot advance: ${cur} is waiting for human approve/reject.\n${summarize(state)}`, state };
    }
    if (!agent) {
      throw new Error("feature_dev advance requires a calling agent (exec.agent was undefined)");
    }
    state.notes.push(`executing stage ${cur}`);
    writeState(state);
    const result = await executeStage({ workflowEngine: engine }, state, cur, agent, signal);
    if (!result.ok) {
      state.statusByStage[cur] = "failed";
      state.notes.push(`stage ${cur} failed: ${result.detail}`);
      writeState(state);
      throw new Error(result.detail);
    }
    state.notes.push(result.detail);
    if (result.artifactPath) state.notes.push(`wrote ${result.artifactPath}`);
    if (def?.humanGate) {
      state.statusByStage[cur] = "blocked";
      writeState(state);
      return { text: `Stage ${cur} executed; human gate is now blocked pending approve/reject.\n${summarize(state)}`, state };
    }
    state.statusByStage[cur] = "done";
    const nxt = nextStage(state);
    if (!nxt) {
      state.current = "done";
      state.statusByStage.done = "done";
      writeState(state);
      return { text: `Stage ${cur} done → pipeline complete.\n${summarize(state)}`, state };
    }
    moveTo(state, nxt);
    writeState(state);
    return { text: `Stage ${cur} done → ${nxt} is active.\n${summarize(state)}`, state };
  }
  throw new Error(`unknown action: ${args.action}`);
}
