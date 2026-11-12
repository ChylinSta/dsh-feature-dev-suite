# Offline feature-dev artifacts

Use this when a person or a cloud agent can write files but cannot call `feature_dev` advance. The sidebar never starts a workflow. It only reads this folder.

Prefer **Start** on the board (or `feature_dev` start). That writes `state.json`, `00-brief.md`, and a skeleton for the current stage. Then replace the skeletons by hand. The checklist below is the same sequence FolderDiff used.

## Folder name

`start` still creates:

```text
.feature-dev/fd-<slug>/
```

Example: `.feature-dev/fd-folder-diff-v1/`. That prefix is the recommended name.

The board and `feature_dev` list also accept a lowercase slug **without** the `fd-` prefix when the directory already holds stage files. `.feature-dev/folder-diff-v1/` (the FolderDiff layout) shows up. A directory with no stage files, such as `notes/`, stays hidden. `runId` in `state.json` must match the directory name.

## Files

Plain run, no adversarial stages. The numbered name is what `start` writes. The unprefixed name is enough when that is the file on disk. If both exist, the checklist marks the numbered one.

| Step | Stage | Numbered file | Also accepted |
|---|---|---|---|
| 0 | brief | `00-brief.md` | |
| 1 | `requirements` | `01-requirements.md` | `requirements.md` |
| 2 | `design` | `02-design.md` | `design.md` |
| 3 | `design_review` | `02-design-review.md` | `design_review.md` |
| 4 | `testcases` | `03-testcases.md` | `testcases.md` |
| 5 | `implement` | `04-impl-notes.md` | `impl_notes.md`, `implement.md` |
| 6 | `verify` | `05-verify.md` | `verify.md` |
| 7 | `human_diff` | `06-summary.md` | `human_diff.md` |
| 7 | `human_diff` | `06-full.diff` | This file is not created as a skeleton. |

`iterate-1.md`, `iterate-2.md`, `iterate-3.md`, and further `iterate-N.md` files are listed when they exist. Status and the board show the latest increment.

`state.json` sits beside those files. High-risk runs also expect `03b-adversarial-design.md` and `04b-adversarial-code.md`. `feature_dev` status omits them when the run's stage list does not include those stages.

## Adopt an existing folder

FolderDiff was written by a cloud agent and imported to git with no usable `state.json`. Point `adopt` at that directory. It creates or repairs `state.json` and does not overwrite the markdown already there.

```text
feature_dev adopt
runId: folder-diff-v1
```

Completion is inferred from the files:

- A real stage file marks that stage done. A later file also marks the earlier gaps done, so a missing `04-impl-notes.md` does not reopen implement after `verify.md` exists.
- A design review that says the gate was **waived** (or 豁免) is done. Keep supporting written waivers. A review file with no waiver and no later stage is still the human gate.
- `iterate-N.md` files after `human_diff` land the run on the latest increment. A write-up with a changes section and a tests section is complete (`done`). A file that still says `_Status: in progress_` or `_Iterate stage: verify_` stays on that stage.

After adopt, `iterate` can start the next increment. Calling adopt again on a readable `state.json` leaves it in place.

## Iterate

`start` of a brand-new feature is unchanged: requirements → design → design_review → testcases → implement → verify → human_diff.

`iterate` is only for a run whose `human_diff` is already finished, or whose current stage is `done`. It takes the next free integer (after `iterate-3.md`, that is 4), creates `iterate-N.md` with the scope and the leftovers copied out of the previous increment, and sets the stage to `implement`. The loop is:

```text
implement → verify → human_diff
```

It reuses the requirements and design already on disk. It does not open a new requirements → design → design_review cycle. The sidebar lists `iterate-N.md` and keeps today's leave-gate rules. Advance on the sidebar still does not execute a stage (`409 needs_session` and a pasteable chat call).

```text
feature_dev iterate
runId: folder-diff-v1
scope: Confirm Windows open and drive letters
```

## Waiving design review

FolderDiff waived the discussion instead of running the dual review. Keep the file. A missing review file is reported as missing when nothing later was written either. `design_review.md` counts as `02-design-review.md`.

Write the waiver in `02-design-review.md` or `design_review.md`. Then either:

- On the board, Approve while `design_review` is active or blocked, then Advance. That Advance only leaves the gate. The next `feature_dev` advance in chat executes `testcases`.
- By hand, write the same fields the runner writes when a gate is left: `statusByStage.design_review` = `done`, `current` = `testcases`, `statusByStage.testcases` = `active`, and a note `left approved gate design_review → testcases: waived, <reason>`.
- Or call `adopt`. A file that contains "waived" or "waiver" is stored as `design_review` done.

## Platform confirmation

Verify can pass on the machine that ran it and still leave another target unchecked. FolderDiff verified on Linux. Windows `start` and drive-letter browse were never run. That is a note, not a blocked gate. Linux-only progress continues. Status and the board show a line such as:

```text
platform: pending platform confirmation: Linux verified; Windows unconfirmed. This does not block the run.
```

Record a result in `verify.md` or `iterate-N.md`, one platform per line, outside a code fence:

```text
platform: linux verified
platform: windows unconfirmed
```

`verified` and `passed` confirm that platform. `unconfirmed`, `pending`, and `not verified` keep the note. When every recorded platform is confirmed, the note disappears. Prose that says the command host was Linux and that Windows was not executed is enough for the note when those `platform:` lines are absent. Confirming Windows is how the note goes away. It never stops the run.

## How status marks each file

`feature_dev` status prints an `expected:` list. The board shows the same marks.

| Mark | Meaning |
|---|---|
| `present` | The file exists and is not the generated skeleton. An unprefixed alias counts. |
| `placeholder` | The file still contains `(skeleton placeholder)`. Replace it before treating the stage as done. |
| `missing` | Neither the numbered file nor its alias is in the directory. |

`iterate-N.md` is omitted from the list until the file exists. The newest one is also printed as `iterate:` and `iterateStage:`.

## Minimum state.json

Only needed when you cannot press Start and you are not calling `adopt`. `runId` must match the directory name. `adopt` writes this for you.

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

An adopted run that already finished increments also stores `iterate` and `iterateStage` (`done`, or `implement` / `verify` / `human_diff` while that increment is open).

Refresh the board after you edit these files. The sidebar still cannot execute a stage.
