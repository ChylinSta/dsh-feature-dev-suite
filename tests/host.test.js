import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createFeatureApi, runFeatureDev } from '../lib/core.js'
import { readState, writeState } from '../lib/core.js'

async function workspace() {
  const root = await mkdtemp(path.join(tmpdir(), 'feature-dev-'))
  return { root, api: createFeatureApi({ root }), cleanup: () => rm(root, { recursive: true, force: true }) }
}

test('start shares the host stage order and the tool text', async () => {
  const { root, api, cleanup } = await workspace()
  try {
    await assert.rejects(() => api.start({ featureSummary: '  ' }), /featureSummary is required/)
    const started = await api.start({
      featureSummary: 'Add an export button',
      risks: ['security_or_data'],
      adversarialDesign: false,
    })
    assert.match(started.message, /^Started feature-dev run\./)
    assert.equal(started.code, 'started')
    assert.equal(started.applied, true)
    assert.equal(started.run.featureSummary, 'Add an export button')
    assert.equal(started.run.current, 'requirements')
    assert.equal(started.run.artifactDir, `.feature-dev/${started.run.id}`)
    assert.equal(started.run.expectedFile, '01-requirements.md')
    assert.equal(started.run.next.code, 'execute_in_chat')
    assert.equal(started.run.next.advanceEnabled, false)
    assert.equal(started.run.execution.session, false)
    assert.match(started.run.chatCall.text, new RegExp(`runId "${started.run.id}"`))
    assert.equal(started.run.artifactFiles.find((file) => file.name === '01-requirements.md').placeholder, true)
    const dir = path.join(root, '.feature-dev', started.run.id)
    assert.equal(readdirSync(dir).some((name) => name.endsWith('.tmp')), false)
    JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8'))
    assert.ok(started.run.stages.some((stage) => stage.id === 'adversarial_design'))
    assert.ok(started.run.stages.some((stage) => stage.id === 'adversarial_code'))
    const plain = await api.start({ featureSummary: 'Tiny copy change', risks: ['small_local_change'] })
    assert.equal(plain.run.stages.some((stage) => stage.id === 'adversarial_design'), false)
    const viaTool = await runFeatureDev(undefined, {
      action: 'status',
      runId: started.run.id,
      workspaceRoot: root,
    }, undefined, undefined)
    assert.match(viaTool.text, new RegExp(`^runId: ${started.run.id}`))
    assert.match(viaTool.text, /next: execute_in_chat/)
    assert.match(viaTool.text, /sidebarAdvance: no/)
    assert.match(viaTool.text, /artifact: \.feature-dev\//)
    assert.equal(viaTool.state.current, 'requirements')
  } finally {
    await cleanup()
  }
})

test('approve and advance leave a blocked gate without an agent', async () => {
  const { root, api, cleanup } = await workspace()
  try {
    const started = await api.start({ featureSummary: 'Gate path' })
    const state = readState(root, started.run.id)
    state.current = 'design_review'
    state.statusByStage.design_review = 'blocked'
    writeState(state)
    const blocked = await api.advance(started.run.id)
    assert.equal(blocked.code, 'awaiting_decision')
    assert.equal(blocked.applied, false)
    assert.match(blocked.message, /Cannot advance: design_review is waiting/)
    assert.equal(blocked.run.gate, 'design_review')
    assert.equal(blocked.run.next.advanceEnabled, false)
    const approved = await api.approve(started.run.id, 'rollback is described')
    assert.match(approved.message, /Approved design_review\. Call advance to continue\./)
    assert.match(approved.message, /only leaves the gate/)
    assert.match(approved.message, /does not execute testcases/)
    assert.match(approved.run.next.hint, /does not execute testcases/)
    assert.match(approved.run.next.hint, /executes testcases/)
    assert.equal(approved.run.approved, true)
    assert.equal(approved.run.next.code, 'leave_gate')
    assert.equal(approved.run.next.advanceEnabled, true)
    assert.equal(approved.run.chatCall, null)
    assert.match(approved.run.notes.at(-1), /rollback is described/)
    const next = await api.advance(started.run.id)
    assert.equal(next.code, 'left_gate')
    assert.match(next.message, /Left approved gate design_review → testcases/)
    assert.match(next.message, /This advance did not execute testcases/)
    assert.match(next.message, /Call advance again in this chat to execute testcases/)
    assert.equal(next.run.current, 'testcases')
    assert.equal(next.run.next.code, 'execute_in_chat')
    assert.equal(next.run.next.advanceEnabled, false)
    assert.match(next.run.chatCall.text, /did not execute testcases/)
    assert.match(next.run.next.hint, /did not execute testcases/)
    assert.equal(next.run.stages.find((stage) => stage.id === 'design_review').status, 'done')
  } finally {
    await cleanup()
  }
})

test('reject returns to the previous stage and execution still requires an agent', async () => {
  const { root, api, cleanup } = await workspace()
  try {
    const started = await api.start({ featureSummary: 'Needs a reason' })
    const state = readState(root, started.run.id)
    state.current = 'human_diff'
    state.statusByStage.human_diff = 'blocked'
    writeState(state)
    const rejected = await api.reject(started.run.id, 'diff drops the empty state')
    assert.match(rejected.message, /Rejected human_diff, returned to verify/)
    assert.equal(rejected.run.current, 'verify')
    assert.equal(rejected.run.stages.find((stage) => stage.id === 'human_diff').status, 'pending')
    const before = readState(root, rejected.run.id)
    let caught = null
    try {
      await api.advance(rejected.run.id)
    } catch (error) {
      caught = error
    }
    assert.match(caught.message, /calling agent/)
    assert.equal(caught.code, 'needs_session')
    assert.equal(caught.status, 409)
    assert.match(caught.chatCall.text, new RegExp(rejected.run.id))
    const after = readState(root, rejected.run.id)
    assert.deepEqual(after.notes, before.notes)
    assert.equal(after.statusByStage.verify, 'active')
    assert.deepEqual((await api.listRuns()).map((run) => run.id), [started.run.id])
  } finally {
    await cleanup()
  }
})

test('listing skips junk entries and keeps the newest readable run first', async () => {
  const { root, api, cleanup } = await workspace()
  try {
    const older = await api.start({ featureSummary: 'Older run' })
    const newer = await api.start({ featureSummary: 'Newer run' })
    const home = path.join(root, '.feature-dev')
    const olderState = readState(root, older.run.id)
    olderState.updatedAt = '2020-01-01T00:00:00.000Z'
    writeFileSync(path.join(home, older.run.id, 'state.json'), JSON.stringify(olderState))
    writeFileSync(path.join(home, 'fd-not-a-dir'), 'ignore')
    mkdirSync(path.join(home, 'notes'))
    mkdirSync(path.join(home, 'fd-bad'))
    writeFileSync(path.join(home, 'fd-bad', 'state.json'), '{')
    mkdirSync(path.join(home, 'fd-shape'))
    writeFileSync(path.join(home, 'fd-shape', 'state.json'), JSON.stringify({ runId: 'fd-other' }))
    assert.deepEqual((await api.listRuns()).map((run) => run.id), [newer.run.id, older.run.id])
  } finally {
    await cleanup()
  }
})

test('the shared runner executes a stage only for a caller that has a session agent', async () => {
  const { root, cleanup } = await workspace()
  const engine = {
    start() {
      return {
        result: Promise.resolve({
          stopReason: 'completed',
          value: { artifact: '# Goal\n\nCompare two folders.\n' },
          agentsStarted: 1,
        }),
        async dispose() {},
      }
    },
  }
  try {
    const panel = createFeatureApi({ root, engine })
    const chat = createFeatureApi({ root, engine, agent: { id: 'session-agent' } })
    const started = await panel.start({ featureSummary: 'Folder compare' })
    await assert.rejects(() => panel.advance(started.run.id), (error) => {
      assert.equal(error.code, 'needs_session')
      return true
    })
    const executed = await chat.advance(started.run.id)
    assert.equal(executed.code, 'executed')
    assert.equal(executed.run.current, 'design')
    assert.equal(executed.run.execution.session, true)
    assert.equal(executed.run.next.advanceEnabled, true)
    assert.match(readFileSync(path.join(root, '.feature-dev', started.run.id, '01-requirements.md'), 'utf8'), /Compare two folders/)
    const viewed = panel.getStatus(started.run.id)
    assert.equal(viewed.current, 'design')
    assert.equal(viewed.execution.session, false)
    assert.equal(viewed.execution.engine, true)
    assert.equal(viewed.next.code, 'execute_in_chat')
    assert.equal(viewed.next.advanceEnabled, false)
    assert.match(viewed.chatCall.text, new RegExp(started.run.id))
    assert.match(viewed.next.hint, /sidebar/)
  } finally {
    await cleanup()
  }
})
