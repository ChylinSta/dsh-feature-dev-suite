# Feature Dev Suite

Gated feature-development orchestration for DeepSeek Harness (`feature_dev` tool).

**Chinese README (primary):** [README.zh.md](./README.zh.md)

Installable as a `dsh.bundle` (`dsh-feature-dev-suite` 0.1.3). See the Chinese README for Desktop Plugin Manager, CLI (`dsh plugin add`), usage, and Linux notes.

## Chat and the sidebar

Both faces share one runner and the files under `.feature-dev/<runId>/`. The sidebar is not a second state machine.

| Board state | Sidebar | `feature_dev` in chat |
|---|---|---|
| No run | Start (writes the folder only) | `start` |
| `active` or `failed` stage | Advance stays disabled. Copy the chat call. | `advance` executes that stage via `workflowEngine` |
| `design_review` / `human_diff` blocked | Approve or Reject | `approve` / `reject` |
| Gate `approved` | Advance only leaves the gate and marks the next stage active. It does not execute that stage. | The same leave. When that stage is active, one more `advance` executes it. |
| `done` | Read artifacts | `status` |

`workflowEngine.start` requires the live parent agent from the chat turn (cwd, lineage, and child attribution). The sidebar route is not inside a session, so it does not receive that agent. Pointing it at some other open chat would run the stage under that session. The panel therefore refuses execution with `409 needs_session` and a pasteable call. A host that constructs the same API with a session agent and an engine can execute; the Desktop panel does not.

`status` from the tool includes `next`, `sidebarAdvance`, `hint`, `chat`, `artifact`, `implementTools`, and an `expected:` checklist (`present`, `placeholder`, or `missing` for each stage file). After a gate is approved, `hint` names the following stage and says the next advance does not execute it.

Hand-written runs, including a waived design review, follow [docs/feature-dev-offline.md](./docs/feature-dev-offline.md). Name the folder `fd-<slug>` (for example `fd-folder-diff-v1`) so the board can list it. The sidebar still cannot execute a stage.

The sidebar still cannot start a workflow. `workflowEngine.start` has no session on this route, and `agent()` inside a workflow script still cannot carry a tool filter.

## Implement tool allowlist

New runs snapshot a default list onto `state.json`: `read`, `write`, `edit`, `apply_patch`, `grep`, `glob`, `bash`, `todo_write`. The implement prompt tells the child to call only those tools, and not `feature_dev`, `workflow`, or `subagent`. The harness workflow `agent()` hook rejects any other option (`UNSUPPORTED_OPTION`), so this is a prompt contract, not `tools.restrict`.

Runs already on disk without `implementTools` stay unrestricted. Set the plugin config to opt out or replace the list:

```yaml
- id: feature-dev-suite-plugin
  name: dsh-feature-dev-suite
  config:
    implementTools: false          # unrestricted, same as a pre-0.1.2 run
    # implementTools: [read, edit, bash]
```

`feature_dev` start accepts `implementTools` as a string array for that run only. The board prints the snapshotted list.

## Update an installed Desktop bundle (0.1.3)

`lib/index.js` and `lib/client.js` are prebuilt. Do not add this package to `allowBuilds`.

1. From this directory: `npm run pack:bundle` → `dsh-feature-dev-suite-0.1.3.tgz`.
2. Quit Desktop completely.
3. With the `dsh` command installed by Desktop (not a global npm `dsh`):

   ```sh
   dsh plugin --profile desktop add /absolute/path/dsh-feature-dev-suite-0.1.3.tgz
   ```

   If that profile already has the package and add does not replace it, `dsh plugin --profile desktop remove dsh-feature-dev-suite`, then add the new tarball. The same path works in the sidebar plugin manager.
4. Open Desktop again. On an active stage, Advance is disabled and the board shows the chat call. Approve and Reject appear when `design_review` or `human_diff` is blocked.
