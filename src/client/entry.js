/**
 * Browser half of Feature Dev. The build wraps this file in the module-loader
 * factory; inside that factory `require` is the shell module table.
 *
 * The sidebar row and the main panel share PANEL_ID. The shell owns the row
 * click and the selected state. This file only draws the glyph and the board.
 */

const React = require('react')

const PANEL_ID = 'feature-dev'
const PANEL_LABEL = '功能开发 / Feature Dev'
const PANEL_ORDER = 30
const NS = 'dsh-feature-dev-suite'
const API = '/api/dsh-feature-dev'
const STYLE_ID = 'dsh-feature-dev-suite-style'

const RISKS = [
  { id: 'new_subsystem', key: 'risk.new_subsystem' },
  { id: 'cross_module', key: 'risk.cross_module' },
  { id: 'security_or_data', key: 'risk.security_or_data' },
  { id: 'irreversible_migration', key: 'risk.irreversible_migration' },
  { id: 'small_local_change', key: 'risk.small_local_change' },
]

const en = {
  'panel.kicker': 'Stage board',
  'empty.title': 'No feature run yet',
  'empty.body': 'This board and the feature_dev chat tool share .feature-dev/<runId>/ in the workspace. Start creates the run. It does not execute a stage.',
  'empty.step1': 'Start here with a short summary. The host writes .feature-dev/<runId>/.',
  'empty.step2': 'In chat, paste that run’s feature_dev advance call. That is what executes the current stage.',
  'empty.step3': 'Come back here when design_review or human_diff is waiting. Approve or reject on this board. Advance here only leaves a gate you already approved.',
  'empty.path': 'Runs live in .feature-dev/ inside the workspace.',
  'empty.engineOff': 'This host has no workflowEngine. Chat advance cannot run a stage until the feature-dev bundle is enabled.',
  'action.start': 'Start',
  'action.advance': 'Advance',
  'action.approve': 'Approve',
  'action.reject': 'Reject',
  'action.refresh': 'Refresh',
  'action.cancel': 'Cancel',
  'action.confirmReject': 'Reject stage',
  'field.description': 'Feature summary',
  'field.example': 'Compare two folders and show which files differ',
  'field.runId': 'Run id',
  'field.risks': 'Risk tags',
  'field.note': 'Approval note (optional)',
  'field.reason': 'Reject reason',
  'field.adversarialDesign': 'Adversarial design review',
  'field.adversarialCode': 'Adversarial code review',
  'risk.new_subsystem': 'New subsystem',
  'risk.cross_module': 'Cross module',
  'risk.security_or_data': 'Security or data',
  'risk.irreversible_migration': 'Irreversible migration',
  'risk.small_local_change': 'Small local change',
  'status.pending': 'Pending',
  'status.active': 'Active',
  'status.blocked': 'Blocked',
  'status.done': 'Done',
  'status.approved': 'Approved',
  'status.failed': 'Failed',
  'gate.design_review': 'Design review is waiting for a decision. Read 02-design-review.md, then Approve or Reject here. Advance stays off until you approve.',
  'gate.human_diff': 'Human diff is waiting for a decision. Read 06-summary.md and 06-full.diff, then Approve or Reject here.',
  'gate.approved': 'Approved. Advance here only leaves the gate. It does not execute the next stage.',
  'gate.approvedNext': 'Approved. Advance here only leaves this gate and makes {stage} active. It does not execute {stage}. After the board shows {stage} active, one feature_dev advance in chat executes {stage}.',
  'gate.approvedDone': 'Approved. Advance here only leaves this gate and marks the run done. It does not execute another stage.',
  'advance.needsAgent': 'Executing a stage needs feature_dev advance in a chat session. This panel can start, approve, reject, and leave an approved gate.',
  'next.execute_in_chat': 'Next: one feature_dev advance in chat executes this stage. Advance stays off here — this panel has no session agent, so it cannot start workflowEngine.',
  'next.executeAfterGate': '{stage} is active. Leaving {gate} did not execute it. The next feature_dev advance in chat is the one that executes {stage}. Advance stays off here.',
  'next.retry_in_chat': 'This stage failed. Copy the chat call and run feature_dev advance again. Advance stays off here.',
  'next.done': 'This run is done. The artifacts stay in the folder below.',
  'iterate.line': 'Iterate {n} · {stage}',
  'platform.pending': 'Pending platform confirmation: {verified} verified; {unconfirmed} still unconfirmed. This does not block the run.',
  'platform.none': 'none',
  'next.advanceDisabled': 'Running a stage needs feature_dev advance in chat. Advance here only leaves a gate you already approved.',
  'board.shared': 'Same folder as feature_dev in chat. Refresh after chat runs a stage.',
  'start.help': 'Start only creates the run and a placeholder file. It does not execute requirements.',
  'implement.tools': 'Implement may call only',
  'implement.unrestricted': 'This run does not limit tools on the implement stage.',
  'chat.label': 'Chat call',
  'chat.help': 'Paste this into a chat in this workspace. The model should call feature_dev advance with this run id and then stop.',
  'chat.copy': 'Copy',
  'chat.copied': 'Copied',
  'chat.manual': 'If the button cannot copy, select the line and copy it.',
  'stage.gate': 'Gate',
  'artifact.folder': 'Folder',
  'artifact.current': 'This stage writes',
  'artifact.placeholder': 'placeholder until this stage is written',
  'artifact.missing': 'missing',
  'artifact': 'Artifacts',
  'phase.completed': 'Completed',
  'phase.active': 'In progress',
  'runs': 'Runs',
  'loading': 'Loading runs…',
  'adversarial.off': 'Adversarial stage is off for this run.',
  'adversarial.on': 'Adversarial stage is on for this run.',
}

