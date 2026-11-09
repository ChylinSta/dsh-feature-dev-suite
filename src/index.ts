import { defineTool } from "@deepseek-ai/dsh-tools";
import { runFeatureDev } from "./actions.js";
import type { FeatureDevArgs } from "./actions.js";
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

export function apply(ctx: HostContext, config?: { root?: string }): void {
  const api = createFeatureApi({
    root: resolveRoot(config),
    engine: ctx.workflowEngine,
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
      const result = await runFeatureDev(ctx.workflowEngine, args, exec.agent, exec.signal);
      return result.text;
    },
  }));
}
