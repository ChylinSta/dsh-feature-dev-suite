/**
 * Discover, adopt, and continue runs that were written as files.
 * FolderDiff kept `.feature-dev/folder-diff-v1/` with unprefixed stage names
 * and `iterate-1.md` … `iterate-3.md`, and no `state.json`.
 */

import fs from "node:fs";
import path from "node:path";
import {
  directoryHasRecognizableArtifacts,
  listDirNames,
  locateArtifact,
} from "./artifacts.js";
import type { LocatedArtifact } from "./artifacts.js";
import { FeatureDevError } from "./errors.js";
import { listIterateNumbers, nextIterateNumber } from "./files.js";
import { STAGE_DEFS, buildStageOrder } from "./phases.js";
import { readState, runDir, writeState } from "./state.js";
import type { IterateStage, RunState } from "./state.js";

const RUN_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const LOOP: IterateStage[] = ["implement", "verify", "human_diff", "done"];

export function assertRunId(runId: string): void {
  if (!RUN_SLUG.test(runId)) {
    throw new FeatureDevError(
      "runId must be a lowercase slug such as folder-diff-v1 or fd-folder-diff-v1.",
      { code: "run_id_invalid", status: 400 },
    );
  }
}

function isReal(item: LocatedArtifact | undefined): item is LocatedArtifact {
  return Boolean(item && item.present && !item.placeholder && item.text.trim());
}

function isWaiver(text: string): boolean {
  return /\bwaiv(?:e|ed|er|ing)\b/i.test(text) || /豁免/.test(text);
}

export function iterateLooksComplete(text: string): boolean {
  if (text.includes("(skeleton placeholder)")) return false;
  if (/_Status:\s*in progress_/i.test(text)) return false;
  if (text.trim().length < 40) return false;
  if (/_Status:\s*done_/i.test(text)) return true;
  const changed = /^#{1,3}\s*(changed|fixed|changes)\b/im.test(text);
  const tested = /^#{1,3}\s*(tested|tests|verify|verified)\b/im.test(text);
  return changed && tested;
}

export function inferIterateStage(text: string): IterateStage {
  if (iterateLooksComplete(text)) return "done";
  const marked = text.match(/_Iterate stage:\s*(implement|verify|human_diff|done)_/i);
  if (marked) {
    const stage = marked[1]!.toLowerCase();
    if (stage === "implement" || stage === "verify" || stage === "human_diff" || stage === "done") return stage;
  }
  if (text.includes("(skeleton placeholder)")) return "implement";
  const tested = /^#{1,3}\s*(tested|tests|verify|verified)\b/im.test(text);
  const changed = /^#{1,3}\s*(changed|fixed|changes|scope)\b/im.test(text);
  if (tested) return "human_diff";
  if (changed) return "verify";
  return "implement";
}