const zh = {
  'panel.kicker': '阶段板',
  'empty.title': '还没有功能开发',
  'empty.body': '这块阶段板和聊天里的 feature_dev 共用工作区的 .feature-dev/<runId>/。开始只会建立运行，不会执行阶段。',
  'empty.step1': '在这里写一段功能说明并开始。宿主会写入 .feature-dev/<runId>/。',
  'empty.step2': '到聊天里粘贴该运行的 feature_dev advance 调用，才会执行当前阶段。',
  'empty.step3': 'design_review 或 human_diff 被拦住时，回到这里通过或驳回。这里的推进只离开已经通过的门禁，不会执行下一阶段。',
  'empty.path': '运行目录在工作区的 .feature-dev/ 下。',
  'empty.engineOff': '当前宿主没有 workflowEngine。聊天里的 advance 也无法执行阶段，直到启用本组合包。',
  'action.start': '开始',
  'action.advance': '推进',
  'action.approve': '通过',
  'action.reject': '驳回',
  'action.refresh': '刷新',
  'action.cancel': '取消',
  'action.confirmReject': '确认驳回',
  'field.description': '功能说明',
  'field.example': '比较两个文件夹，标出哪些文件不同',
  'field.runId': '运行 ID',
  'field.risks': '风险标签',
  'field.note': '通过备注（可选）',
  'field.reason': '驳回原因',
  'field.adversarialDesign': '对抗式方案深评',
  'field.adversarialCode': '对抗式代码深评',
  'risk.new_subsystem': '新子系统',
  'risk.cross_module': '跨模块',
  'risk.security_or_data': '安全或数据',
  'risk.irreversible_migration': '不可逆迁移',
  'risk.small_local_change': '小范围改动',
  'status.pending': '未开始',
  'status.active': '进行中',
  'status.blocked': '待确认',
  'status.done': '完成',
  'status.approved': '已通过',
  'status.failed': '失败',
  'gate.design_review': '方案讨论正在等你决定。先看 02-design-review.md，再在这里通过或驳回。未通过前不能推进。',
  'gate.human_diff': '合入前人工 diff 正在等你决定。先看 06-summary.md 和 06-full.diff，再在这里通过或驳回。',
  'gate.approved': '已通过。这里的推进只离开门禁，不会执行下一阶段。',
  'gate.approvedNext': '已通过。这里的推进只离开本门禁，并把 {stage} 标成进行中。它不会执行 {stage}。阶段板显示 {stage} 进行中之后，再在聊天里调用一次 feature_dev advance，那一次才执行 {stage}。',
  'gate.approvedDone': '已通过。这里的推进只离开本门禁并把运行标成完成，不会再执行别的阶段。',
  'advance.needsAgent': '执行阶段需要在聊天里调用 feature_dev advance。这里可以开始、通过、驳回，以及离开已通过的门禁。',
  'next.execute_in_chat': '下一步：在聊天里调用一次 feature_dev advance 才会执行当前阶段。这里的推进保持禁用，侧栏没有会话 agent，不能启动 workflowEngine。',
  'next.executeAfterGate': '{stage} 已是进行中。离开 {gate} 的那一次推进没有执行它。聊天里的下一次 feature_dev advance 才会执行 {stage}。这里的推进保持禁用。',
  'next.retry_in_chat': '当前阶段失败了。复制下面的调用，在聊天里再次 feature_dev advance。这里不能重试。',
  'next.done': '这条运行已经完成。产物还在下面的目录里。',
  'iterate.line': '增量 {n} · {stage}',
  'platform.pending': '平台确认未完成：{verified} 已验证；{unconfirmed} 仍未确认。这不会拦住这次运行。',
  'platform.none': '尚无',
  'next.advanceDisabled': '执行阶段要在聊天里调用 feature_dev advance。这里的推进只离开已经通过的门禁。',
  'board.shared': '和聊天里的 feature_dev 读同一份 .feature-dev 目录。聊天执行完阶段后点刷新。',
  'start.help': '开始只会创建运行和占位文件，不会执行「需求理解」。',
  'implement.tools': '实现阶段只能调用',
  'implement.unrestricted': '这条运行没有限制实现阶段的工具。',
  'chat.label': '聊天调用',
  'chat.help': '粘贴到本工作区的聊天里。模型应调用 feature_dev advance，使用这个 runId，然后停下来。',
  'chat.copy': '复制',
  'chat.copied': '已复制',
  'chat.manual': '如果复制按钮不可用，选中这行再复制。',
  'stage.gate': '门禁',
  'artifact.folder': '目录',
  'artifact.current': '当前阶段写入',
  'artifact.placeholder': '占位，阶段正文还没写',
  'artifact.missing': '缺少',
  'artifact': '产物',
  'phase.completed': '已完成',
  'phase.active': '进行中',
  'runs': '运行',
  'loading': '正在读取运行…',
  'adversarial.off': '本次运行不包含对抗审查。',
  'adversarial.on': '本次运行包含对抗审查。',
}

