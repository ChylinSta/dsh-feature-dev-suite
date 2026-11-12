import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createFeatureApi, readState, runFeatureDev, writeState } from '../lib/core.js'

function write(dir, name, body) {
  writeFileSync(path.join(dir, name), body.endsWith('\n') ? body : `${body}\n`)
}

function snapshot(dir) {
  const out = {}
  for (const name of readdirSync(dir)) {
    if (name === 'state.json') continue
    out[name] = readFileSync(path.join(dir, name), 'utf8')
  }
  return out
}

function folderDiffFixture(root) {
  const dir = path.join(root, '.feature-dev', 'folder-diff-v1')
  mkdirSync(dir, { recursive: true })
  write(dir, 'requirements.md', '# FolderDiff — Requirements\n\nCompare two folders.\n')
  write(dir, 'design.md', '# FolderDiff — Design\n\nRead-only compare. Bind 127.0.0.1.\n')
  write(dir, 'design_review.md', [
    '# FolderDiff — Design review',
    '',
    '**Human gate: waived.** No person is in the loop for this run.',
    '',
    'Waiver recorded: proceed to test cases and implementation without a human approval step.',
    '',
  ].join('\n'))
  write(dir, 'testcases.md', '# FolderDiff — Test cases\n\nSame, different, and orphans.\n')
  write(dir, 'verify.md', [
    '# FolderDiff — Verify',
    '',
    'Command host: Linux, Node.js 22',
    '',
    '`npm test` — pass.',
    '',
    '## Not verified here',
    '',
    '- Windows `cmd.exe /c start` was not executed. Linux `xdg-open` did launch.',
    '',
  ].join('\n'))
  write(dir, 'human_diff.md', [
    '# FolderDiff — Human spot-check',
    '',
    'The autonomous review gate was waived in design_review.md.',
    '',
    '## Please look at these',
    '',
    '- Windows open still needs a person on a Windows machine.',
    '',
  ].join('\n'))
  write(dir, 'iterate-1.md', [
    '# FolderDiff — Iterate 1',
    '',
    '## Fixed',
    '',
    'CLI exit codes.',
    '',
    '## Tests',
    '',
    '`npm test` — 43 passing.',
    '',
    '## Still rough',
    '',
    '- Windows `start` is still untested on Windows.',
    '',
  ].join('\n'))
  write(dir, 'iterate-2.md', [
    '# FolderDiff — Iterate 2',
    '',
    '## Changed',
    '',
    'Copy between folders.',
    '',
    '## Tested',
    '',
    '`npm test` — 50 passing.',
    '',
    '## Still rough',
    '',
    '- Windows start is still untested on Windows.',
    '',
  ].join('\n'))
  write(dir, 'iterate-3.md', [
    '# FolderDiff — Iterate 3',
    '',
    '## Changed',
    '',
    'Folder copy progress and UTF-16.',
    '',
    '## Tested',
    '',
    '`npm test` — 56 passing. Browser on Linux.',
    '',
    '## Still rough',
    '',
    '- Windows `start` and drive-letter browse are still untested on Windows.',
    '- There is no operating-system file dialog.',
    '',
  ].join('\n'))
  mkdirSync(path.join(root, '.feature-dev', 'notes'))
  mkdirSync(path.join(root, '.feature-dev', 'scratch'))
  writeFileSync(path.join(root, '.feature-dev', 'scratch', 'hello.txt'), 'ignore\n')
  return dir
}

