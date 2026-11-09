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
  'empty.body': 'Start a run with a short description. Optional risk flags decide whether the adversarial stage is on the board.',
  'action.start': 'Start',
  'action.advance': 'Advance',
  'action.approve': 'Approve',
  'action.reject': 'Reject',
  'action.refresh': 'Refresh',
  'action.cancel': 'Cancel',
  'action.confirmReject': 'Reject stage',
  'field.description': 'Feature summary',
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
  'gate.design_review': 'Design review is waiting for a decision.',
  'gate.human_diff': 'Human diff is waiting for a decision.',
  'gate.approved': 'Approved. Advance to continue.',
  'advance.needsAgent': 'Executing a stage needs the feature_dev tool in a session. Approve, reject, and leaving an approved gate work here.',
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
  'empty.body': '用一段功能说明开始。可选风险标记决定阶段板上是否包含对抗审查。',
  'action.start': '开始',
  'action.advance': '推进',
  'action.approve': '通过',
  'action.reject': '驳回',
  'action.refresh': '刷新',
  'action.cancel': '取消',
  'action.confirmReject': '确认驳回',
  'field.description': '功能说明',
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
  'gate.design_review': '设计评审正在等待决定。',
  'gate.human_diff': '人工差异正在等待决定。',
  'gate.approved': '已通过。点推进继续。',
  'advance.needsAgent': '执行阶段需要在会话里调用 feature_dev。通过、驳回，以及离开已通过的门禁，可以在这里操作。',
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

