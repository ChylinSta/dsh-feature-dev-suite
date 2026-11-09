# Feature Dev Suite（新功能开发编排）

DeepSeek Harness **可安装组合包**（`dsh.bundle`）：把「需求 → 方案 → 用例 → 实现 → 验证 → 人工 diff」做成可门禁、可并行、可按风险加深的主编排。

| 项 | 值 |
|---|---|
| 包名 | `dsh-feature-dev-suite` |
| 工具名 | `feature_dev` |
| 清单 | `package.json` → `dsh.bundle.patch` = `./cordis.patch.yml` |

> 说明：本包是**跨平台同一份 bundle**（纯 JS，无原生扩展）。Win / mac / Linux 的 Host 都装同一 tarball 或同一目录；差别只在「你用的 Desktop 安装包是否存在」，不在插件本身。

---

## 一、桌面端安装（优先）

Desktop 的插件管理与 Web 共用同一套 Host API（侧栏 **插件** / 设置里的插件管理）。

### 方式 A：本地目录（开发或拷贝了整个 `feature-dev-suite/`）

1. 打开 DeepSeek Harness **桌面端**
2. 侧栏进入 **插件** → **添加插件**（或「安装第三方插件」）
3. 输入本包的**绝对路径**，例如：
   - Windows：`C:\path\to\feature-dev-suite`
   - macOS：`/Users/you/path/feature-dev-suite`
4. 点 **安装** → 通过检查后点 **立即启用**
5. 若提示需要重启 Host / 应用，按提示重启一次

安装成功后，组合包卡片应显示包名 `dsh-feature-dev-suite`，行里能看到 `feature-dev-suite` 组（内含 workflow-ptc + 本插件）。

### 方式 B：tarball（推荐分发）

仓库里打好的包（或你本地执行 `npm run pack:bundle` 生成）：

```text
dsh-feature-dev-suite-0.1.1.tgz
```

在 **添加插件** 对话框里填该 `.tgz` 的**绝对路径**，或在已安装 Desktop 自带的 `dsh` CLI 里：

```sh
dsh plugin --profile desktop add /绝对路径/dsh-feature-dev-suite-0.1.1.tgz
```

### 更新已经装过的版本（0.1.0 → 0.1.1）

本包的 Host 和侧栏都是预构建的 `lib/index.js`、`lib/client.js`。**不要**把 `dsh-feature-dev-suite` 写进 `allowBuilds`。若安装器要求编译本包，说明 tarball 里缺了 `lib/client.js`，不要改用源码安装来绕过。

1. 在本目录执行 `npm run pack:bundle`，得到 `dsh-feature-dev-suite-0.1.1.tgz`
2. **完全退出** Desktop，再改它的 profile
3. 用 Desktop「管理 dsh 命令…」装上的那份 `dsh`（不是 npm 全局的 `dsh`）：

   ```sh
   dsh plugin --profile desktop add /绝对路径/dsh-feature-dev-suite-0.1.1.tgz
   ```

   若同名包已在 profile 里、add 没有换成新 tarball，先 `dsh plugin --profile desktop remove dsh-feature-dev-suite`，再 add。侧栏插件管理里也可以先移除再填新 tarball 的绝对路径。
4. 重新打开 Desktop。进行中的阶段上 **推进** 是禁用的，旁边有可复制的 `feature_dev` advance 调用；`design_review` / `human_diff` 被拦住时才出现通过和驳回。

> `desktop` 这个 profile 名由 Electron 桌面端持有；**npm 全局 `dsh` 不能**对它做插件管理。请用 Desktop 应用菜单里的「管理 dsh 命令…」装上的那份 `dsh`，或直接在 Desktop UI 里装。

### 方式 C：源码 checkout + CLI（非 Desktop profile）

若你用的是 CLI 的 `web` profile（浏览器打开），在 **harness 仓库根** 或任意目录：

```sh
# 需要 Node ≥ 24.9；源码 checkout 用 pnpm dsh
pnpm dsh plugin --profile web add ./feature-dev-suite
# 或
dsh plugin --profile web add /绝对路径/feature-dev-suite
dsh plugin --profile web add /绝对路径/dsh-feature-dev-suite-0.1.1.tgz
```

验证层是否挂上：

```sh
dsh --profile web --dump-config | grep -n feature-dev
```

应能看到 `# == dsh-feature-dev-suite` 一层，以及 `feature-dev-workflow-ptc` / `feature-dev-suite-plugin`。

---

## 二、用法（装好并启用后）

在任意会话里让模型调用工具 **`feature_dev`**：