const CSS = `
.fdv-shell {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--dsh-frame-top-clearance, 12px) 20px 20px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.45;
}
.fdv-shell *, .fdv-shell *::before, .fdv-shell *::after { box-sizing: border-box; }
.fdv-shell :where(button, input, textarea) { font: inherit; color: inherit; }
.fdv-shell :where(button) { cursor: pointer; }
.fdv-shell :where(button:disabled) { cursor: not-allowed; opacity: 0.55; }
.fdv-shell :where(:focus-visible) {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.fdv-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 16px; }
.fdv-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.fdv-kicker { margin: 0 0 2px; color: var(--dsw-alias-label-tertiary); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
.fdv-title { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
.fdv-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.fdv-btn {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  border-radius: var(--dsw-radius-md, 8px);
  min-height: 28px;
  padding: 4px 10px;
}
.fdv-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.fdv-btn-primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
.fdv-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary)); }
.fdv-btn-danger {
  border-color: transparent;
  background: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
.fdv-btn-danger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-state-error-primary)); }
.fdv-prominent .fdv-btn { min-height: 36px; padding: 6px 14px; font-weight: 600; }
.fdv-card {
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  border-radius: var(--dsw-radius-panel, 12px);
  padding: 14px;
}
.fdv-empty { display: flex; flex-direction: column; gap: 8px; max-width: 460px; }
.fdv-empty h2 { margin: 0; font-size: 16px; }
.fdv-muted { margin: 0; color: var(--dsw-alias-label-secondary); }
.fdv-layout { display: grid; grid-template-columns: minmax(180px, 240px) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 720px) { .fdv-layout { grid-template-columns: 1fr; } }
.fdv-run {
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  border-radius: var(--dsw-radius-sm, 6px);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fdv-run[aria-current="true"] { background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-bg-layer-2)); border-color: var(--dsw-alias-border-l2); }
.fdv-run:hover { background: var(--dsw-alias-interactive-bg-hover); }
.fdv-run-title { font-weight: 600; }
.fdv-run-meta { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.fdv-board { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.fdv-stage {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: var(--dsw-radius-md, 8px);
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
}
.fdv-stage[data-status="active"] { border-color: var(--dsw-alias-brand-primary); }
.fdv-stage[data-status="blocked"] { border-color: var(--dsw-alias-state-warn-secondary, var(--dsw-alias-state-warn-label)); background: var(--dsw-alias-state-warn-tertiary, var(--dsw-alias-bg-layer-2)); }
.fdv-dot { width: 8px; height: 8px; border-radius: 99px; background: var(--dsw-alias-label-tertiary); }
.fdv-stage[data-status="active"] .fdv-dot { background: var(--dsw-alias-brand-primary); }
.fdv-stage[data-status="blocked"] .fdv-dot { background: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-secondary)); }
.fdv-stage[data-status="done"] .fdv-dot, .fdv-stage[data-status="approved"] .fdv-dot { background: var(--dsw-alias-state-success-primary); }
.fdv-stage[data-status="failed"] .fdv-dot { background: var(--dsw-alias-state-error-primary); }
.fdv-status {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  border-radius: var(--dsw-radius-xs, 4px);
  padding: 1px 6px;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1));
}
.fdv-stage[data-status="blocked"] .fdv-status { color: var(--dsw-alias-state-warn-label); }
.fdv-stage[data-status="done"] .fdv-status, .fdv-stage[data-status="approved"] .fdv-status { color: var(--dsw-alias-state-success-primary); }
.fdv-id { color: var(--dsw-alias-label-tertiary); font-size: 12px; margin-left: 6px; }
.fdv-banner {
  border-radius: var(--dsw-radius-md, 8px);
  padding: 10px 12px;
  background: var(--dsw-alias-state-warn-tertiary, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-label-primary));
}
.fdv-error {
  border-radius: var(--dsw-radius-md, 8px);
  padding: 8px 10px;
  background: var(--dsw-alias-state-error-secondary, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-state-error-primary);
}
.fdv-field { display: flex; flex-direction: column; gap: 6px; margin: 0 0 10px; }
.fdv-field span { color: var(--dsw-alias-label-secondary); }
.fdv-field textarea, .fdv-field input[type="text"] {
  width: 100%;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  border-radius: var(--dsw-radius-sm, 6px);
  padding: 8px;
  resize: vertical;
}
.fdv-risks { display: flex; flex-wrap: wrap; gap: 8px 14px; }
.fdv-risks label { display: flex; gap: 6px; align-items: center; }
.fdv-path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
.fdv-files { margin: 6px 0 0; padding-left: 18px; color: var(--dsw-alias-label-secondary); }
.fdv-decision { margin: 8px 0 0; color: var(--dsw-alias-label-secondary); }
.fdv-steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; color: var(--dsw-alias-label-secondary); }
.fdv-call { display: flex; gap: 8px; align-items: stretch; }
.fdv-call input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  border-radius: var(--dsw-radius-sm, 6px);
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.fdv-badge {
  margin-left: 6px;
  font-size: 11px;
  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-label-secondary));
}
.fdv-stage[data-current="true"] { box-shadow: inset 3px 0 0 var(--dsw-alias-brand-primary); }
`

