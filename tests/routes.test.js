import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { isDesktopShellRequest, isLoopbackAddress, isTrustedRequest } from '../lib/core.js'
import { createFeatureApi, makeFeatureDevRoutes } from '../lib/core.js'

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
    assert.equal(JSON.parse(listed.body).runs.length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
