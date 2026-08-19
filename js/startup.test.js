import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, HEADLESS_STARTUP_SERVICE, internals } from './startup.js'

function mockCtx(args, selection = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }) {
  const exits = []
  let saveCalls = 0
  const ctx = {
    agentDefaultModel: {
      currentSelection: () => ({ ...selection }),
      async saveSelection() {
        saveCalls += 1
        throw new Error('saveSelection must not be called')
      },
    },
    cmdlineArgs: { get: () => args },
    provided: /** @type {Record<string, unknown>} */ ({}),
    provide(name, value) {
      this.provided[name] = value
    },
    get(name) {
      if (name === 'cmdlineArgs') return this.cmdlineArgs
      if (name === 'appExit') return (code) => { exits.push(code) }
      if (name === 'agentDefaultModel') return this.agentDefaultModel
      return undefined
    },
  }
  return { ctx, exits, saveCalls: () => saveCalls }
}

test('apply provides headlessStartup.task and overlays model/effort in memory', () => {
  const { ctx, exits, saveCalls } = mockCtx(['--model', 'deepseek-v4-pro', '--effort', 'max', 'prove', 'X'])
  apply(ctx)
  assert.deepEqual(ctx.provided[HEADLESS_STARTUP_SERVICE], { task: 'prove X' })
  assert.deepEqual(ctx.agentDefaultModel.currentSelection(), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-pro',
    reasoningEffort: 'max',
  })
  assert.deepEqual(exits, [])
  assert.equal(saveCalls(), 0)
})

test('omitting --model and --effort matches the deployment selection', () => {
  const { ctx } = mockCtx(['run', 'the', 'tests'], {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    reasoningEffort: 'high',
  })
  apply(ctx)
  assert.deepEqual(ctx.provided[HEADLESS_STARTUP_SERVICE], { task: 'run the tests' })
  assert.deepEqual(ctx.agentDefaultModel.currentSelection(), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    reasoningEffort: 'high',
  })
})

test('two contexts with different --model values do not clobber each other', () => {
  const a = mockCtx(['--model', 'model-a', 't'])
  const b = mockCtx(['--model', 'model-b', 't'])
  apply(a.ctx)
  apply(b.ctx)
  assert.equal(a.ctx.agentDefaultModel.currentSelection().model, 'model-a')
  assert.equal(b.ctx.agentDefaultModel.currentSelection().model, 'model-b')
})

test('--help lists flags, exits 0, and does not provide the service', () => {
  const { ctx, exits } = mockCtx(['--help'])
  let out = ''
  const previous = internals.stdout
  internals.stdout = { write(chunk) { out += chunk; return true } }
  try {
    apply(ctx)
  } finally {
    internals.stdout = previous
  }
  assert.match(out, /--model/)
  assert.match(out, /--effort/)
  assert.match(out, /--provider/)
  assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE], undefined)
  assert.deepEqual(exits, [0])
})

test('unknown option exits 1 without providing the service', () => {
  const { ctx, exits } = mockCtx(['--sandbox', 't'])
  let err = ''
  const previous = internals.stderr
  internals.stderr = { write(chunk) { err += chunk; return true } }
  try {
    apply(ctx)
  } finally {
    internals.stderr = previous
  }
  assert.match(err, /unknown option/)
  assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE], undefined)
  assert.deepEqual(exits, [1])
})

test('--model overlay leaves a settings.yaml byte-identical', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-extension-'))
  const settings = join(dir, 'settings.yaml')
  const original = 'agent-default-model:\n  provider: deepseek-official\n  model: deepseek-v4-flash\n'
  writeFileSync(settings, original)
  const { ctx } = mockCtx(['--model', 'deepseek-v4-pro', '--effort', 'max', 't'])
  apply(ctx)
  ctx.agentDefaultModel.currentSelection()
  assert.equal(readFileSync(settings, 'utf8'), original)
})
