/**
 * Hosted WASM helpers. Live argv is commander in `command.js`.
 * `overlaySelection` is what `startup.js` calls; `parseArgv` / `helpText`
 * are narrower and must not be mistaken for the user-facing CLI.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { makeProgram, resolveInvocation } from './command.js'

const require = createRequire(import.meta.url)
const native = require(join(dirname(fileURLToPath(import.meta.url)), 'generated', 'native.js'))

function liveParse(args) {
  const program = makeProgram()
  program.exitOverride()
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} })
  program.action(() => {})
  program.parse(args, { from: 'user' })
  return resolveInvocation(program, {
    isTTY: () => true,
    readStdin: () => {
      throw new Error('stdin should not be read')
    },
    readFile: () => '',
  })
}

test('hosted wasm parseArgv keeps --model out of the task', () => {
  const parsed = JSON.parse(native.parseArgv(['--model', 'foo', 'prove', 'X']))
  assert.equal(parsed.kind, 'ok')
  assert.equal(parsed.invocation.model, 'foo')
  assert.equal(parsed.invocation.task, 'prove X')
})

test('hosted wasm help lists only model effort and provider', () => {
  const parsed = JSON.parse(native.parseArgv(['--help']))
  assert.equal(parsed.kind, 'help')
  assert.match(parsed.text, /--model/)
  assert.match(parsed.text, /--effort/)
  assert.match(parsed.text, /--provider/)
  assert.doesNotMatch(parsed.text, /--sandbox/)
})

test('wasm overlay omits effort when the flag is absent', () => {
  const next = JSON.parse(native.overlaySelection(
    JSON.stringify({ provider: 'p', model: 'm' }),
    JSON.stringify({ model: 'other' }),
  ))
  assert.deepEqual(next, { provider: 'p', model: 'other' })
  assert.equal('reasoningEffort' in next, false)
})

test('live commander accepts --sandbox; hosted wasm parseArgv does not', () => {
  const live = liveParse(['--sandbox', 'read-only', 't'])
  assert.equal(live.permissionMode, 'read-only')
  const wasm = JSON.parse(native.parseArgv(['--sandbox', 'read-only', 't']))
  assert.equal(wasm.kind, 'error')
  assert.match(wasm.message, /unknown option/)
  assert.match(wasm.message, /--sandbox/)
})
