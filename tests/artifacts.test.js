import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createFeatureApi, runFeatureDev } from '../lib/core.js'

function byFile(run) {
  return Object.fromEntries(run.expectedArtifacts.map((item) => [item.file, item]))
}

test('status lists the FolderDiff files and marks skeletons, real notes, and gaps', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'feature-dev-files-'))
  try {
    const api = createFeatureApi({ root })
    const started = await api.start({ featureSummary: 'Compare two folders and show which files differ' })
    const files = byFile(started.run)
    assert.equal(files['00-brief.md'].present, true)
    assert.equal(files['00-brief.md'].placeholder, false)
    assert.equal(files['01-requirements.md'].placeholder, true)
    assert.equal(files['01-requirements.md'].stageId, 'requirements')
    assert.equal(files['02-design.md'].present, false)
    assert.equal(files['02-design-review.md'].present, false)
    assert.equal(files['06-summary.md'].stageId, 'human_diff')
    assert.equal(files['06-full.diff'].stageId, 'human_diff')
    assert.equal(files['06-full.diff'].present, false)
    assert.equal(files['03b-adversarial-design.md'], undefined)
    assert.equal(files['04b-adversarial-code.md'], undefined)
    assert.match(started.message, /expected:/)
    assert.match(started.message, /- 01-requirements.md requirements placeholder/)
    assert.match(started.message, /- 02-design.md design missing/)
    assert.match(started.message, /- 06-full.diff human_diff missing/)

    const requirements = path.join(root, '.feature-dev', started.run.id, '01-requirements.md')
    writeFileSync(requirements, '# Goal\n\nShow file differences between two folders.\n')
    const status = await runFeatureDev(undefined, {
      action: 'status',
      runId: started.run.id,
      workspaceRoot: root,
    }, undefined, undefined)
    assert.match(status.text, /- 01-requirements.md requirements present/)
    assert.equal(readFileSync(requirements, 'utf8').includes('(skeleton placeholder)'), false)

    const deep = await api.start({
      featureSummary: 'Risky folder sync',
      risks: ['security_or_data'],
    })
    const deepFiles = byFile(deep.run)
    assert.equal(deepFiles['03b-adversarial-design.md'].present, false)
    assert.equal(deepFiles['03b-adversarial-design.md'].stageId, 'adversarial_design')
    assert.equal(deepFiles['04b-adversarial-code.md'].stageId, 'adversarial_code')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
