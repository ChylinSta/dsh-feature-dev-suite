/**
 * Filenames a run is expected to hold. The sidebar and feature_dev status
 * share this list. It does not advance the run.
 *
 * `00-brief.md` is written at start. Each stage in the run has one primary
 * markdown file. `human_diff` also expects `06-full.diff`. Optional adversarial
 * files appear only when that stage is on this run.
 */

import fs from "node:fs";
import path from "node:path";
import { STAGE_DEFS } from "./phases.js";
import { runDir } from "./state.js";
import type { RunState } from "./state.js";

export interface ExpectedArtifact {
  stageId: string | null;
  file: string;
  relativePath: string;
  present: boolean;
  placeholder: boolean;
}

interface Spec {
  file: string;
  stageId: string | null;
}

const BRIEF: Spec = { file: "00-brief.md", stageId: null };
const DIFF: Spec = { file: "06-full.diff", stageId: "human_diff" };

const STAGE_FILE = new Map(
  STAGE_DEFS.flatMap((stage) => stage.artifact ? [[stage.id, stage.artifact] as const] : []),
);

const FILE_STAGE = new Map<string, string | null>([
  [BRIEF.file, BRIEF.stageId],
  [DIFF.file, DIFF.stageId],
  ...STAGE_DEFS.flatMap((stage) => stage.artifact ? [[stage.artifact, stage.id] as [string, string]] : []),
]);

export function stageIdForArtifact(file: string): string | null {
  return FILE_STAGE.get(file) ?? null;
}

export function expectedArtifactSpecs(state: RunState): Spec[] {
  const specs: Spec[] = [BRIEF];
  for (const id of state.stages) {
    const file = STAGE_FILE.get(id);
    if (file) specs.push({ file, stageId: id });
    if (id === "human_diff") specs.push(DIFF);
  }
  return specs;
}

function isPlaceholder(file: string): boolean {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(512);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.toString("utf8", 0, read).includes("(skeleton placeholder)");
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function listExpectedArtifacts(state: RunState): ExpectedArtifact[] {
  const dir = runDir(state.workspaceRoot, state.runId);
  let names = new Set<string>();
  try {
    names = new Set(fs.readdirSync(dir));
  } catch {
    names = new Set();
  }
  return expectedArtifactSpecs(state).map((spec) => {
    const present = names.has(spec.file);
    return {
      stageId: spec.stageId,
      file: spec.file,
      relativePath: `.feature-dev/${state.runId}/${spec.file}`,
      present,
      placeholder: present && isPlaceholder(path.join(dir, spec.file)),
    };
  });
}

export function formatArtifactChecklist(items: readonly ExpectedArtifact[]): string[] {
  return items.map((item) => {
    const mark = !item.present ? "missing" : item.placeholder ? "placeholder" : "present";
    const stage = item.stageId ?? "brief";
    return `- ${item.file} ${stage} ${mark}`;
  });
}
