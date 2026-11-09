# Feature Dev Suite

Gated feature-development orchestration for DeepSeek Harness (`feature_dev` tool).

**Chinese README (primary):** [README.zh.md](./README.zh.md)

Installable as a `dsh.bundle` (`dsh-feature-dev-suite`). See the Chinese README for Desktop Plugin Manager, CLI (`dsh plugin add`), usage, and Linux notes.

## Sidebar

Desktop and Web show a left sidebar row labeled **功能开发 / Feature Dev**. It opens the `main` panel `feature-dev`: active runs or an empty Start form, the stage board from the host state, and Advance / Approve / Reject / Refresh.

Start writes `.feature-dev/<runId>/` through the same `feature_dev` actions as chat (`featureSummary`, risk tags, `adversarialDesign`, `adversarialCode`). Approve and Reject update that state. Advance leaves an approved gate here. Executing a stage still needs `feature_dev` advance inside a session, because that path requires the calling agent and `workflowEngine`.

`lib/client.js` is prebuilt. Installing the bundle does not need `allowBuilds`.