function stamp(dir: string): string {
  try {
    return fs.statSync(dir).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function inferSummary(dir: string, names: Set<string>, runId: string): string {
  const requirements = locateArtifact(dir, names, "01-requirements.md");
  const brief = locateArtifact(dir, names, "00-brief.md");
  const source = isReal(requirements) ? requirements.text : brief.text;
  const heading = source.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return heading[1].trim().slice(0, 240);
  const line = source.split("\n").map((item) => item.trim()).find((item) => item.length > 0 && !item.startsWith("_"));
  return (line || runId).slice(0, 240);
}

function hasRealLater(stages: readonly string[], located: Map<string, LocatedArtifact>, id: string): boolean {
  const index = stages.indexOf(id);
  for (const later of stages.slice(index + 1)) {
    if (later === "done") continue;
    if (isReal(located.get(later))) return true;
  }
  return false;
}

function applyIterate(state: RunState, dir: string, names: Set<string>, nums: number[]): void {
  if (nums.length === 0) return;
  const latest = nums[nums.length - 1]!;
  const text = fs.readFileSync(path.join(dir, `iterate-${latest}.md`), "utf8");
  const stage = inferIterateStage(text);
  state.iterate = latest;
  state.iterateStage = stage;
  if (stage === "done") {
    state.current = "done";
    for (const id of state.stages) state.statusByStage[id] = "done";
    state.notes.push(`iterate ${latest} write-up complete`);
    return;
  }
  const open = LOOP.filter((id) => id !== "done");
  const at = open.indexOf(stage);
  for (const id of open) {
    if (!state.stages.includes(id)) continue;
    const index = open.indexOf(id);
    if (at < 0 || index < at) state.statusByStage[id] = "done";
    else if (index === at) state.statusByStage[id] = "active";
    else state.statusByStage[id] = "pending";
  }
  state.statusByStage.done = "pending";
  state.current = stage;
  state.notes.push(`iterate ${latest} in progress at ${stage}`);
}

/** Build a run from the files in the directory. Does not write `state.json`. */
export function inferRun(workspaceRoot: string, runId: string): RunState | null {
  const dir = runDir(workspaceRoot, runId);
  if (!directoryHasRecognizableArtifacts(dir)) return null;
  const names = listDirNames(dir);
  const advDesign = isReal(locateArtifact(dir, names, "03b-adversarial-design.md"));
  const advCode = isReal(locateArtifact(dir, names, "04b-adversarial-code.md"));
  const stages = buildStageOrder({ risks: [], adversarialDesign: advDesign, adversarialCode: advCode });
  const located = new Map<string, LocatedArtifact>();
  for (const stage of STAGE_DEFS) {
    if (!stage.artifact || !stages.includes(stage.id)) continue;
    located.set(stage.id, locateArtifact(dir, names, stage.artifact));
  }
  const statusByStage: Record<string, string> = {};
  for (const id of stages) statusByStage[id] = "pending";
  const notes: string[] = [];
  const review = located.get("design_review");
  if (isReal(review) && isWaiver(review.text)) notes.push("design_review waived in writing");
  const iterateNums = listIterateNumbers(names);
  let current = "requirements";

  if (iterateNums.length > 0) {
    for (const id of stages) statusByStage[id] = "done";
    current = "done";
  } else {
    let finished = true;
    for (const id of stages) {
      if (id === "done") continue;
      const item = located.get(id);
      const later = hasRealLater(stages, located, id);
      if (id === "design_review") {
        if ((isReal(item) && isWaiver(item.text)) || (isReal(item) && later) || later) {
          statusByStage[id] = "done";
          continue;
        }
        if (isReal(item)) {
          statusByStage[id] = "blocked";
          current = id;
          finished = false;
          break;
        }
        statusByStage[id] = "active";
        current = id;
        finished = false;
        break;
      }
      if (id === "human_diff") {
        if (isReal(item) && /\b(approved|status:\s*done)\b/i.test(item.text)) {
          statusByStage[id] = "done";
          continue;
        }
        if (isReal(item)) {
          statusByStage[id] = "blocked";
          current = id;
          finished = false;
          break;
        }
        statusByStage[id] = "active";
        current = id;
        finished = false;
        break;
      }
      if (isReal(item) || later) {
        statusByStage[id] = "done";
        continue;
      }
      statusByStage[id] = "active";
      current = id;
      finished = false;
      break;
    }
    if (finished) {
      current = "done";
      for (const id of stages) statusByStage[id] = "done";
    }
  }

  const when = stamp(dir);
  const state: RunState = {
    runId,
    createdAt: when,
    updatedAt: when,
    featureSummary: inferSummary(dir, names, runId),
    risks: [],
    adversarialDesign: advDesign,
    adversarialCode: advCode,
    maxCodeReviewRounds: 2,
    stages,
    statusByStage,
    current,
    notes,
    workspaceRoot,
    implementTools: null,
  };
  applyIterate(state, dir, names, iterateNums);
  return state;
}

function sortRuns(runs: RunState[]): RunState[] {
  runs.sort((a, b) => {
    const byTime = (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt);
    if (byTime !== 0) return byTime;
    return a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0;
  });
  return runs;
}

/**
 * Every readable run under `.feature-dev`, newest first.
 * `fd-<slug>` is still what `start` creates. A folder without that prefix is
 * included when it holds stage files or `iterate-N.md`. A missing or unreadable
 * `state.json` is inferred and not written.
 */
export function listRunStates(workspaceRoot: string): RunState[] {
  const home = path.join(workspaceRoot, ".feature-dev");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(home, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    if (code === "ENOTDIR") {
      throw new FeatureDevError("`.feature-dev` is not a directory, so runs cannot be listed.", {
        code: "runs_unreadable",
        status: 400,
      });
    }
    throw error;
  }
  const runs: RunState[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !RUN_SLUG.test(entry.name)) continue;
    const dir = path.join(home, entry.name);
    const stateFile = path.join(dir, "state.json");
    if (fs.existsSync(stateFile)) {
      try {
        runs.push(readState(workspaceRoot, entry.name));
        continue;
      } catch (error) {
        if (!(error instanceof FeatureDevError) || error.code !== "unreadable_run") continue;
      }
    }
    const inferred = inferRun(workspaceRoot, entry.name);
    if (inferred) runs.push(inferred);
  }
  return sortRuns(runs);
}

/** Read `state.json`, or infer it when the file is missing or unreadable. Does not write. */
export function openRun(workspaceRoot: string, runId: string): RunState {
  assertRunId(runId);
  const dir = runDir(workspaceRoot, runId);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(dir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return readState(workspaceRoot, runId);
    throw error;
  }
  if (!stat.isDirectory()) return readState(workspaceRoot, runId);
  const stateFile = path.join(dir, "state.json");
  if (fs.existsSync(stateFile)) {
    try {
      return readState(workspaceRoot, runId);
    } catch (error) {
      if (!(error instanceof FeatureDevError) || error.code !== "unreadable_run") throw error;
      const inferred = inferRun(workspaceRoot, runId);
      if (inferred) return inferred;
      throw error;
    }
  }
  const inferred = inferRun(workspaceRoot, runId);
  if (inferred) return inferred;
  return readState(workspaceRoot, runId);
}

export function adoptRun(workspaceRoot: string, runId: string, featureSummary?: string): { state: RunState; created: boolean } {
  assertRunId(runId);
  const dir = runDir(workspaceRoot, runId);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new FeatureDevError(`No feature-dev folder at .feature-dev/${runId}/.`, {
      code: "not_a_run",
      status: 404,
    });
  }
  const stateFile = path.join(dir, "state.json");
  if (fs.existsSync(stateFile)) {
    try {
      return { state: readState(workspaceRoot, runId), created: false };
    } catch (error) {
      if (!(error instanceof FeatureDevError) || error.code !== "unreadable_run") throw error;
    }
  }
  const inferred = inferRun(workspaceRoot, runId);
  if (!inferred) {
    throw new FeatureDevError(
      `.feature-dev/${runId}/ has no stage files to adopt. Expected names like requirements.md or 01-requirements.md.`,
      { code: "not_a_run", status: 404 },
    );
  }
  if (featureSummary?.trim()) inferred.featureSummary = featureSummary.trim();
  inferred.notes.push("adopted from artifacts");
  writeState(inferred);
  return { state: inferred, created: true };
}

