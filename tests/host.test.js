import assert from 'node:assert/strict'
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
    assert.equal(started.run.featureSummary, 'Add an export button')
    assert.equal(started.run.current, 'requirements')
    assert.equal(started.run.artifactDir, `.feature-dev/${started.run.id}`)
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
    assert.match(blocked.message, /Cannot advance: design_review is waiting/)
    assert.equal(blocked.run.gate, 'design_review')
    const approved = await api.approve(started.run.id, 'rollback is described')
    assert.match(approved.message, /Approved design_review\. Call advance to continue\./)
    assert.equal(approved.run.approved, true)
    assert.match(approved.run.notes.at(-1), /rollback is described/)
    const next = await api.advance(started.run.id)
    assert.match(next.message, /Left approved gate design_review → testcases/)
    assert.equal(next.run.current, 'testcases')
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
    await assert.rejects(() => api.advance(rejected.run.id), /calling agent/)
    assert.deepEqual((await api.listRuns()).map((run) => run.id), [started.run.id])
  } finally {
    await cleanup()
  }
})