function injectStyles() {
  if (typeof document === 'undefined') return () => {}
  const previous = document.getElementById(STYLE_ID)
  if (previous) return () => {}
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

function FeatureDevIcon(props) {
  const size = props && props.size ? props.size : 16
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    'aria-hidden': 'true',
  },
  React.createElement('path', {
    d: 'M3 3.5h4.2c.3 0 .6.2.8.4L9.2 5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1Z',
    stroke: 'currentColor',
    strokeWidth: '1.4',
  }),
  React.createElement('path', {
    d: 'M5 8.2h6M5 10.4h3.5',
    stroke: 'currentColor',
    strokeWidth: '1.4',
    strokeLinecap: 'round',
  }))
}

function subscribeLocale(ctx, listener) {
  if (typeof ctx.locale.subscribe === 'function') return ctx.locale.subscribe(listener)
  return ctx.on('locale/change', listener)
}

function localeRevision(ctx) {
  if (typeof ctx.locale.getSnapshot === 'function') return ctx.locale.getSnapshot().revision
  if (typeof ctx.locale.getLocale === 'function') return ctx.locale.getLocale().revision ?? 0
  return 0
}

function copyText(value) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(value).then(() => true, () => false)
  }
  return Promise.resolve(false)
}

function requestError(body, status) {
  const message = body && typeof body.error === 'string' ? body.error : `Request failed (${status}).`
  const error = new Error(message)
  error.status = status
  error.code = body && typeof body.code === 'string' ? body.code : ''
  error.chatCall = body ? body.chatCall : null
  error.run = body ? body.run : null
  return error
}