| action | 作用 |
|---|---|
| `start` | 创建 run，写入阶段图（需 `featureSummary`） |
| `status` | 当前阶段、下一步、侧栏能不能推进、可粘贴的 chat 调用、产物路径 |
| `advance` | **执行当前阶段**（经 `workflowEngine`，必须发生在这个会话里） |
| `approve` | 通过 `design_review` / `human_diff` |
| `reject` | 打回上一阶段并记录原因 |

口语示例：

- 「用 `feature_dev` start，功能：给设置页加导出按钮」
- 「`feature_dev` advance」
- 「approve，方案可以落地」 / 「reject，缺回滚方案」
- 「`feature_dev` status」

### 侧边栏面板

Desktop / Web 左侧栏有一行 **功能开发 / Feature Dev**（`sidebar.panellist`）。点开后是同 id `feature-dev` 的 `main` 面板：

- 没有运行时说明三步：在这里开始、到聊天里执行、回到这里处理门禁。开始只写 `.feature-dev/<runId>/`
- 有运行就列出（坏掉的目录会被跳过，不会把整张列表弄丢）。阶段板与宿主 state 一致：requirements → design → design_review → testcases →（按风险或开关出现的 adversarial_design / adversarial_code）→ implement → verify → human_diff → done
- 每个阶段的状态：pending / active / blocked / done / approved / failed。`design_review` 和 `human_diff` 标成门禁
- 当前阶段要写哪个文件、相对路径、绝对路径、哪些文件还是占位
- 下一步提示。Refresh 在通过、驳回、离开门禁之后再读一遍磁盘

### 聊天和侧栏怎么分工

只有一套 `runFeatureDev`。侧栏不是第二套状态机。

| 板上的状态 | 侧栏 | 聊天 `feature_dev` |
|---|---|---|
| 还没有运行 | 开始（只建目录和占位） | `start` |
| 阶段 `active` 或 `failed` | **推进禁用**，并给出可复制的调用 | `advance` **执行**当前阶段 |
| `design_review` / `human_diff` 且 `blocked` | 通过 / 驳回是主按钮 | `approve` / `reject` |
| 门禁已 `approved` | 推进只离开门禁，**不执行**下一阶段 | `advance` 做同样的离开；要再调一次 `advance` 才执行下一阶段 |
| `done` | 只看产物 | `status` |

`workflowEngine.start` 的 `parent` 必须是这一轮聊天里的 live Agent（工作目录、谱系、子 agent 都挂在它上面）。侧栏的 HTTP 路由不在会话里，插件创建面板 API 时**故意不传入** agent。若随便挑一个已经打开的会话来执行，阶段会跑在那个会话的工具和权限下，跨过隔离边界。所以面板在需要执行时返回 `409`，`code` 为 `needs_session`，正文里带可粘贴的 `feature_dev` advance 调用，并且不改 state。

同一个 `createFeatureApi` 如果调用方自己带上了 session agent 和 `workflowEngine`，`advance` 会走原来的执行路径。Desktop 面板没有这份上下文，因此不执行。

`status` 文本里有 `next`、`sidebarAdvance`、`hint`、`chat`、`artifact`，和阶段板上的下一步是同一份判断。

浏览器包是预构建的 `lib/client.js`，安装不需要 `allowBuilds`。

产物目录：工作区 `.feature-dev/<runId>/`

| 阶段 | 文件 | 门禁 |
|---|---|---|
| 需求 | `01-requirements.md` | |
| 方案 | `02-design.md` | |
| 方案讨论 | `02-design-review.md` | **人 approve** |
| 用例 | `03-testcases.md` | |
| 实现 | `04-impl-notes.md` + 代码 | |
| 验证 | `05-verify.md` | |
| 合入前 | `06-full.diff` + `06-summary.md` | **人 approve** |

高风险可在 start 时带风险标签，或 `adversarialDesign` / `adversarialCode` = true，会多走对抗深评。

---

## 三、Linux 适配说明（同一 bundle，不另做包）

**结论先说：**

1. **插件本身**：`dsh-feature-dev-suite` 是纯 ESM JS + YAML，**Win / macOS / Linux 共用同一份**；无需「Linux 专用插件」。
2. **官方 Desktop 安装包**：当前仓库的 Desktop 打包脚本只发布 **macOS（arm64/x64）与 Windows（x64）** 目标；`linux-x64` 在打包路径里被标为 unsupported。因此 **没有**「再做一个 Linux 专用 `.deb` 插件」的步骤——Linux 上装的是**同一 tarball**，差别是 Host 从哪来。
3. **Linux 上怎么用本插件（按你现有 Host 选一条）：**
   - **已有社区 / 自编译的 Linux Desktop**：与 Win/mac 一样，用侧栏插件管理装本地路径或 `.tgz`。
   - **没有 Desktop、只有 CLI**：用 Node 24 + 官方/源码 `dsh`，`dsh plugin --profile web add <本包路径或 tgz>`，再 `dsh --profile web` 开 Web UI。
   - **本仓库源码开发**：`pnpm dsh --profile web --patch ./feature-dev-suite/cordis.yml --no-open`（`cordis.yml` 指向 `./src`，便于改 TS 热加载；装进 profile 用的是 `cordis.patch.yml`）。

