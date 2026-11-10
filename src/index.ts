import { defineTool } from "@deepseek-ai/dsh-tools";
import { runFeatureDev } from "./actions.js";
import type { FeatureDevArgs } from "./actions.js";
import { resolveImplementTools } from "./implement-tools.js";
import { makeFeatureDevRoutes } from "./routes.js";
import type { WorkflowEngine } from "./runner.js";
import { createFeatureApi, resolveRoot } from "./service.js";

export const name = "feature-dev-suite";

export const inject = ["tools", "workflowEngine"];

const RISK_VALUES = [
  "new_subsystem",
  "cross_module",
  "security_or_data",
  "irreversible_migration",
  "small_local_change",
];

interface WebServer {
  register(route: { kind: "prefix"; path: string; handler: Function }): () => void;
}

interface HostContext {
  tools: { register(tool: unknown): void };
  workflowEngine?: WorkflowEngine;
  webServer?: WebServer;
  provide?(name: string, value: unknown): unknown;
  inject?(deps: string[], plugin: (ctx: HostContext) => (() => void) | void): unknown;
}

export function apply(ctx: HostContext, config?: { root?: string; implementTools?: unknown }): void {
  // The panel shares disk state with the tool. It is not given a session agent:
  // workflowEngine.start requires the live parent from a chat turn (cwd, lineage,
  // and child attribution). Leaving an approved gate does not start a workflow.
  // workflow agent() also cannot carry a toolFilter, so implementTools is a
  // prompt contract snapshotted onto the run, not a runtime restrict().
  const implementTools = resolveImplementTools(config?.implementTools);
  const api = createFeatureApi({
    root: resolveRoot(config),
    engine: ctx.workflowEngine,
    implementTools,
  });
  ctx.provide?.("featureDev", api);
  ctx.inject?.(["webServer"], (scoped) => {
    const server = scoped.webServer;
    if (!server) return;
    const disposers = makeFeatureDevRoutes(api).map((route) => server.register(route));
    return () => {
      for (const dispose of disposers) dispose();
    };
  });

  ctx.tools.register(defineTool<FeatureDevArgs, string>({
    name: "feature_dev",
    description: "Orchestrate a gated feature-development pipeline. The sidebar and this tool share .feature-dev/<runId>/. start, approve, and reject only update that state. advance executes the current stage through workflowEngine and requires this chat's agent — the sidebar cannot, because it has no session. After a human gate is approved, the next advance only leaves the gate and does not execute the following stage; call advance again once that stage is active. status reports next, sidebarAdvance, hint, chat, artifact, implementTools, and an expected: checklist of present, placeholder, and missing files. New runs snapshot an implement tool allowlist into the implement prompt (config implementTools, or false to opt out). The workflow engine cannot enforce that list. Stages: requirements → design → design_review (human approve) → testcases → optional adversarial reviews → implement → verify → human_diff (human approve).",
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: ["start", "status", "advance", "approve", "reject"],
        description: "Pipeline action",
      },
      runId: {
        type: "string",
        description: "Existing run id from the sidebar or an earlier start (required except for start)",
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
      implementTools: {
        type: "array",
        items: { type: "string" },
        description: "Tool names the implement stage may use. Omit for the plugin default (read, write, edit, apply_patch, grep, glob, bash, todo_write). The workflow engine cannot enforce the list; it is written into the implement prompt. Plugin config implementTools: false opts out.",
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
      const result = await runFeatureDev(ctx.workflowEngine, args, exec.agent, exec.signal, { implementTools });
      return result.text;
    },
  }));
}