test('unprefixed FolderDiff names are listed, adopted, and can start iterate-4', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'feature-dev-adopt-'))
  try {
    const dir = folderDiffFixture(root)
    const api = createFeatureApi({ root })
    const before = snapshot(dir)
    assert.equal(existsSync(path.join(dir, 'state.json')), false)

    const listed = await runFeatureDev(undefined, { action: 'list', workspaceRoot: root }, undefined, undefined)
    assert.match(listed.text, /- folder-diff-v1 current=done iterate=3 iterateStage=done/)
    assert.doesNotMatch(listed.text, /notes/)
    assert.doesNotMatch(listed.text, /scratch/)
    assert.deepEqual((await api.listRuns()).map((run) => run.id), ['folder-diff-v1'])

    const preview = await runFeatureDev(undefined, {
      action: 'status',
      runId: 'folder-diff-v1',
      workspaceRoot: root,
    }, undefined, undefined)
    assert.equal(existsSync(path.join(dir, 'state.json')), false)
    assert.match(preview.text, /current: done/)
    assert.match(preview.text, /iterate: 3/)
    assert.match(preview.text, /iterateStage: done/)
    assert.match(preview.text, /- requirements\.md requirements present/)
    assert.match(preview.text, /- design\.md design present/)
    assert.match(preview.text, /- design_review\.md design_review present/)
    assert.match(preview.text, /- testcases\.md testcases present/)
    assert.match(preview.text, /- verify\.md verify present/)
    assert.match(preview.text, /- human_diff\.md human_diff present/)
    assert.match(preview.text, /- iterate-1\.md iterate present/)
    assert.match(preview.text, /- iterate-3\.md iterate present/)
    assert.doesNotMatch(preview.text, /01-requirements\.md requirements missing/)
    assert.match(preview.text, /platform: pending platform confirmation: Linux verified; Windows unconfirmed\. This does not block the run\./)
    assert.doesNotMatch(preview.text, /gate: waiting/)
    const previewView = api.getStatus('folder-diff-v1')
    assert.equal(previewView.current, 'done')
    assert.equal(previewView.blocked, false)
    assert.equal(previewView.next.code, 'done')
    assert.deepEqual(previewView.platform.unconfirmed, ['Windows'])
    assert.deepEqual(previewView.platform.verified, ['Linux'])
    assert.equal(previewView.iterate, 3)

    const adopted = await runFeatureDev(undefined, {
      action: 'adopt',
      runId: 'folder-diff-v1',
      workspaceRoot: root,
    }, undefined, undefined)
    assert.equal(adopted.code, 'adopted')
    assert.equal(adopted.applied, true)
    assert.match(adopted.text, /^Adopted folder-diff-v1\./)
    assert.equal(adopted.state.current, 'done')
    assert.equal(adopted.state.iterate, 3)
    assert.equal(adopted.state.iterateStage, 'done')
    assert.equal(adopted.state.statusByStage.design_review, 'done')
    assert.equal(adopted.state.statusByStage.requirements, 'done')
    assert.equal(adopted.state.statusByStage.human_diff, 'done')
    assert.match(adopted.state.notes.join('\n'), /design_review waived in writing/)
    assert.match(adopted.state.notes.join('\n'), /adopted from artifacts/)
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')).runId, 'folder-diff-v1')
    assert.deepEqual(snapshot(dir), before)

    const again = await runFeatureDev(undefined, {
      action: 'adopt',
      runId: 'folder-diff-v1',
      workspaceRoot: root,
    }, undefined, undefined)
    assert.equal(again.code, 'already_tracking')
    assert.equal(again.applied, false)
    assert.equal(again.state.iterate, 3)

    const iterated = await runFeatureDev(undefined, {
      action: 'iterate',
      runId: 'folder-diff-v1',
      workspaceRoot: root,
      scope: 'Confirm Windows open and drive letters',
    }, undefined, undefined)
    assert.equal(iterated.code, 'iterated')
    assert.equal(iterated.state.iterate, 4)
    assert.equal(iterated.state.iterateStage, 'implement')
    assert.equal(iterated.state.current, 'implement')
    assert.equal(iterated.state.statusByStage.requirements, 'done')
    assert.equal(iterated.state.statusByStage.design, 'done')
    assert.equal(iterated.state.statusByStage.design_review, 'done')
    assert.equal(iterated.state.statusByStage.implement, 'active')
    assert.equal(iterated.state.statusByStage.verify, 'pending')
    assert.equal(iterated.state.statusByStage.human_diff, 'pending')
    assert.match(iterated.text, /Reuse the existing requirements and design/)
    assert.match(iterated.text, /sidebarAdvance: no/)
    const iterateFile = readFileSync(path.join(dir, 'iterate-4.md'), 'utf8')
    assert.match(iterateFile, /Confirm Windows open and drive letters/)
    assert.match(iterateFile, /Windows `start` and drive-letter browse are still untested on Windows/)
    assert.match(iterateFile, /operating-system file dialog/)
    assert.match(iterateFile, /implement → verify → human_diff/)
    assert.equal(readFileSync(path.join(dir, 'requirements.md'), 'utf8'), before['requirements.md'])
    assert.equal(readFileSync(path.join(dir, 'human_diff.md'), 'utf8'), before['human_diff.md'])
    assert.equal(readFileSync(path.join(dir, 'iterate-3.md'), 'utf8'), before['iterate-3.md'])
    assert.equal(existsSync(path.join(dir, '04-impl-notes.md')), false)
    assert.equal(existsSync(path.join(dir, '01-requirements.md')), false)

    const board = api.getStatus('folder-diff-v1')
    assert.equal(board.iterate, 4)
    assert.equal(board.iterateStage, 'implement')
    assert.equal(board.next.code, 'execute_in_chat')
    assert.equal(board.next.advanceEnabled, false)
    assert.match(board.chatCall.text, /runId "folder-diff-v1"/)
    assert.match(board.chatCall.text, /executes the current stage \(implement\)/)
    const iterateRow = board.expectedArtifacts.find((item) => item.file === 'iterate-4.md')
    assert.equal(iterateRow.present, true)
    assert.equal(iterateRow.placeholder, true)
    assert.equal(board.expectedArtifacts.find((item) => item.stageId === 'requirements').file, 'requirements.md')
    assert.match(board.next.hint, /iterate-4\.md/)

    await assert.rejects(() => api.advance('folder-diff-v1'), (error) => {
      assert.equal(error.code, 'needs_session')
      assert.equal(error.status, 409)
      assert.match(error.chatCall.text, /folder-diff-v1/)
      return true
    })
    assert.equal(readState(root, 'folder-diff-v1').current, 'implement')
    assert.equal(readState(root, 'folder-diff-v1').iterate, 4)

    write(dir, 'verify.md', `${before['verify.md']}\nplatform: linux verified\nplatform: windows verified\n`)
    const cleared = await runFeatureDev(undefined, {
      action: 'status',
      runId: 'folder-diff-v1',
      workspaceRoot: root,
    }, undefined, undefined)
    assert.doesNotMatch(cleared.text, /^platform:/m)
    assert.equal(cleared.state.current, 'implement')
    assert.equal(cleared.state.blocked, undefined)
    assert.equal(api.getStatus('folder-diff-v1').platform, null)
    assert.equal(api.getStatus('folder-diff-v1').next.advanceEnabled, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('filename aliases prefer the numbered file, and a partial iterate stays on its stage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'feature-dev-alias-'))
  try {
    const both = path.join(root, '.feature-dev', 'both-names')
    mkdirSync(both, { recursive: true })
    write(both, '01-requirements.md', '# Numbered requirements\n\nThe numbered file wins.\n')
    write(both, 'requirements.md', '# Alias requirements\n\nThis one is extra.\n')
    const impl = path.join(root, '.feature-dev', 'impl-alias')
    mkdirSync(impl, { recursive: true })
    write(impl, 'requirements.md', '# Impl alias\n\nGoal.\n')
    write(impl, 'impl_notes.md', '# Implement notes\n\nShipped the compare.\n')
    const partial = path.join(root, '.feature-dev', 'partial-iter')
    mkdirSync(partial, { recursive: true })
    write(partial, 'requirements.md', '# Partial\n\nGoal.\n')
    write(partial, 'design.md', '# Design\n\nKeep it.\n')
    write(partial, 'design_review.md', 'Human gate: waived.\n')
    write(partial, 'verify.md', 'Command host: Linux, Node.js 22\n\n`npm test` passed.\n')
    write(partial, 'human_diff.md', '# Human diff\n\nLook at the tree.\n')
    write(partial, 'iterate-1.md', [
      '# Iterate 1',
      '',
      '_Status: in progress_',
      '_Iterate stage: verify_',
      '',
      '## Scope',
      '',
      'Column alignment.',
      '',
    ].join('\n'))
    const linuxOnly = path.join(root, '.feature-dev', 'linux-only')
    mkdirSync(linuxOnly, { recursive: true })
    write(linuxOnly, 'requirements.md', '# Linux only\n\nGoal.\n')
    write(linuxOnly, 'verify.md', 'Command host: Linux\n\n`npm test` passed. No other target is named.\n')

    const bothStatus = await runFeatureDev(undefined, { action: 'status', runId: 'both-names', workspaceRoot: root }, undefined, undefined)
    assert.match(bothStatus.text, /- 01-requirements\.md requirements present/)
    assert.doesNotMatch(bothStatus.text, /- requirements\.md requirements/)

    const implStatus = await runFeatureDev(undefined, { action: 'status', runId: 'impl-alias', workspaceRoot: root }, undefined, undefined)
    assert.match(implStatus.text, /- impl_notes\.md implement present/)
    assert.doesNotMatch(implStatus.text, /04-impl-notes\.md implement missing/)

    const partialStatus = await runFeatureDev(undefined, { action: 'status', runId: 'partial-iter', workspaceRoot: root }, undefined, undefined)
    assert.match(partialStatus.text, /iterate: 1/)
    assert.match(partialStatus.text, /iterateStage: verify/)
    assert.equal(partialStatus.state.current, 'verify')
    assert.equal(partialStatus.state.statusByStage.requirements, 'done')
    assert.equal(partialStatus.state.statusByStage.verify, 'active')
    assert.equal(partialStatus.state.statusByStage.human_diff, 'pending')
    assert.doesNotMatch(partialStatus.text, /gate: waiting/)

    const linux = await runFeatureDev(undefined, { action: 'status', runId: 'linux-only', workspaceRoot: root }, undefined, undefined)
    assert.doesNotMatch(linux.text, /platform:/)
    assert.notEqual(linux.state.statusByStage.verify, 'blocked')

    const broken = path.join(root, '.feature-dev', 'broken-run')
    mkdirSync(broken, { recursive: true })
    const requirements = '# Broken\n\nKeep this file.\n'
    write(broken, 'requirements.md', requirements)
    writeFileSync(path.join(broken, 'state.json'), '{')
    const ids = (await createFeatureApi({ root }).listRuns()).map((run) => run.id)
    assert.ok(ids.includes('broken-run'))
    const repaired = await runFeatureDev(undefined, { action: 'adopt', runId: 'broken-run', workspaceRoot: root }, undefined, undefined)
    assert.equal(repaired.code, 'adopted')
    assert.equal(JSON.parse(readFileSync(path.join(broken, 'state.json'), 'utf8')).runId, 'broken-run')
    assert.equal(readFileSync(path.join(broken, 'requirements.md'), 'utf8').includes('Keep this file'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('iterate refuses a fresh run and then skips back to verify on a later increment', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'feature-dev-loop-'))
  const scripts = []
  const engine = {
    start(request) {
      scripts.push(request.script)
      return {
        result: Promise.resolve({
          stopReason: 'completed',
          value: { artifact: '# Changes\n\nslice\n' },
          agentsStarted: 1,
        }),
        async dispose() {},
      }
    },
  }
  try {
    const api = createFeatureApi({ root, engine, agent: { id: 'session' } })
    const started = await api.start({ featureSummary: 'Risky folder sync', risks: ['security_or_data'] })
    await assert.rejects(() => runFeatureDev(undefined, {
      action: 'iterate',
      runId: started.run.id,
      workspaceRoot: root,
    }, undefined, undefined), (error) => {
      assert.equal(error.code, 'iterate_not_ready')
      return true
    })
    const state = readState(root, started.run.id)
    state.current = 'done'
    state.statusByStage.human_diff = 'done'
    state.statusByStage.done = 'done'
    writeState(state)
    const iterated = await runFeatureDev(engine, {
      action: 'iterate',
      runId: started.run.id,
      workspaceRoot: root,
      scope: 'UNIQUE_SCOPE windows confirmation',
    }, { id: 'session' }, undefined)
    assert.equal(iterated.state.current, 'implement')
    assert.equal(iterated.state.iterate, 1)
    const runDir = path.join(root, '.feature-dev', started.run.id)
    unlinkSync(path.join(runDir, '01-requirements.md'))
    write(runDir, 'requirements.md', '# Requirements\n\nUNIQUE_REQ_SENTENCE from the alias.\n')
    const advanced = await api.advance(started.run.id)
    assert.equal(advanced.code, 'executed')
    assert.equal(advanced.run.current, 'verify')
    assert.equal(advanced.run.iterateStage, 'verify')
    assert.equal(advanced.run.stages.find((stage) => stage.id === 'adversarial_code').status, 'pending')
    assert.equal(existsSync(path.join(runDir, '04-impl-notes.md')), false)
    const iterateFile = readFileSync(path.join(runDir, 'iterate-1.md'), 'utf8')
    assert.match(iterateFile, /UNIQUE_SCOPE windows confirmation/)
    assert.match(iterateFile, /## implement/)
    assert.match(iterateFile, /slice/)
    assert.match(scripts[0], /UNIQUE_REQ_SENTENCE/)
    assert.match(scripts[0], /UNIQUE_SCOPE windows confirmation/)
    assert.match(scripts[0], /Do not start a new requirements, design, or design_review cycle/)
    assert.equal(advanced.run.next.advanceEnabled, true)

    const panel = createFeatureApi({ root, engine })
    const gate = readState(root, started.run.id)
    gate.current = 'human_diff'
    gate.iterateStage = 'human_diff'
    gate.statusByStage.human_diff = 'approved'
    gate.statusByStage.verify = 'done'
    writeState(gate)
    const waiting = panel.getStatus(started.run.id)
    assert.equal(waiting.next.code, 'leave_gate')
    assert.equal(waiting.next.advanceEnabled, true)
    assert.equal(waiting.chatCall, null)
    assert.equal(waiting.iterate, 1)
    const left = await panel.advance(started.run.id)
    assert.equal(left.code, 'left_gate')
    assert.equal(left.run.current, 'done')
    assert.equal(left.run.iterateStage, 'done')
    assert.equal(left.run.next.advanceEnabled, false)
    assert.match(left.message, /did not execute another stage/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
