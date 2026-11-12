/**
 * Shared feature_dev actions. The chat tool and the sidebar call this so a
 * transition made in either place is the transition the other one reads back.
 * Returned text matches the tool's previous messages.
 */

import { formatArtifactChecklist, formatPlatformNote, listExpectedArtifacts, platformAttention } from "./artifacts.js";
import { FeatureDevError } from "./errors.js";
import { chatAdvanceCall, expectedArtifact, followingStage, nextHint, nextStep } from "./guidance.js";
import { implementToolLine, resolveImplementTools } from "./implement-tools.js";
import { adoptRun, formatRunList, listRunStates, openRun, startIterate } from "./offline.js";
import { STAGE_DEFS } from "./phases.js";
import { executeStage } from "./runner.js";
import type { WorkflowEngine } from "./runner.js";
import { createRun, inIterateLoop, nextStage, runDir, writeState } from "./state.js";
import type { IterateStage, RunState } from "./state.js";

export interface FeatureDevArgs {
  action: string;
  runId?: string;
  featureSummary?: string;
  workspaceRoot?: string;
  risks?: string[];
  adversarialDesign?: boolean;
  adversarialCode?: boolean;
  reason?: string;
  /** Present only on start. `false` leaves implement unrestricted. */
  implementTools?: string[] | false;
  /** Scope of an `iterate` increment. `reason` is used when this is omitted. */
  scope?: string;
}

export interface FeatureDevDefaults {
  /** Resolved plugin default. `null` means new runs stay unrestricted. */
  implementTools: string[] | null;
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
    `implementTools: ${implementToolLine(state.implementTools)}`,
    `next: ${step.code}`,
    `sidebarAdvance: ${step.code === "leave_gate" ? "leave-gate-only" : "no"}`,
    `hint: ${nextHint(state, step, context)}`,
  ];
  if (step.code === "execute_in_chat" || step.code === "retry_in_chat") {
    lines.push(`chat: ${chatAdvanceCall(state).text}`);
  }
  if ((state.iterate ?? 0) > 0) {
    lines.push(`iterate: ${state.iterate}`);
    lines.push(`iterateStage: ${state.iterateStage ?? state.current}`);
  }
  const platform = platformAttention(runDir(state.workspaceRoot, state.runId));
  if (platform) lines.push(`platform: ${formatPlatformNote(platform)}`);
  const expected = expectedArtifact(state);
  if (expected) lines.push(`artifact: ${expected.relativePath}`);
  lines.push("expected:");
  lines.push(...formatArtifactChecklist(listExpectedArtifacts(state)));
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

function syncIterateStage(state: RunState, stage: string): void {
  if ((state.iterate ?? 0) < 1) return;
  if (stage === "implement" || stage === "verify" || stage === "human_diff" || stage === "done") {
    state.iterateStage = stage;
  }
}

function moveTo(state: RunState, nxt: string): void {
  state.current = nxt;
  syncIterateStage(state, nxt);
  const nxtDef = STAGE_DEFS.find((s) => s.id === nxt);
  state.statusByStage[nxt] = nxt === "done" ? "done" : "active";
  if (nxtDef?.humanGate && nxt !== "done") {
    state.statusByStage[nxt] = "active";
  }
}

function previousIterateStage(current: string): IterateStage {
  const loop: IterateStage[] = ["implement", "verify", "human_diff"];
  const index = loop.indexOf(current as IterateStage);
  if (index <= 0) return "implement";
  return loop[index - 1]!;
}

export async function runFeatureDev(
  engine: WorkflowEngine | undefined,
  args: FeatureDevArgs,
  agent: unknown,
  signal: AbortSignal | undefined,
  defaults: FeatureDevDefaults = { implementTools: null },
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
      implementTools: args.implementTools === undefined
        ? defaults.implementTools
        : args.implementTools === false
          ? null
          : resolveImplementTools(args.implementTools),
    });
    return reply(`Started feature-dev run.\n${summarize(state, caller)}`, state, "started", true);
  }
  if (args.action === "list") {
    const runs = listRunStates(workspaceRoot);
    return reply(formatRunList(runs), null, "list", false);
  }
  if (!args.runId?.trim()) {
    throw new FeatureDevError("runId is required", { code: "run_id_required", status: 400 });
  }
  const runId = args.runId.trim();
  if (args.action === "adopt") {
    const adopted = adoptRun(workspaceRoot, runId, args.featureSummary);
    const lead = adopted.created ? `Adopted ${adopted.state.runId}.` : `Already tracking ${adopted.state.runId}.`;
    return reply(`${lead}\n${summarize(adopted.state, caller)}`, adopted.state, adopted.created ? "adopted" : "already_tracking", adopted.created);
  }
  const state = openRun(workspaceRoot, runId);
  state.workspaceRoot = state.workspaceRoot || workspaceRoot;
  if (args.action === "iterate") {
    const scope = args.scope?.trim() || args.reason?.trim() || "";
    const next = startIterate(state, scope);
    return reply(
      `Started iterate ${next.iterate}. Reuse the existing requirements and design. Loop: implement → verify → human_diff.\n${summarize(next, caller)}`,
      next,
      "iterated",
      true,
    );
  }
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
    const nxt = followingStage(state);
    const follow = !nxt || nxt === "done"
      ? "That next advance only leaves the gate and marks the run done; it does not execute another stage."
      : `That next advance only leaves the gate and makes ${nxt} active; it does not execute ${nxt}. When ${nxt} is active, call advance again in chat to execute ${nxt}.`;
    return reply(
      `Approved ${cur}. Call advance to continue. ${follow}\n${summarize(state, caller)}`,
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
    const back = inIterateLoop(state)
      ? previousIterateStage(cur)
      : (state.stages.indexOf(cur) > 0 ? state.stages[state.stages.indexOf(cur) - 1]! : cur);
    state.statusByStage[cur] = "pending";
    state.statusByStage[back] = "active";
    state.current = back;
    syncIterateStage(state, back);
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
      if (!nxt || nxt === "done") {
        state.current = "done";
        state.statusByStage[cur] = "done";
        state.statusByStage.done = "done";
        syncIterateStage(state, "done");
        writeState(state);
        return reply(
          `Left approved gate ${cur} → done. This advance finished the pipeline. It did not execute another stage.\n${summarize(state, caller)}`,
          state,
          "left_gate",
          true,
        );
      }
      moveTo(state, nxt);
      state.notes.push(`left approved gate ${cur} → ${nxt}`);
      writeState(state);
      return reply(
        `Left approved gate ${cur} → ${nxt}. This advance did not execute ${nxt}. Call advance again in this chat to execute ${nxt}.\n${summarize(state, caller)}`,
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
        { code: "needs_session", status: 409, chatCall: chatAdvanceCall(state), state },
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
        chatCall: chatAdvanceCall(state),
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
      syncIterateStage(state, "done");
      writeState(state);
      return reply(`Stage ${cur} done → pipeline complete.\n${summarize(state, caller)}`, state, "executed", true);
    }
    moveTo(state, nxt);
    writeState(state);
    return reply(`Stage ${cur} done → ${nxt} is active.\n${summarize(state, caller)}`, state, "executed", true);
  }
  throw new FeatureDevError(`unknown action: ${args.action}`, { code: "unknown_action", status: 400 });
}
