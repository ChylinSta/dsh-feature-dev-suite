import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { isDesktopShellRequest, isLoopbackAddress, isTrustedRequest } from '../lib/core.js'
import { createFeatureApi, makeFeatureDevRoutes, readState, writeState } from '../lib/core.js'

function mockReq({ method = 'GET', url, headers = {}, body, remoteAddress = '127.0.0.1' }) {
  const stream = Readable.from(body ? [Buffer.from(body)] : [])
  stream.method = method
  stream.url = url
  stream.headers = headers
  stream.socket = { remoteAddress }
  return stream
}

function mockRes() {
  return {
    headersSent: false,
    statusCode: 0,
    body: '',
    writeHead(status) {
      this.statusCode = status
      this.headersSent = true
    },
    end(payload) { this.body = payload },
    destroy() {},
  }
}

const pageHeaders = {
  host: '127.0.0.1:3080',
  origin: 'http://127.0.0.1:3080',
}

test('loopback and desktop shell admission', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress('10.1.2.3'), false)
  const desktop = mockReq({ url: '/api/dsh-feature-dev/runs', headers: { cookie: 'dsh=1' } })
  assert.equal(isDesktopShellRequest(desktop), true)
  assert.equal(isTrustedRequest(desktop), true)
  const cross = mockReq({
    url: '/api/dsh-feature-dev/runs',
    headers: { ...pageHeaders, 'sec-fetch-site': 'cross-site' },
  })
  assert.equal(isTrustedRequest(cross), false)
})

test('routes start a run and refuse a foreign origin', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'feature-dev-http-'))
  try {
    const [{ handler }] = makeFeatureDevRoutes(createFeatureApi({ root }))
    const denied = mockRes()
    await handler(mockReq({
      url: '/api/dsh-feature-dev/runs',
      remoteAddress: '192.168.1.8',
      headers: pageHeaders,
    }), denied)
    assert.equal(denied.statusCode, 403)

    const created = mockRes()
    await handler(mockReq({
      method: 'POST',
      url: '/api/dsh-feature-dev/runs',
      headers: { ...pageHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ featureSummary: 'From the panel', risks: ['small_local_change'] }),
    }), created)
    assert.equal(created.statusCode, 201)
    const payload = JSON.parse(created.body)
    assert.equal(payload.run.current, 'requirements')
    assert.match(payload.message, /Started feature-dev run/)

    const listed = mockRes()
    await handler(mockReq({ url: '/api/dsh-feature-dev/runs', headers: pageHeaders }), listed)
    const listBody = JSON.parse(listed.body)
    assert.equal(listBody.runs.length, 1)
    assert.deepEqual(listBody.execution, { session: false, engine: false })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('advance without a session returns the chat call and a later read shows the gate move', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'feature-dev-http-'))
  try {
    const [{ handler }] = makeFeatureDevRoutes(createFeatureApi({ root, engine: { start() { throw new Error('panel must not start a workflow') } } }))
    const created = mockRes()
    await handler(mockReq({
      method: 'POST',
      url: '/api/dsh-feature-dev/runs',
      headers: { ...pageHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ featureSummary: 'Compare folders' }),
    }), created)
    const runId = JSON.parse(created.body).run.id

    const denied = mockRes()
    await handler(mockReq({
      method: 'POST',
      url: `/api/dsh-feature-dev/runs/${runId}/advance`,
      headers: { ...pageHeaders, 'content-type': 'application/json' },
      body: '{}',
    }), denied)
    assert.equal(denied.statusCode, 409)
    const blocked = JSON.parse(denied.body)
    assert.equal(blocked.code, 'needs_session')
    assert.match(blocked.error, /calling agent/)
    assert.match(blocked.chatCall.text, new RegExp(runId))
    assert.equal(blocked.run.next.advanceEnabled, false)
    assert.equal(blocked.run.current, 'requirements')

    const missing = mockRes()
    await handler(mockReq({ url: '/api/dsh-feature-dev/runs/fd-missing', headers: pageHeaders }), missing)
    assert.equal(missing.statusCode, 404)
    assert.equal(JSON.parse(missing.body).code, 'unknown_run')

    mkdirSync(path.join(root, '.feature-dev', 'fd-bad'))
    writeFileSync(path.join(root, '.feature-dev', 'fd-bad', 'state.json'), '{')
    const unreadable = mockRes()
    await handler(mockReq({ url: '/api/dsh-feature-dev/runs/fd-bad', headers: pageHeaders }), unreadable)
    assert.equal(unreadable.statusCode, 400)
    assert.equal(JSON.parse(unreadable.body).code, 'unreadable_run')

    const state = readState(root, runId)
    state.current = 'design_review'
    state.statusByStage.design_review = 'approved'
    writeState(state)
    const left = mockRes()
    await handler(mockReq({
      method: 'POST',
      url: `/api/dsh-feature-dev/runs/${runId}/advance`,
      headers: { ...pageHeaders, 'content-type': 'application/json' },
      body: '{}',
    }), left)
    assert.equal(left.statusCode, 200)
    assert.equal(JSON.parse(left.body).code, 'left_gate')

    const again = mockRes()
    await handler(mockReq({ url: `/api/dsh-feature-dev/runs/${encodeURIComponent(runId)}`, headers: pageHeaders }), again)
    const refreshed = JSON.parse(again.body).run
    assert.equal(refreshed.current, 'testcases')
    assert.equal(refreshed.next.code, 'execute_in_chat')
    assert.equal(refreshed.next.advanceEnabled, false)

    const stillListed = mockRes()
    await handler(mockReq({ url: '/api/dsh-feature-dev/runs', headers: pageHeaders }), stillListed)
    assert.deepEqual(JSON.parse(stillListed.body).runs.map((run) => run.id), [runId])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
