# Feature Dev Suite

Gated feature-development orchestration for DeepSeek Harness (`feature_dev` tool).

**Chinese README (primary):** [README.zh.md](./README.zh.md)

Installable as a `dsh.bundle` (`dsh-feature-dev-suite` 0.1.1). See the Chinese README for Desktop Plugin Manager, CLI (`dsh plugin add`), usage, and Linux notes.

## Chat and the sidebar

Both faces share one runner and the files under `.feature-dev/<runId>/`. The sidebar is not a second state machine.

| Board state | Sidebar | `feature_dev` in chat |
|---|---|---|
| No run | Start (writes the folder only) | `start` |
| `active` or `failed` stage | Advance stays disabled. Copy the chat call. | `advance` executes that stage via `workflowEngine` |
| `design_review` / `human_diff` blocked | Approve or Reject | `approve` / `reject` |
| Gate `approved` | Advance only leaves the gate. It does not run the next stage. | `advance` does the same leave. Call `advance` again to execute. |
| `done` | Read artifacts | `status` |

`workflowEngine.start` requires the live parent agent from the chat turn (cwd, lineage, and child attribution). The sidebar route is not inside a session, so it does not receive that agent. Pointing it at some other open chat would run the stage under that session. The panel therefore refuses execution with `409 needs_session` and a pasteable call. A host that constructs the same API with a session agent and an engine can execute; the Desktop panel does not.

`status` from the tool includes `next`, `sidebarAdvance`, `hint`, `chat`, and `artifact`, matching the board.

## Update an installed Desktop bundle (0.1.1)

`lib/index.js` and `lib/client.js` are prebuilt. Do not add this package to `allowBuilds`.

1. From this directory: `npm run pack:bundle` → `dsh-feature-dev-suite-0.1.1.tgz`.
2. Quit Desktop completely.
3. With the `dsh` command installed by Desktop (not a global npm `dsh`):

   ```sh
   dsh plugin --profile desktop add /absolute/path/dsh-feature-dev-suite-0.1.1.tgz
   ```

   If that profile already has the package and add does not replace it, `dsh plugin --profile desktop remove dsh-feature-dev-suite`, then add the new tarball. The same path works in the sidebar plugin manager.
4. Open Desktop again. On an active stage, Advance is disabled and the board shows the chat call. Approve and Reject appear when `design_review` or `human_diff` is blocked.
