# Offline feature-dev artifacts

Use this when a person or a cloud agent can write files but cannot call `feature_dev` advance. The sidebar never starts a workflow. It only reads this folder.

Prefer **Start** on the board (or `feature_dev` start). That writes `state.json`, `00-brief.md`, and a skeleton for the current stage. Then replace the skeletons by hand. The checklist below is the same sequence FolderDiff used.

## Folder name

```text
.feature-dev/fd-<slug>/
```

Example: `.feature-dev/fd-folder-diff-v1/`.

The board lists a directory only when the name matches `fd-` plus lowercase letters, digits, and hyphens, and `state.json` has the same `runId`. A folder named `folder-diff-v1` (no `fd-` prefix) is invisible to the panel. The files are still valid notes; they just do not show up as a run.

## Files

Plain run, no adversarial stages:

| Step | Stage | File | Write |
|---|---|---|---|
| 0 | brief | `00-brief.md` | One feature summary. Start creates this. |
| 1 | `requirements` | `01-requirements.md` | Goal, non-goals, constraints, acceptance criteria, open questions. |
| 2 | `design` | `02-design.md` | Summary, how it fits the repo, tech choices, boundaries, risks and rollback, implementation slices. |
| 3 | `design_review` | `02-design-review.md` | The discussion, or a waiver (who waived it and why). |
| 4 | `testcases` | `03-testcases.md` | Cases mapped to acceptance criteria, including boundaries and failures. |
| 5 | `implement` | `04-impl-notes.md` | Changes, commands run, remaining work. The code itself stays in the repo. |
| 6 | `verify` | `05-verify.md` | Commands, results, failures. Do not claim success without command output. |
| 7 | `human_diff` | `06-summary.md` | Intent, key changes, risks, test evidence, review checklist. |
| 7 | `human_diff` | `06-full.diff` | The full diff. This file is not created as a skeleton. |

`state.json` sits beside those files. High-risk runs also expect `03b-adversarial-design.md` and `04b-adversarial-code.md`. `feature_dev` status omits them when the run's stage list does not include those stages.

## Waiving design review

FolderDiff waived the discussion instead of running the dual review. Keep the file. A missing `02-design-review.md` is reported as missing.

Write the waiver in `02-design-review.md`. Then either:

- On the board, Approve while `design_review` is active or blocked, then Advance. That Advance only leaves the gate. The next `feature_dev` advance in chat executes `testcases`.
- By hand, write the same fields the runner writes when a gate is left: `statusByStage.design_review` = `done`, `current` = `testcases`, `statusByStage.testcases` = `active`, and a note `left approved gate design_review → testcases: waived, <reason>`.

## How status marks each file

`feature_dev` status prints an `expected:` list. The board shows the same marks.

| Mark | Meaning |
|---|---|
| `present` | The file exists and is not the generated skeleton. |
| `placeholder` | The file still contains `(skeleton placeholder)`. Replace it before treating the stage as done. |
| `missing` | The file is not in the directory. |

## Minimum state.json

Only needed when you cannot press Start. `runId` must match the directory name.

```json
{
  "runId": "fd-folder-diff-v1",
  "createdAt": "2026-11-10T00:00:00.000Z",
  "updatedAt": "2026-11-10T00:00:00.000Z",
  "featureSummary": "Compare two folders and show which files differ",
  "risks": [],
  "adversarialDesign": false,
  "adversarialCode": false,
  "maxCodeReviewRounds": 2,
  "stages": ["requirements", "design", "design_review", "testcases", "implement", "verify", "human_diff", "done"],
  "statusByStage": {
    "requirements": "active",
    "design": "pending",
    "design_review": "pending",
    "testcases": "pending",
    "implement": "pending",
    "verify": "pending",
    "human_diff": "pending",
    "done": "pending"
  },
  "current": "requirements",
  "notes": [],
  "workspaceRoot": "/absolute/path/to/the/workspace"
}
```

Refresh the board after you edit these files. The sidebar still cannot execute a stage.
