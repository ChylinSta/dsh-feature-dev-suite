/**
 * Canonical stage filenames and the unprefixed names FolderDiff wrote.
 * `fd-<slug>` stays the recommended directory name. These aliases are how a
 * directory like `folder-diff-v1` still satisfies the checklist.
 */

export const ARTIFACT_ALIASES: Record<string, readonly string[]> = {
  "01-requirements.md": ["requirements.md"],
  "02-design.md": ["design.md"],
  "02-design-review.md": ["design_review.md", "design-review.md"],
  "03-testcases.md": ["testcases.md"],
  "04-impl-notes.md": ["impl-notes.md", "impl_notes.md", "implement.md", "implement_notes.md", "implement-notes.md"],
  "05-verify.md": ["verify.md"],
  "06-summary.md": ["human_diff.md", "human-diff.md"],
};

export const CANONICAL_ARTIFACTS = [
  "00-brief.md",
  "01-requirements.md",
  "02-design.md",
  "02-design-review.md",
  "03-testcases.md",
  "03b-adversarial-design.md",
  "04-impl-notes.md",
  "04b-adversarial-code.md",
  "05-verify.md",
  "06-summary.md",
  "06-full.diff",
] as const;

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(ARTIFACT_ALIASES)) {
  for (const alias of aliases) ALIAS_TO_CANONICAL.set(alias, canonical);
}

export function aliasesFor(canonical: string): readonly string[] {
  return ARTIFACT_ALIASES[canonical] ?? [];
}

export function canonicalForAlias(file: string): string | null {
  return ALIAS_TO_CANONICAL.get(file) ?? null;
}

/** `iterate-1.md` → 1. Other names, including `iterate-0.md`, return null. */
export function iterateNumberFromName(name: string): number | null {
  const match = /^iterate-(\d+)\.md$/.exec(name);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function isRecognizableArtifact(name: string): boolean {
  if ((CANONICAL_ARTIFACTS as readonly string[]).includes(name)) return true;
  if (iterateNumberFromName(name) !== null) return true;
  return ALIAS_TO_CANONICAL.has(name);
}

/** Numbered filename when it is on disk, otherwise the first alias that is. */
export function preferredName(present: ReadonlySet<string>, canonical: string): string {
  if (present.has(canonical)) return canonical;
  for (const alias of aliasesFor(canonical)) {
    if (present.has(alias)) return alias;
  }
  return canonical;
}

export function listIterateNumbers(names: Iterable<string>): number[] {
  const nums: number[] = [];
  for (const name of names) {
    const n = iterateNumberFromName(name);
    if (n !== null) nums.push(n);
  }
  nums.sort((a, b) => a - b);
  return nums;
}

/** Smallest positive integer that is not already an `iterate-N.md`. */
export function nextIterateNumber(nums: readonly number[]): number {
  const used = new Set(nums);
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}
