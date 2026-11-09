/**
 * Shared feature_dev actions. The chat tool and the sidebar call this so a
 * transition made in either place is the transition the other one reads back.
 * Returned text matches the tool's previous messages.
 */

import { FeatureDevError } from "./errors.js";
import { chatAdvanceCall, expectedArtifact, nextHint, nextStep } from "./guidance.js";
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
  code: string;
  applied: boolean;
}

function summarize(state: RunState, context: { session: boolean; engine: boolean }): string {
  const step = nextStep(state);
  const lines = [
    `runId: ${state.runId}`,
    `current: ${state.current}`,
    `status: ${state.statusByStage[state.current]}`,
    `dir: ${runDir(state.workspaceRoot, state.runId)}`,
    `stages: ${state.stages.join(" → ")}`,
    `risks: ${state.risks.join(", ") || "(none)"}`,
    `adversarialDesign: ${state.adversarialDesign}`,
    `adversarialCode: ${state.adversarialCode}`,
    `next: ${step.code}`,
    `sidebarAdvance: ${step.code === "leave_gate" ? "leave-gate-only" : "no"}`,
    `hint: ${nextHint(state, step, context)}`,
  ];
  if (step.code === "execute_in_chat" || step.code === "retry_in_chat") {
    lines.push(`chat: ${chatAdvanceCall(state.runId).text}`);
  }
  const expected = expectedArtifact(state);
  if (expected) lines.push(`artifact: ${expected.relativePath}`);
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
  const caller = { session: Boolean(agent), engine: Boolean(engine) };
  const reply = (text: string, state: RunState | null, code: string, applied: boolean): FeatureDevResult => ({
    text,
    state,
    code,
    applied,
  });
  const workspaceRoot = args.workspaceRoot?.trim() || process.cwd();
  if (args.action === "start") {
    if (!args.featureSummary?.trim()) {
      throw new FeatureDevError("featureSummary is required for start", { code: "feature_summary_required", status: 400 });
    }
    const state = createRun({
      workspaceRoot,
      featureSummary: args.featureSummary.trim(),
      risks: args.risks ?? [],
      adversarialDesign: args.adversarialDesign === true,
      adversarialCode: args.adversarialCode === true,
    });
    return reply(`Started feature-dev run.\n${summarize(state, caller)}`, state, "started", true);
  }
  if (!args.runId?.trim()) {
    throw new FeatureDevError("runId is required", { code: "run_id_required", status: 400 });
  }
  const state = readState(workspaceRoot, args.runId.trim());
  state.workspaceRoot = state.workspaceRoot || workspaceRoot;
  if (args.action === "status") {
    return reply(summarize(state, caller), state, "status", false);
  }
  if (args.action === "approve") {
    const cur = state.current;
    const def = STAGE_DEFS.find((s) => s.id === cur);
    if (!def?.humanGate) {
      throw new FeatureDevError(`current stage ${cur} is not a human gate`, { code: "not_a_gate", status: 400, state });
    }
    if (state.statusByStage[cur] !== "blocked" && state.statusByStage[cur] !== "active") {
      // Published bundle keeps this branch and still records the approval.
    }
    state.statusByStage[cur] = "approved";
    state.notes.push(`approved ${cur}: ${args.reason?.trim() || "ok"}`);
    writeState(state);
    return reply(
      `Approved ${cur}. Call advance to continue. That next advance only leaves the gate; it does not execute the following stage.\n${summarize(state, caller)}`,
      state,
      "approved",
      true,
    );
  }
  if (args.action === "reject") {
    const cur = state.current;
    const def = STAGE_DEFS.find((s) => s.id === cur);
    if (!def?.humanGate) {
      throw new FeatureDevError(`current stage ${cur} is not a human gate`, { code: "not_a_gate", status: 400, state });
    }
    const i = state.stages.indexOf(cur);
    const back = i > 0 ? state.stages[i - 1]! : cur;
    state.statusByStage[cur] = "pending";
    state.statusByStage[back] = "active";
    state.current = back;
    state.notes.push(`rejected ${cur} → back to ${back}: ${args.reason?.trim() || "(no reason)"}`);
    writeState(state);
    return reply(`Rejected ${cur}, returned to ${back}.\n${summarize(state, caller)}`, state, "rejected", true);
  }
  if (args.action === "advance") {
    const cur = state.current;
    if (cur === "done") {
      return reply(`Already done.\n${summarize(state, caller)}`, state, "already_done", false);
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
        return reply(`Left approved gate ${cur} → done.\n${summarize(state, caller)}`, state, "left_gate", true);
      }
      moveTo(state, nxt);
      state.notes.push(`left approved gate ${cur} → ${nxt}`);
      writeState(state);
      return reply(
        `Left approved gate ${cur} → ${nxt}. Call advance again in this chat to execute ${nxt}.\n${summarize(state, caller)}`,
        state,
        "left_gate",
        true,
      );
    }
    if (def?.humanGate && status === "blocked") {
      return reply(
        `Cannot advance: ${cur} is waiting for human approve/reject.\n${summarize(state, caller)}`,
        state,
        "awaiting_decision",
        false,
      );
    }
    if (!agent) {
      throw new FeatureDevError(
        `Executing stage ${cur} needs a calling agent in a chat session. The sidebar shares .feature-dev/${state.runId}/ but cannot start workflowEngine without that agent.`,
        { code: "needs_session", status: 409, chatCall: chatAdvanceCall(state.runId), state },
      );
    }
    state.notes.push(`executing stage ${cur}`);
    writeState(state);
    const result = await executeStage({ workflowEngine: engine }, state, cur, agent, signal);
    if (!result.ok) {
      state.statusByStage[cur] = "failed";
      state.notes.push(`stage ${cur} failed: ${result.detail}`);
      writeState(state);
      const missingEngine = result.detail.includes("workflowEngine");
      throw new FeatureDevError(result.detail, {
        code: missingEngine ? "engine_unavailable" : "stage_failed",
        status: 400,
        chatCall: chatAdvanceCall(state.runId),
        state,
      });
    }
    state.notes.push(result.detail);
    if (result.artifactPath) state.notes.push(`wrote ${result.artifactPath}`);
    if (def?.humanGate) {
      state.statusByStage[cur] = "blocked";
      writeState(state);
      return reply(
        `Stage ${cur} executed; human gate is now blocked pending approve/reject.\n${summarize(state, caller)}`,
        state,
        "executed",
        true,
      );
    }
    state.statusByStage[cur] = "done";
    const nxt = nextStage(state);
    if (!nxt) {
      state.current = "done";
      state.statusByStage.done = "done";
      writeState(state);
      return reply(`Stage ${cur} done → pipeline complete.\n${summarize(state, caller)}`, state, "executed", true);
    }
    moveTo(state, nxt);
    writeState(state);
    return reply(`Stage ${cur} done → ${nxt} is active.\n${summarize(state, caller)}`, state, "executed", true);
  }
  throw new FeatureDevError(`unknown action: ${args.action}`, { code: "unknown_action", status: 400 });
}