async function request(path, init) {
  const response = await fetch(API + path, {
    credentials: 'same-origin',
    ...init,
    headers: init && init.body ? { 'content-type': 'application/json', ...(init.headers || {}) } : init?.headers,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body && typeof body.error === 'string' ? body.error : `Request failed (${response.status}).`
    throw new Error(message)
  }
  return body
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
  const alive = React.useRef(true)

  React.useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const loadRun = React.useCallback(async (id) => {
    if (!id) {
      setRun(null)
      return
    }
    const body = await request(`/runs/${encodeURIComponent(id)}`)
    if (alive.current) setRun(body.run)
  }, [])

  const refresh = React.useCallback(async (preferId) => {
    const body = await request('/runs')
    if (!alive.current) return
    const nextRuns = body.runs || []
    setRuns(nextRuns)
    const wanted = preferId || selectedId
    const still = nextRuns.some(item => item.id === wanted)
    const fallback = nextRuns.find(item => item.current !== 'done') || nextRuns[0]
    const id = still ? wanted : (fallback ? fallback.id : null)
    setSelectedId(id)
    if (id) await loadRun(id)
    else if (alive.current) setRun(null)
  }, [loadRun, selectedId])

  React.useEffect(() => {
    let cancelled = false
    refresh().catch(err => { if (!cancelled && alive.current) setError(err.message) })
      .finally(() => { if (!cancelled && alive.current) setLoading(false) })
    return () => { cancelled = true }
    // Initial read only. Later refreshes go through the buttons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function act(work) {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (err) {
      if (alive.current) {
        setError(err.message || String(err))
        if (selectedId) {
          refresh(selectedId).catch(() => {})
        }
      }
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

  const gate = run && run.gate
  const decision = Boolean(run && run.humanGate && (run.blocked || run.status === 'active' || run.status === 'approved'))
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
            const body = await request('/runs', {
              method: 'POST',
              body: JSON.stringify({
                featureSummary: description,
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
            setNotice(body.message || '')
            await refresh(body.run && body.run.id)
          })
        },
      },
      h('label', { className: 'fdv-field' },
        h('span', null, t('field.description')),
        h('textarea', {
          rows: 4,
          required: true,
          value: description,
          onChange: (event) => setDescription(event.target.value),
        }),
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
        h('button', { type: 'submit', className: 'fdv-btn fdv-btn-primary', disabled: busy }, t('action.start')),
        h('button', { type: 'button', className: 'fdv-btn', onClick: () => setStarting(false) }, t('action.cancel')),
      )) : null,
      loading ? h('p', { className: 'fdv-muted' }, t('loading')) : null,
      !loading && runs.length === 0 && !starting ? h('section', { className: 'fdv-card fdv-empty' },
        h('h2', null, t('empty.title')),
        h('p', { className: 'fdv-muted' }, t('empty.body')),
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
              await loadRun(item.id)
            }),
          },
          h('span', { className: 'fdv-run-title' }, item.featureSummary || item.id),
          h('span', { className: 'fdv-run-meta' }, `${item.current} · ${item.current === 'done' ? t('phase.completed') : t('phase.active')}`),
          )),
        ),
        run ? h('section', { className: 'fdv-card' },
          h('p', { className: 'fdv-muted' }, run.featureSummary),
          h('p', { className: 'fdv-muted' }, [
            run.adversarialDesign ? t('field.adversarialDesign') : null,
            run.adversarialCode ? t('field.adversarialCode') : null,
            (run.risks || []).join(', '),
          ].filter(Boolean).join(' · ') || t('adversarial.off')),
          gate ? h('div', { className: 'fdv-banner', role: 'status' }, t(`gate.${gate}`)) : null,
          run.approved ? h('div', { className: 'fdv-banner', role: 'status' }, t('gate.approved')) : null,
          h('ol', { className: 'fdv-board' }, (run.stages || []).map(stage => h('li', {
            key: stage.id,
            className: 'fdv-stage',
            'data-status': stage.status,
          },
          h('span', { className: 'fdv-dot', 'aria-hidden': 'true' }),
          h('span', null, stage.title, h('span', { className: 'fdv-id' }, stage.id)),
          h('span', { className: 'fdv-status' }, t(`status.${stage.status}`) === `status.${stage.status}` ? stage.status : t(`status.${stage.status}`)),
          ))),
          h('div', { className: decision ? 'fdv-actions fdv-prominent' : 'fdv-actions' },
            h('button', {
              type: 'button',
              className: 'fdv-btn',
              disabled: busy || run.blocked || run.current === 'done',
              onClick: () => act(async () => {
                const body = await request(`/runs/${encodeURIComponent(run.id)}/advance`, { method: 'POST', body: '{}' })
                setNotice(body.message || '')
                setRun(body.run)
                await refresh(run.id)
              }),
            }, t('action.advance')),
            h('button', {
              type: 'button',
              className: decision ? 'fdv-btn fdv-btn-primary' : 'fdv-btn',
              disabled: busy || !decision || run.approved,
              onClick: () => act(async () => {
                const body = await request(`/runs/${encodeURIComponent(run.id)}/approve`, {
                  method: 'POST',
                  body: JSON.stringify({ note }),
                })
                setNote('')
                setRejecting(false)
                setNotice(body.message || '')
                setRun(body.run)
                await refresh(run.id)
              }),
            }, t('action.approve')),
            h('button', {
              type: 'button',
              className: decision ? 'fdv-btn fdv-btn-danger' : 'fdv-btn',
              disabled: busy || !decision,
              onClick: () => setRejecting(value => !value),
            }, t('action.reject')),
          ),
          decision ? h('label', { className: 'fdv-field' },
            h('span', null, t('field.note')),
            h('input', {
              type: 'text',
              value: note,
              onChange: (event) => setNote(event.target.value),
            }),
          ) : null,
          rejecting ? h('form', {
            onSubmit: (event) => {
              event.preventDefault()
              act(async () => {
                const body = await request(`/runs/${encodeURIComponent(run.id)}/reject`, {
                  method: 'POST',
                  body: JSON.stringify({ reason }),
                })
                setReason('')
                setRejecting(false)
                setRun(body.run)
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
            h('p', { className: 'fdv-path' }, run.artifactDir),
            h('ul', { className: 'fdv-files' }, (run.files || []).map(file => h('li', { key: file }, `${run.artifactDir}/${file}`))),
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
