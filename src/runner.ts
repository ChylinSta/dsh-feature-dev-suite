import fs from "node:fs";
import path from "node:path";
import { STAGE_DEFS, shouldRunDeepDesign } from "./phases.js";
import { buildStageScript } from "./scripts.js";
import { runDir } from "./state.js";
import type { RunState } from "./state.js";

interface StageValue {
  artifact?: unknown;
  diff?: unknown;
}

interface WorkflowRunResult {
  stopReason: string;
  error?: string;
  value: string | StageValue | null | undefined;
  agentsStarted: number;
}

interface WorkflowRun {
  result: Promise<WorkflowRunResult>;
  dispose: () => Promise<void>;
}

export interface WorkflowEngine {
  start(opts: {
    script: string;
    meta: {
      name: string;
      description: string;
      phases: { title: string; detail?: string }[];
    };
    parent: unknown;
    signal?: AbortSignal;
  }): WorkflowRun;
}

export interface StageExecResult {
  ok: boolean;
  detail: string;
  artifactPath?: string;
}

function readOptional(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function artifactPath(state: RunState, stage: string): string | null {
  const def = STAGE_DEFS.find((s) => s.id === stage);
  if (!def?.artifact) return null;
  return path.join(runDir(state.workspaceRoot, state.runId), def.artifact);
}

export async function executeStage(
  ctx: { workflowEngine?: WorkflowEngine },
  state: RunState,
  stage: string,
  parent: unknown,
  signal: AbortSignal | undefined,
): Promise<StageExecResult> {
  if (stage === "done") {
    return { ok: true, detail: "already done" };
  }
  const dir = runDir(state.workspaceRoot, state.runId);
  const built = buildStageScript(stage, {
    featureSummary: state.featureSummary,
    brief: readOptional(path.join(dir, "00-brief.md")),
    requirements: readOptional(path.join(dir, "01-requirements.md")),
    design: readOptional(path.join(dir, "02-design.md")),
    testcases: readOptional(path.join(dir, "03-testcases.md")),
    implNotes: readOptional(path.join(dir, "04-impl-notes.md")),
    deep: stage === "design_review" ? shouldRunDeepDesign(state.risks, state.adversarialDesign) : state.adversarialDesign || state.adversarialCode,
  });
  if (!built) {
    return { ok: false, detail: `no executor for stage ${stage}` };
  }
  if (!ctx.workflowEngine) {
    return { ok: false, detail: "workflowEngine unavailable — load a workflow engine bundle (e.g. web profile)" };
  }
  const run = ctx.workflowEngine.start({
    script: built.script,
    meta: built.meta,
    parent,
    signal,
  });
  try {
    const result = await run.result;
    if (result.stopReason !== "completed") {
      return {
        ok: false,
        detail: `workflow ${built.meta.name} ${result.stopReason}: ${result.error ?? "unknown"}`,
      };
    }
    const value = result.value;
    let artifact = "";
    let diff: unknown;
    if (typeof value === "string") {
      artifact = value;
    } else if (value && typeof value === "object") {
      artifact = typeof value.artifact === "string" ? value.artifact : JSON.stringify(value, null, 2);
      diff = value.diff;
    } else {
      artifact = "_(empty stage result)_";
    }
    const out = artifactPath(state, stage);
    if (out) {
      fs.writeFileSync(out, artifact.endsWith("\n") ? artifact : `${artifact}\n`, "utf8");
    }
    if (stage === "human_diff") {
      const diffPath = path.join(dir, "06-full.diff");
      if (typeof diff === "string" && diff.trim()) {
        fs.writeFileSync(diffPath, diff.endsWith("\n") ? diff : `${diff}\n`, "utf8");
      } else if (!fs.existsSync(diffPath)) {
        try {
          const { execFileSync } = await import("node:child_process");
          const gitDiff = execFileSync("git", ["diff"], {
            cwd: state.workspaceRoot,
            encoding: "utf8",
            maxBuffer: 20 * 1024 * 1024,
          });
          const gitStaged = execFileSync("git", ["diff", "--cached"], {
            cwd: state.workspaceRoot,
            encoding: "utf8",
            maxBuffer: 20 * 1024 * 1024,
          });
          const combined = [gitDiff, gitStaged].filter((s) => s.trim()).join("\n");
          fs.writeFileSync(diffPath, combined || "No local git diff output.\n", "utf8");
        } catch (error) {
          fs.writeFileSync(diffPath, `Failed to collect git diff: ${String(error)}\n`, "utf8");
        }
      }
    }
    return {
      ok: true,
      detail: `stage ${stage} completed (agentsStarted=${result.agentsStarted})`,
      ...(out ? { artifactPath: out } : {}),
    };
  } finally {
    await run.dispose();
  }
}