请勿把「Linux Desktop 官方安装包是否已发布」与「本插件是否支持 Linux」混为一谈：前者以 DeepSeek 发布渠道为准；后者本 bundle **已支持**。

---

## 四、定稿流程（阶段契约）

### 主干（默认每次都走）

| 阶段 ID | 名称 | 产物 | 门禁 |
|---|---|---|---|
| `requirements` | 需求理解 | `01-requirements.md` | 目标 / 非目标 / 约束 / 验收标准 |
| `design` | 方案设计（含技术选型） | `02-design.md` | |
| `design_review` | 方案讨论与敲定 | `02-design-review.md` | **人工确认** |
| `testcases` | 用例与失败边界 | `03-testcases.md` | |
| `implement` | 功能实现 | 代码 + `04-impl-notes.md` | |
| `verify` | 编译 / 测试 / 打包 | `05-verify.md` | 失败则回实现 |
| `human_diff` | 合入前人工 diff | `06-full.diff` + `06-summary.md` | **人过了才能合入** |

### 方案敲定

`design` 之后进入 `design_review`：默认轻量双视角（`proposer` / `challenger` 隔离上下文），合并为 `02-design-review.md`，**人 `approve` 后**才进用例/实现。`adversarial_design=true` 或风险标签命中时加深对抗。

### 按风险触发

| 阶段 | 何时 |
|---|---|
| `adversarial_design` | 风险标签或显式开启 |
| `adversarial_code` | 风险标签或显式开启 |

---

## 五、给作者：如何重新打包

在本目录：

```sh
node ./scripts/build.mjs          # 生成 lib/index.js 与 lib/client.js（预构建，安装无需 allowBuilds）
npm pack                          # 得到 dsh-feature-dev-suite-0.1.1.tgz
# 或
npm run pack:bundle
```

`files` 字段打出：`lib/index.js`、`lib/client.js`、`cordis.patch.yml`、`prompts/`、`locale/`、`icon.svg`、README。不要把 `node_modules` 或 `src/` 打进去。安装不需要 `allowBuilds`。

开发时若只想 `--patch` 试跑、不装进 profile：

```sh
pnpm dsh --profile web --patch ./feature-dev-suite/cordis.yml --no-open
```

注意：`--patch` 是 **launcher** 参数，写在 `web` 子命令**之前**。

---

## 六、目录结构

```text
feature-dev-suite/
├── package.json          # name=dsh-feature-dev-suite；dsh.bundle.patch
├── cordis.patch.yml      # 安装进 profile 的层（包名引用）
├── cordis.yml            # 仅源码 --patch 用（相对 ./src）
├── lib/index.js          # 预构建 Host（Desktop/tarball 用）
├── lib/client.js         # 预构建侧栏（安装不编译）
├── src/                  # TypeScript 源码 + src/client/entry.js
├── prompts/              # 文档型提示骨架（随包分发）
├── scripts/build.mjs
├── README.zh.md
└── README.md
```

`cordis.patch.yml` 使用与官方 `ralph-bundle` 相同的写法：在 `cordis:group` 里 `isolate.workflowEngine`，并挂上 `@deepseek-ai/dsh-workflow-ptc`（spawn），这样桌面/Web profile 里也能拿到编排引擎，而不依赖「只在 agent preset 隔离域里」的那份。

## 现状

- [x] 阶段契约与门禁语义
- [x] `feature_dev`：start / status / advance / approve / reject
- [x] `advance` 经 `workflowEngine` 执行（含 design_review 双视角）
- [x] 可安装 `dsh.bundle` + 预构建 tarball
- [x] Desktop/Web 侧边栏阶段板（与 `feature_dev` 共用 state）
- [x] 侧栏在没有会话 agent 时禁用执行阶段的推进，并给出可复制的 `feature_dev` 调用；已通过的门禁仍可在侧栏离开
- [ ] 侧栏直接执行阶段（需要 live Agent；不能向别的会话借用）
- [ ] 实现阶段更细的工具白名单 / preset
