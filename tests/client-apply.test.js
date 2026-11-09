import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

test('the client factory registers the sidebar row and the main panel', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let factory
  const context = vm.createContext({
    window: {
      __ModuleLoader__: {
        load(payload) { factory = payload.factory },
      },
    },
  })
  vm.runInContext(source, context)
  const plugin = factory((specifier) => {
    if (specifier === 'react') return { createElement: () => null }
    throw new Error(`unexpected require: ${specifier}`)
  })
  assert.deepEqual(Array.from(plugin.inject), ['slots', 'locale', 'layout'])
  assert.equal(plugin.PANEL_ID, 'feature-dev')

  const registered = []
  plugin.apply({
    effect(run) {
      const dispose = run()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register() { return () => {} },
    },
    slots: {
      inject(_name, register) { register() },
      register(options, component) {
        registered.push({ options, component })
      },
    },
  })

  const sidebar = registered.find(entry => entry.options.name === 'sidebar.panellist')
  const main = registered.find(entry => entry.options.name === 'main')
  assert.equal(sidebar.options.id, 'feature-dev')
  assert.equal(sidebar.options.label, '功能开发 / Feature Dev')
  assert.equal(typeof sidebar.component, 'function')
  assert.equal(main.options.key, 'feature-dev')
  assert.equal(typeof main.component, 'function')
})