export function iterateReady(state: RunState): boolean {
  if (state.current === "done" || state.iterateStage === "done") return true;
  return state.statusByStage.human_diff === "done";
}

const LEFTOVER_HEADING = /still rough|not verified|leftover|please look|rough edges|follow-up|unverified/i;

export function extractLeftovers(text: string): string[] {
  const bullets: string[] = [];
  let capture = false;
  for (const line of text.split("\n")) {
    const heading = /^#{1,3}\s+(.+)$/.exec(line.trim());
    if (heading) {
      capture = LEFTOVER_HEADING.test(heading[1] ?? "");
      continue;
    }
    if (!capture) continue;
    const bullet = /^[-*]\s+(.+)$/.exec(line.trim());
    if (bullet?.[1]) bullets.push(bullet[1].trim());
  }
  return bullets;
}

function readIf(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function previousLeftovers(dir: string, n: number, nums: readonly number[]): { label: string; bullets: string[] } {
  const prior = [...nums].filter((item) => item < n).sort((a, b) => b - a)[0];
  const sources: Array<{ label: string; file: string }> = [];
  if (prior !== undefined) sources.push({ label: `iterate-${prior}`, file: path.join(dir, `iterate-${prior}.md`) });
  const names = listDirNames(dir);
  const summary = locateArtifact(dir, names, "06-summary.md");
  if (summary.present) sources.push({ label: summary.file, file: path.join(dir, summary.file) });
  const verify = locateArtifact(dir, names, "05-verify.md");
  if (verify.present) sources.push({ label: verify.file, file: path.join(dir, verify.file) });
  const seen = new Set<string>();
  const bullets: string[] = [];
  let label = "the previous increment";
  for (const source of sources) {
    const found = extractLeftovers(readIf(source.file));
    if (found.length === 0) continue;
    if (bullets.length === 0) label = source.label;
    for (const item of found) {
      if (seen.has(item)) continue;
      seen.add(item);
      bullets.push(item);
      if (bullets.length >= 12) return { label, bullets };
    }
    if (prior !== undefined && source.label.startsWith("iterate-")) break;
  }
  return { label, bullets };
}

function iterateDocument(n: number, scope: string, leftovers: string[], previousLabel: string): string {
  const leftoverBlock = leftovers.length > 0
    ? leftovers.map((line) => `- ${line}`).join("\n")
    : "- (none recorded)";
  const scopeText = scope.trim() || "(fill in the scope of this increment)";
  return [
    `# Iterate ${n}`,
    "",
    "_Status: in progress_",
    "_Iterate stage: implement_",
    "",
    "(skeleton placeholder)",
    "",
    "## Scope",
    "",
    scopeText,
    "",
    `## Leftovers from ${previousLabel}`,
    "",
    leftoverBlock,
    "",
    "## Loop",
    "",
    "Reuse the existing requirements and design. Do not start a new requirements → design → design_review cycle.",
    "Stages for this increment: implement → verify → human_diff.",
    "",
    "## Platforms",
    "",
    "Record one line per target outside a code fence. `verified` or `passed` confirms it. `unconfirmed`, `pending`, or `not verified` stays visible and does not block the run.",
    "",
    "```text",
    "platform: linux verified",
    "platform: windows unconfirmed",
    "```",
    "",
  ].join("\n");
}

export function startIterate(state: RunState, scope: string): RunState {
  if (!iterateReady(state)) {
    throw new FeatureDevError(
      `Iterate starts after human_diff is finished (or the run is done). Current stage is ${state.current}.`,
      { code: "iterate_not_ready", status: 400, state },
    );
  }
  const dir = runDir(state.workspaceRoot, state.runId);
  const nums = listIterateNumbers(listDirNames(dir));
  const n = nextIterateNumber(nums);
  const file = path.join(dir, `iterate-${n}.md`);
  const previous = previousLeftovers(dir, n, nums);
  const body = iterateDocument(n, scope, previous.bullets, previous.label);
  try {
    fs.writeFileSync(file, body, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new FeatureDevError(`iterate-${n}.md already exists and was left unchanged.`, {
        code: "iterate_exists",
        status: 409,
        state,
      });
    }
    throw error;
  }
  state.iterate = n;
  state.iterateStage = "implement";
  state.current = "implement";
  state.statusByStage.implement = "active";
  if (state.stages.includes("verify")) state.statusByStage.verify = "pending";
  if (state.stages.includes("human_diff")) state.statusByStage.human_diff = "pending";
  state.statusByStage.done = "pending";
  state.notes.push(`iterate ${n}: implement → verify → human_diff`);
  writeState(state);
  return state;
}

export function formatRunList(runs: readonly RunState[]): string {
  if (runs.length === 0) return "(no runs)";
  return runs.map((state) => {
    const iterate = state.iterate ? `iterate=${state.iterate} iterateStage=${state.iterateStage ?? state.current}` : "iterate=none";
    return `- ${state.runId} current=${state.current} ${iterate}`;
  }).join("\n");
}
