import { defineTool } from "@deepseek-ai/dsh-tools";
import { STAGE_DEFS } from "./phases.js";
import { executeStage } from "./runner.js";
import type { WorkflowEngine } from "./runner.js";
import { createRun, nextStage, readState, runDir, writeState } from "./state.js";
import type { RunState } from "./state.js";

export const name = "feature-dev-suite";

export const inject = ["tools", "workflowEngine"];

const RISK_VALUES = [
  "new_subsystem",
  "cross_module",
  "security_or_data",
  "irreversible_migration",
  "small_local_change",
];

interface FeatureDevArgs {
  action: string;
  runId?: string;
  featureSummary?: string;
  workspaceRoot?: string;
  risks?: string[];
  adversarialDesign?: boolean;
  adversarialCode?: boolean;
  reason?: string;
}

interface HostContext {
  tools: { register(tool: unknown): void };
  workflowEngine?: WorkflowEngine;
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

export function apply(ctx: HostContext): void {
  ctx.tools.register(defineTool<FeatureDevArgs, string>({
    name: "feature_dev",
    description: "Orchestrate a gated feature-development pipeline with real stage execution via workflowEngine. Stages: requirements → design → design_review (mandatory discussion + human approve) → testcases → optional adversarial reviews → implement → verify → human_diff. Actions: start, status, advance (execute current stage), approve, reject.",
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: ["start", "status", "advance", "approve", "reject"],
        description: "Pipeline action",
      },
      runId: {
        type: "string",
        description: "Existing run id (required except for start)",
      },
      featureSummary: {
        type: "string",
        description: "Short feature description for start",
      },
      workspaceRoot: {
        type: "string",
        description: "Workspace root that will hold .feature-dev/ (defaults to process.cwd())",
      },
      risks: {
        type: "array",
        items: { type: "string", enum: [...RISK_VALUES] },
        description: "Risk tags that unlock deep adversarial stages",
      },
      adversarialDesign: {
        type: "boolean",
        description: "Force deep adversarial design review",
      },
      adversarialCode: {
        type: "boolean",
        description: "Force deep adversarial code review",
      },
      reason: {
        type: "string",
        description: "Reason for approve/reject",
      },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args, exec) {
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
        return `Started feature-dev run.\n${summarize(state)}`;
      }
      if (!args.runId?.trim()) throw new Error("runId is required");
      const state = readState(workspaceRoot, args.runId.trim());
      state.workspaceRoot = state.workspaceRoot || workspaceRoot;
      if (args.action === "status") {
        return summarize(state);
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
        return `Approved ${cur}. Call advance to continue.\n${summarize(state)}`;
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
        return `Rejected ${cur}, returned to ${back}.\n${summarize(state)}`;
      }
      if (args.action === "advance") {
        const cur = state.current;
        if (cur === "done") {
          return `Already done.\n${summarize(state)}`;
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
            return `Left approved gate ${cur} → done.\n${summarize(state)}`;
          }
          moveTo(state, nxt);
          state.notes.push(`left approved gate ${cur} → ${nxt}`);
          writeState(state);
          return `Left approved gate ${cur} → ${nxt}.\n${summarize(state)}`;
        }
        if (def?.humanGate && status === "blocked") {
          return `Cannot advance: ${cur} is waiting for human approve/reject.\n${summarize(state)}`;
        }
        const parent = exec.agent;
        if (!parent) {
          throw new Error("feature_dev advance requires a calling agent (exec.agent was undefined)");
        }
        state.notes.push(`executing stage ${cur}`);
        writeState(state);
        const result = await executeStage(ctx, state, cur, parent, exec.signal);
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
          return `Stage ${cur} executed; human gate is now blocked pending approve/reject.\n${summarize(state)}`;
        }
        state.statusByStage[cur] = "done";
        const nxt = nextStage(state);
        if (!nxt) {
          state.current = "done";
          state.statusByStage.done = "done";
          writeState(state);
          return `Stage ${cur} done → pipeline complete.\n${summarize(state)}`;
        }
        moveTo(state, nxt);
        writeState(state);
        return `Stage ${cur} done → ${nxt} is active.\n${summarize(state)}`;
      }
      throw new Error(`unknown action: ${args.action}`);
    },
  }));
}
