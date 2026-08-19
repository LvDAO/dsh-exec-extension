import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const require = createRequire(import.meta.url)
const native = require(join(dirname(fileURLToPath(import.meta.url)), 'generated', 'native.js'))

test('wasm parseArgv keeps --model out of the task', () => {
  const parsed = JSON.parse(native.parseArgv(['--model', 'foo', 'prove', 'X']))
  assert.equal(parsed.kind, 'ok')
  assert.equal(parsed.invocation.model, 'foo')
  assert.equal(parsed.invocation.task, 'prove X')
})

test('wasm help lists model effort and provider', () => {
  const parsed = JSON.parse(native.parseArgv(['--help']))
  assert.equal(parsed.kind, 'help')
  assert.match(parsed.text, /--model/)
  assert.match(parsed.text, /--effort/)
  assert.match(parsed.text, /--provider/)
})

test('wasm overlay omits effort when the flag is absent', () => {
  const next = JSON.parse(native.overlaySelection(
    JSON.stringify({ provider: 'p', model: 'm' }),
    JSON.stringify({ model: 'other' }),
  ))
  assert.deepEqual(next, { provider: 'p', model: 'other' })
  assert.equal('reasoningEffort' in next, false)
})
