/**
 * Filenames a run is expected to hold. The sidebar and feature_dev status
 * share this list. It does not advance the run.
 *
 * `00-brief.md` is written at start. Each stage in the run has one primary
 * markdown file. `human_diff` also expects `06-full.diff`. Optional adversarial
 * files appear only when that stage is on this run.
 *
 * Unprefixed names (`requirements.md`, `human_diff.md`, …) count as the
 * numbered file. When both exist, the numbered name is the one the checklist
 * reports. `iterate-N.md` is listed only when that file is already on disk.
 */

import fs from "node:fs";
import path from "node:path";
import {
  ARTIFACT_ALIASES,
  canonicalForAlias,
  isRecognizableArtifact,
  iterateNumberFromName,
  listIterateNumbers,
  preferredName,
} from "./files.js";
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

export interface LocatedArtifact {
  file: string;
  present: boolean;
  placeholder: boolean;
  text: string;
}

/** Visible, non-blocking note. An empty `unconfirmed` list means no note. */
export interface PlatformAttention {
  verified: string[];
  unconfirmed: string[];
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

for (const [canonical, aliases] of Object.entries(ARTIFACT_ALIASES)) {
  const stageId = FILE_STAGE.get(canonical);
  if (stageId === undefined) continue;
  for (const alias of aliases) FILE_STAGE.set(alias, stageId);
}

export function stageIdForArtifact(file: string): string | null {
  if (iterateNumberFromName(file) !== null) return "iterate";
  if (FILE_STAGE.has(file)) return FILE_STAGE.get(file) ?? null;
  const canonical = canonicalForAlias(file);
  if (!canonical) return null;
  return FILE_STAGE.get(canonical) ?? null;
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

export function isPlaceholder(file: string): boolean {
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

export function listDirNames(dir: string): Set<string> {
  try {
    return new Set(fs.readdirSync(dir));
  } catch {
    return new Set();
  }
}

export function directoryHasRecognizableArtifacts(dir: string): boolean {
  for (const name of listDirNames(dir)) {
    if (isRecognizableArtifact(name)) return true;
  }
  return false;
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export function locateArtifact(dir: string, names: ReadonlySet<string>, canonical: string): LocatedArtifact {
  const chosen = preferredName(names, canonical);
  if (!names.has(chosen)) {
    return { file: canonical, present: false, placeholder: false, text: "" };
  }
  const full = path.join(dir, chosen);
  return {
    file: chosen,
    present: true,
    placeholder: isPlaceholder(full),
    text: readText(full),
  };
}

export function readArtifactText(dir: string, canonical: string): string {
  const names = listDirNames(dir);
  const located = locateArtifact(dir, names, canonical);
  return located.present ? located.text : "";
}

export function listExpectedArtifacts(state: RunState): ExpectedArtifact[] {
  const dir = runDir(state.workspaceRoot, state.runId);
  const names = listDirNames(dir);
  const items = expectedArtifactSpecs(state).map((spec) => {
    const located = locateArtifact(dir, names, spec.file);
    return {
      stageId: spec.stageId,
      file: located.file,
      relativePath: `.feature-dev/${state.runId}/${located.file}`,
      present: located.present,
      placeholder: located.present && located.placeholder,
    };
  });
  for (const n of listIterateNumbers(names)) {
    const file = `iterate-${n}.md`;
    const full = path.join(dir, file);
    const present = names.has(file);
    items.push({
      stageId: "iterate",
      file,
      relativePath: `.feature-dev/${state.runId}/${file}`,
      present,
      placeholder: present && isPlaceholder(full),
    });
  }
  return items;
}

export function formatArtifactChecklist(items: readonly ExpectedArtifact[]): string[] {
  return items.map((item) => {
    const mark = !item.present ? "missing" : item.placeholder ? "placeholder" : "present";
    const stage = item.stageId ?? "brief";
    return `- ${item.file} ${stage} ${mark}`;
  });
}

const PLATFORM_LINE = /^[ \t]*platform:\s*([a-z][a-z0-9 ._+-]{0,40}?)\s+(verified|passed|unconfirmed|pending|not verified|failed)\s*$/gim;

function stripFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

function normalizePlatform(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (key === "linux") return "Linux";
  if (key === "windows" || key === "win32" || key === "win") return "Windows";
  if (key === "mac" || key === "macos" || key === "darwin" || key === "osx") return "macOS";
  return raw.trim();
}

function platformStatus(raw: string): "verified" | "unconfirmed" {
  const key = raw.toLowerCase();
  if (key === "verified" || key === "passed") return "verified";
  return "unconfirmed";
}

/**
 * Linux-only evidence with an explicit "Windows was not run" sentence.
 * Used when the verify write-up predates the `platform:` lines.
 */
function heuristicPlatform(blob: string): PlatformAttention | null {
  const linuxVerified = /command host:\s*linux\b/i.test(blob)
    || /\bon linux\b/i.test(blob)
    || /\blinux\b[^\n]{0,48}\b(verified|pass(?:ed)?)\b/i.test(blob)
    || /\b(verified|tested|browser)\b[^\n]{0,48}\blinux\b/i.test(blob);
  const windowsUnconfirmed = /\bwindows\b[^\n]{0,140}\b(not (?:been )?(?:verified|executed|tested)|untested|unconfirmed|was not)\b/i.test(blob)
    || /\b(not (?:been )?(?:verified|executed|tested)|untested|unconfirmed)\b[^\n]{0,140}\bwindows\b/i.test(blob);
  const windowsVerified = /\bwindows\b[^\n]{0,80}\b(verified|passed)\b/i.test(blob)
    || /\b(verified|passed) on windows\b/i.test(blob);
  if (!linuxVerified || !windowsUnconfirmed || windowsVerified) return null;
  return { verified: ["Linux"], unconfirmed: ["Windows"] };
}

export function platformAttention(dir: string): PlatformAttention | null {
  const names = listDirNames(dir);
  const files: string[] = [];
  for (const canonical of ["05-verify.md", "06-summary.md"]) {
    const chosen = preferredName(names, canonical);
    if (names.has(chosen)) files.push(chosen);
  }
  for (const n of listIterateNumbers(names)) files.push(`iterate-${n}.md`);
  if (files.length === 0) return null;
  const stripped = files.map((name) => stripFences(readText(path.join(dir, name))));
  const records = new Map<string, "verified" | "unconfirmed">();
  let explicit = false;
  for (const text of stripped) {
    for (const match of text.matchAll(PLATFORM_LINE)) {
      explicit = true;
      const name = normalizePlatform(match[1] ?? "");
      if (!name) continue;
      records.set(name, platformStatus(match[2] ?? ""));
    }
  }
  if (explicit) {
    const unconfirmed = [...records.entries()].filter(([, status]) => status === "unconfirmed").map(([name]) => name);
    if (unconfirmed.length === 0) return null;
    const verified = [...records.entries()].filter(([, status]) => status === "verified").map(([name]) => name);
    return { verified, unconfirmed };
  }
  return heuristicPlatform(stripped.join("\n"));
}

export function formatPlatformNote(attention: PlatformAttention): string {
  const verified = attention.verified.length > 0 ? attention.verified.join(", ") : "none";
  return `pending platform confirmation: ${verified} verified; ${attention.unconfirmed.join(", ")} unconfirmed. This does not block the run.`;
}
