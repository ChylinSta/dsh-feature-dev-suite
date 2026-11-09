import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createFeatureApi, DEFAULT_IMPLEMENT_TOOLS, readState, writeState } from '../lib/core.js'

function engineCapturing(scripts) {
  return {
    start(request) {
      scripts.push(request.script)
      return {
        result: Promise.resolve({
          stopReason: 'completed',
          value: { artifact: '# notes\n' },
          agentsStarted: 1,
        }),
        async dispose() {},
      }
    },
  }
}

async function workspace(options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'feature-dev-tools-'))
  const scripts = []
  const api = createFeatureApi({ root, engine: engineCapturing(scripts), agent: { id: 'session' }, ...options })
  return { root, api, scripts, cleanup: () => rm(root, { recursive: true, force: true }) }
}

test('a new run snapshots the default implement allowlist into the prompt, not an agent() option', async () => {
  const { root, api, scripts, cleanup } = await workspace()
  try {
    const started = await api.start({ featureSummary: 'Compare two folders' })
    assert.deepEqual(started.run.implementTools, [...DEFAULT_IMPLEMENT_TOOLS])
    assert.match(started.message, /implementTools: read, write, edit, apply_patch, grep, glob, bash, todo_write/)
    const state = readState(root, started.run.id)
    state.current = 'implement'
    state.statusByStage.implement = 'active'
    writeState(state)
    assert.match(api.getStatus(started.run.id).next.hint, /Implement may call only: read, write/)
    const executed = await api.advance(started.run.id)
    assert.equal(executed.code, 'executed')
    assert.equal(scripts.length, 1)
    assert.match(scripts[0], /Tool allowlist: call only these tools: read, write, edit, apply_patch, grep, glob, bash, todo_write/)
    assert.match(scripts[0], /Do not call feature_dev, workflow, subagent/)
    assert.match(scripts[0], /\{ label: 'implementer' \}/)
    assert.doesNotMatch(scripts[0], /label: 'implementer',\s*tools/)
  } finally {
    await cleanup()
  }
})

test('legacy runs and an explicit opt-out keep the implement prompt unrestricted', async () => {
  const { root, api, scripts, cleanup } = await workspace()
  try {
    const started = await api.start({ featureSummary: 'Already in flight', implementTools: false })
    assert.equal(started.run.implementTools, null)
    const state = readState(root, started.run.id)
    delete state.implementTools
    state.current = 'implement'
    state.statusByStage.implement = 'active'
    writeState(state)
    await api.advance(started.run.id)
    assert.equal(readState(root, started.run.id).implementTools, undefined)
    assert.doesNotMatch(scripts[0], /Tool allowlist/)
    const custom = createFeatureApi({
      root,
      implementTools: ['read', 'edit'],
      engine: engineCapturing(scripts),
      agent: { id: 'session' },
    })
    const narrowed = await custom.start({ featureSummary: 'Only read and edit' })
    assert.deepEqual(narrowed.run.implementTools, ['read', 'edit'])
    assert.throws(() => createFeatureApi({ root, implementTools: [] }), /implementTools must be a non-empty list/)
    assert.throws(() => createFeatureApi({ root, implementTools: ['bad name'] }), /not a tool name/)
  } finally {
    await cleanup()
  }
})

test('leaving human_diff finishes the run instead of asking for another execute', async () => {
  const { root, api, cleanup } = await workspace()
  try {
    const started = await api.start({ featureSummary: 'Ship the diff' })
    const state = readState(root, started.run.id)
    state.current = 'human_diff'
    state.statusByStage.human_diff = 'approved'
    writeState(state)
    const approvedHint = api.getStatus(started.run.id)
    assert.match(approvedHint.next.hint, /marks the run done/)
    assert.match(approvedHint.next.hint, /does not execute another stage/)
    const left = await api.advance(started.run.id)
    assert.equal(left.code, 'left_gate')
    assert.match(left.message, /Left approved gate human_diff → done/)
    assert.match(left.message, /did not execute another stage/)
    assert.equal(left.run.current, 'done')
    assert.equal(left.run.next.code, 'done')
  } finally {
    await cleanup()
  }
})