async function request(path, init) {
  const response = await fetch(API + path, {
    credentials: 'same-origin',
    ...init,
    headers: init && init.body ? { 'content-type': 'application/json', ...(init.headers || {}) } : init?.headers,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw requestError(body, response.status)
  return body
}

function stageAfter(run) {
  const stages = run && run.stages || []
  const index = stages.findIndex(stage => stage.id === run.current)
  if (index < 0 || index >= stages.length - 1) return null
  const next = stages[index + 1]
  return next ? next.id : null
}

function previousGate(run) {
  const stages = run && run.stages || []
  const index = stages.findIndex(stage => stage.id === run.current)
  if (index <= 0) return null
  const previous = stages[index - 1]
  if (previous && previous.humanGate && previous.status === 'done') return previous.id
  return null
}

function fill(template, values) {
  return Object.keys(values).reduce((text, key) => text.split(`{${key}}`).join(values[key]), template)
}

function nextMessage(run, t) {
  const code = run && run.next && run.next.code
  if (code === 'await_decision') {
    const gate = (run.gate || (run.next && run.next.gate)) || 'design_review'
    return t(`gate.${gate}`)
  }
  if (code === 'leave_gate') {
    const nxt = stageAfter(run)
    if (!nxt || nxt === 'done') return t('gate.approvedDone')
    return fill(t('gate.approvedNext'), { stage: nxt })
  }
  if (code === 'retry_in_chat') return t('next.retry_in_chat')
  if (code === 'done') return t('next.done')
  const gate = previousGate(run)
  if (gate) return fill(t('next.executeAfterGate'), { stage: run.current, gate })
  return t('next.execute_in_chat')
}

function artifactRows(run, t) {
  const expected = Array.isArray(run.expectedArtifacts) ? run.expectedArtifacts : null
  if (!expected) {
    return (run.artifactFiles || run.files || []).map(file => {
      const name = typeof file === 'string' ? file : file.name
      const relative = typeof file === 'string' ? `${run.artifactDir}/${file}` : file.relativePath
      const placeholder = typeof file === 'string' ? false : file.placeholder
      return { key: name, label: placeholder ? `${relative} — ${t('artifact.placeholder')}` : relative }
    })
  }
  const known = new Set(expected.map(item => item.file))
  const rows = expected.map(item => {
    let suffix = ''
    if (!item.present) suffix = ` — ${t('artifact.missing')}`
    else if (item.placeholder) suffix = ` — ${t('artifact.placeholder')}`
    return { key: item.file, label: `${item.relativePath}${suffix}` }
  })
  for (const file of run.artifactFiles || []) {
    if (!file || known.has(file.name)) continue
    const suffix = file.placeholder ? ` — ${t('artifact.placeholder')}` : ''
    rows.push({ key: file.name, label: `${file.relativePath}${suffix}` })
  }
  return rows
}

function runMeta(item, t) {
  const base = `${item.current} · ${statusLabel(t, item.status)}`
  if (!item.iterate) return base
  return `${base} · ${fill(t('iterate.line'), { n: String(item.iterate), stage: item.iterateStage || item.current })}`
}

function platformMessage(run, t) {
  if (!run || !run.platform || !run.platform.unconfirmed || !run.platform.unconfirmed.length) return ''
  const verified = run.platform.verified && run.platform.verified.length
    ? run.platform.verified.join(', ')
    : t('platform.none')
  return fill(t('platform.pending'), { verified, unconfirmed: run.platform.unconfirmed.join(', ') })
}

function statusLabel(t, status) {
  const key = `status.${status}`
  const label = t(key)
  return label === key ? status : label
}

function FeatureDevPanel(props) {
  const ctx = props.ctx
  const revision = React.useSyncExternalStore(
    (listener) => subscribeLocale(ctx, listener),
    () => localeRevision(ctx),
    () => 0,
  )
  const t = ctx.locale.bind(NS)
  void revision
  const [runs, setRuns] = React.useState([])
  const [selectedId, setSelectedId] = React.useState(null)
  const [run, setRun] = React.useState(null)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [starting, setStarting] = React.useState(false)
  const [description, setDescription] = React.useState('')
  const [risks, setRisks] = React.useState(() => new Set())
  const [adversarialDesign, setAdversarialDesign] = React.useState(false)
  const [adversarialCode, setAdversarialCode] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [note, setNote] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [rejecting, setRejecting] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [hostExecution, setHostExecution] = React.useState(null)
  const alive = React.useRef(true)
  const requestSeq = React.useRef(0)

  React.useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const loadRun = React.useCallback(async (id, seq) => {
    if (!id) {
      if (alive.current && seq === requestSeq.current) setRun(null)
      return
    }
    const body = await request(`/runs/${encodeURIComponent(id)}`)
    if (!alive.current || seq !== requestSeq.current) return
    setRun(body.run)
  }, [])

  const refresh = React.useCallback(async (preferId) => {
    const seq = ++requestSeq.current
    const body = await request('/runs')
    if (!alive.current || seq !== requestSeq.current) return
    setError('')
    if (body.execution) setHostExecution(body.execution)
    const nextRuns = body.runs || []
    setRuns(nextRuns)
    const wanted = preferId || selectedId
    const still = nextRuns.some(item => item.id === wanted)
    const fallback = nextRuns.find(item => item.current !== 'done') || nextRuns[0]
    const id = still ? wanted : (fallback ? fallback.id : null)
    setSelectedId(id)
    await loadRun(id, seq)
  }, [loadRun, selectedId])

  React.useEffect(() => {
    let cancelled = false
    refresh().catch(err => { if (!cancelled && alive.current) setError(err.message) })
      .finally(() => { if (!cancelled && alive.current) setLoading(false) })
    return () => { cancelled = true }
    // Initial read only. Later refreshes go through the buttons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyOutcome(body) {
    if (body && body.run) setRun(body.run)
    if (body && body.applied === false && body.code === 'awaiting_decision') {
      setNotice(nextMessage(body.run, t))
      return
    }
    setNotice(body && body.message || '')
  }

  async function act(work) {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (err) {
      if (!alive.current) return
      if (err && err.code === 'needs_session') {
        if (err.run) setRun(err.run)
        setNotice(t('next.execute_in_chat'))
        if (selectedId) refresh(selectedId).catch(() => {})
        return
      }
      setError(err && err.message ? err.message : String(err))
      if (selectedId) refresh(selectedId).catch(() => {})
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  function toggleRisk(id) {
    setRisks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const awaiting = Boolean(run && run.next && run.next.code === 'await_decision')
  const canAdvance = Boolean(run && run.next && run.next.advanceEnabled)
  const showChat = Boolean(run && run.chatCall && run.chatCall.text && !canAdvance && run.next && (run.next.code === 'execute_in_chat' || run.next.code === 'retry_in_chat'))
  const h = React.createElement

  return h('div', { className: 'fdv-shell' },
    h('div', { className: 'fdv-scroll' },
      h('header', { className: 'fdv-header' },
        h('div', null,
          h('p', { className: 'fdv-kicker' }, t('panel.kicker')),
          h('h1', { className: 'fdv-title' }, PANEL_LABEL),
        ),
        h('div', { className: 'fdv-actions' },
          h('button', {
            type: 'button',
            className: 'fdv-btn',
            disabled: busy,
            onClick: () => act(() => refresh(selectedId)),
          }, t('action.refresh')),
          h('button', {
            type: 'button',
            className: 'fdv-btn fdv-btn-primary',
            disabled: busy,
            onClick: () => { setStarting(value => !value); setRejecting(false) },
          }, t('action.start')),
        ),
      ),
      error ? h('div', { className: 'fdv-error', role: 'alert' }, error) : null,
      notice && !error ? h('div', { className: 'fdv-banner', role: 'status' }, notice) : null,
      starting ? h('form', {
        className: 'fdv-card',
        onSubmit: (event) => {
          event.preventDefault()
          act(async () => {
            const summary = description.trim()
            if (!summary) return
            const body = await request('/runs', {
              method: 'POST',
              body: JSON.stringify({
                featureSummary: summary,
                risks: [...risks],
                adversarialDesign,
                adversarialCode,
              }),
            })
            setDescription('')
            setRisks(new Set())
            setAdversarialDesign(false)
            setAdversarialCode(false)
            setStarting(false)
            applyOutcome(body)
            await refresh(body.run && body.run.id)
          })
        },
      },
      h('label', { className: 'fdv-field' },
        h('span', null, t('field.description')),
        h('textarea', {
          rows: 4,
          required: true,
          placeholder: t('field.example'),
          value: description,
          onChange: (event) => setDescription(event.target.value),
        }),
        h('span', { className: 'fdv-muted' }, t('start.help')),
      ),
      h('fieldset', { className: 'fdv-field' },
        h('legend', null, t('field.risks')),
        h('div', { className: 'fdv-risks' }, RISKS.map(risk => h('label', { key: risk.id },
          h('input', {
            type: 'checkbox',
            checked: risks.has(risk.id),
            onChange: () => toggleRisk(risk.id),
          }),
          t(risk.key),
        ))),
      ),
      h('div', { className: 'fdv-risks' },
        h('label', null,
          h('input', { type: 'checkbox', checked: adversarialDesign, onChange: () => setAdversarialDesign(value => !value) }),
          t('field.adversarialDesign'),
        ),
        h('label', null,
          h('input', { type: 'checkbox', checked: adversarialCode, onChange: () => setAdversarialCode(value => !value) }),
          t('field.adversarialCode'),
        ),
      ),
      h('div', { className: 'fdv-actions' },
        h('button', { type: 'submit', className: 'fdv-btn fdv-btn-primary', disabled: busy || !description.trim() }, t('action.start')),
        h('button', { type: 'button', className: 'fdv-btn', onClick: () => setStarting(false) }, t('action.cancel')),
      )) : null,
      loading ? h('p', { className: 'fdv-muted' }, t('loading')) : null,
      !loading && runs.length === 0 && !starting ? h('section', { className: 'fdv-card fdv-empty' },
        h('h2', null, t('empty.title')),
        h('p', { className: 'fdv-muted' }, t('empty.body')),
        h('ol', { className: 'fdv-steps' },
          h('li', null, t('empty.step1')),
          h('li', null, t('empty.step2')),
          h('li', null, t('empty.step3')),
        ),
        h('p', { className: 'fdv-path' }, t('empty.path')),
        hostExecution && hostExecution.engine === false ? h('p', { className: 'fdv-muted' }, t('empty.engineOff')) : null,
        h('div', null, h('button', {
          type: 'button',
          className: 'fdv-btn fdv-btn-primary',
          onClick: () => setStarting(true),
        }, t('action.start'))),
      ) : null,
      !loading && runs.length > 0 ? h('div', { className: 'fdv-layout' },
        h('section', { className: 'fdv-card' },
          h('h2', { className: 'fdv-kicker' }, t('runs')),
          runs.map(item => h('button', {
            type: 'button',
            key: item.id,
            className: 'fdv-run',
            'aria-current': item.id === selectedId ? 'true' : undefined,
            onClick: () => act(async () => {
              setSelectedId(item.id)
              setRejecting(false)
              const seq = ++requestSeq.current
              await loadRun(item.id, seq)
            }),
          },
          h('span', { className: 'fdv-run-title' }, item.featureSummary || item.id),
          h('span', { className: 'fdv-run-meta' }, runMeta(item, t)),
          )),
        ),
        run ? h('section', { className: 'fdv-card' },
          h('p', { className: 'fdv-muted' }, t('board.shared')),
          h('p', { className: 'fdv-muted' }, run.featureSummary),
          h('p', { className: 'fdv-path' }, `${t('field.runId')} ${run.id}`),
          h('p', { className: 'fdv-muted' }, [
            run.adversarialDesign ? t('field.adversarialDesign') : null,
            run.adversarialCode ? t('field.adversarialCode') : null,
            (run.risks || []).join(', '),
          ].filter(Boolean).join(' · ') || t('adversarial.off')),
          run.implementTools && run.implementTools.length
            ? h('p', { className: 'fdv-muted' }, `${t('implement.tools')}: ${run.implementTools.join(', ')}`)
            : run.current === 'implement'
              ? h('p', { className: 'fdv-muted' }, t('implement.unrestricted'))
              : null,
          run.execution && run.execution.engine === false ? h('p', { className: 'fdv-muted' }, t('empty.engineOff')) : null,
          h('div', { className: 'fdv-banner', role: 'status' }, nextMessage(run, t)),
          run.iterate ? h('p', { className: 'fdv-muted' }, fill(t('iterate.line'), { n: String(run.iterate), stage: run.iterateStage || run.current })) : null,
          platformMessage(run, t) ? h('div', { className: 'fdv-banner', role: 'status' }, platformMessage(run, t)) : null,
          showChat ? h('div', { className: 'fdv-field' },
            h('span', null, t('chat.label')),
            h('span', { className: 'fdv-muted' }, t('chat.help')),
            h('div', { className: 'fdv-call' },
              h('input', {
                type: 'text',
                readOnly: true,
                value: run.chatCall.text,
                'aria-label': t('chat.label'),
                onFocus: (event) => event.target.select(),
              }),
              h('button', {
                type: 'button',
                className: 'fdv-btn',
                onClick: () => {
                  copyText(run.chatCall.text).then((ok) => {
                    if (!alive.current) return
                    setCopied(ok)
                    if (ok) setTimeout(() => { if (alive.current) setCopied(false) }, 1500)
                  })
                },
              }, copied ? t('chat.copied') : t('chat.copy')),
            ),
            h('span', { className: 'fdv-muted' }, t('chat.manual')),
          ) : null,
          h('ol', { className: 'fdv-board' }, (run.stages || []).map(stage => h('li', {
            key: stage.id,
            className: 'fdv-stage',
            'data-status': stage.status,
            'data-current': stage.id === run.current ? 'true' : undefined,
          },
          h('span', { className: 'fdv-dot', 'aria-hidden': 'true' }),
          h('span', null,
            stage.title,
            h('span', { className: 'fdv-id' }, stage.id),
            stage.humanGate ? h('span', { className: 'fdv-badge' }, t('stage.gate')) : null,
          ),
          h('span', { className: 'fdv-status' }, statusLabel(t, stage.status)),
          ))),
          h('div', { className: awaiting ? 'fdv-actions fdv-prominent' : 'fdv-actions' },
            h('button', {
              type: 'button',
              className: canAdvance ? 'fdv-btn fdv-btn-primary' : 'fdv-btn',
              disabled: busy || !canAdvance,
              title: canAdvance ? undefined : t('next.advanceDisabled'),
              onClick: () => act(async () => {
                const body = await request(`/runs/${encodeURIComponent(run.id)}/advance`, { method: 'POST', body: '{}' })
                applyOutcome(body)
                await refresh(run.id)
              }),
            }, t('action.advance')),
            h('button', {
              type: 'button',
              className: awaiting ? 'fdv-btn fdv-btn-primary' : 'fdv-btn',
              disabled: busy || !awaiting,
              onClick: () => act(async () => {
                const body = await request(`/runs/${encodeURIComponent(run.id)}/approve`, {
                  method: 'POST',
                  body: JSON.stringify({ note }),
                })
                setNote('')
                setRejecting(false)
                applyOutcome(body)
                await refresh(run.id)
              }),
            }, t('action.approve')),
            h('button', {
              type: 'button',
              className: awaiting ? 'fdv-btn fdv-btn-danger' : 'fdv-btn',
              disabled: busy || !awaiting,
              onClick: () => setRejecting(value => !value),
            }, t('action.reject')),
          ),
          awaiting ? h('label', { className: 'fdv-field' },
            h('span', null, t('field.note')),
            h('input', {
              type: 'text',
              value: note,
              onChange: (event) => setNote(event.target.value),
            }),
          ) : null,
          rejecting && awaiting ? h('form', {
            onSubmit: (event) => {
              event.preventDefault()
              act(async () => {
                const body = await request(`/runs/${encodeURIComponent(run.id)}/reject`, {
                  method: 'POST',
                  body: JSON.stringify({ reason }),
                })
                setReason('')
                setRejecting(false)
                applyOutcome(body)
                await refresh(run.id)
              })
            },
          },
          h('label', { className: 'fdv-field' },
            h('span', null, t('field.reason')),
            h('textarea', {
              rows: 3,
              required: true,
              value: reason,
              onChange: (event) => setReason(event.target.value),
            }),
          ),
          h('button', { type: 'submit', className: 'fdv-btn fdv-btn-danger', disabled: busy }, t('action.confirmReject')),
          ) : null,
          (run.notes || []).length ? h('ul', { className: 'fdv-files' }, run.notes.map((noteLine, index) => h('li', { key: index }, noteLine))) : null,
          h('div', null,
            h('h2', { className: 'fdv-kicker' }, t('artifact')),
            h('p', { className: 'fdv-muted' }, t('artifact.folder')),
            h('p', { className: 'fdv-path' }, run.artifactDir),
            h('p', { className: 'fdv-path' }, run.artifactPath),
            run.expectedRelative ? h('p', { className: 'fdv-muted' }, `${t('artifact.current')} ${run.expectedRelative}`) : null,
            h('ul', { className: 'fdv-files' }, artifactRows(run, t).map(row => h('li', { key: row.key }, row.label))),
          ),
        ) : null,
      ) : null,
    ),
  )
}

const inject = ['slots', 'locale', 'layout']

function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'feature-dev: dictionaries')
  ctx.effect(() => injectStyles(), 'feature-dev: stylesheet')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
  }, function FeatureDevMain() {
    return React.createElement(FeatureDevPanel, { ctx })
  }))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: PANEL_ORDER,
    label: PANEL_LABEL,
  }, FeatureDevIcon))
}

module.exports = { apply, inject, name: 'feature-dev-panel', PANEL_ID, PANEL_LABEL }
