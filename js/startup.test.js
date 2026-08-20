import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { io } from './command.js'
import { apply, HEADLESS_STARTUP_SERVICE, internals, bindings } from './startup.js'

io.isTTY = () => true
io.readStdin = () => {
  throw new Error('startup tests must not read stdin')
}

function mockCtx(args, selection = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }) {
  const exits = []
  const disposers = []
  const listeners = []
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
    effect(factory) {
      disposers.push(factory())
    },
    on(event, handler) {
      listeners.push({ event, handler })
      return () => {}
    },
  }
  return {
    ctx,
    exits,
    listeners,
    saveCalls: () => saveCalls,
    dispose() {
      for (const restore of disposers.splice(0).reverse()) restore()
    },
  }
}

function withCaptured(stream, run) {
  let text = ''
  const previous = internals[stream]
  internals[stream] = { write(chunk) { text += chunk; return true } }
  try {
    run()
    return text
  } finally {
    internals[stream] = previous
  }
}

test('apply provides headlessStartup.task and overlays model/effort in memory', () => {
  const { ctx, exits, saveCalls, dispose } = mockCtx(['--model', 'deepseek-v4-pro', '--effort', 'max', 'prove', 'X'])
  try {
    apply(ctx)
    const startup = ctx.provided[HEADLESS_STARTUP_SERVICE]
    assert.equal(startup.task, 'prove X')
    assert.equal(startup.permissionMode, 'workspace-write')
    assert.equal(startup.approvalPolicy, 'ask')
    assert.equal(startup.format, 'text')
    assert.equal(startup.cwd, process.cwd())
    assert.deepEqual(ctx.agentDefaultModel.currentSelection(), {
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'max',
    })
    assert.deepEqual(exits, [])
    assert.equal(saveCalls(), 0)
  } finally {
    dispose()
  }
})

test('omitting --model and --effort matches the deployment selection', () => {
  const { ctx, dispose } = mockCtx(['run', 'the', 'tests'], {
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
    reasoningEffort: 'high',
  })
  try {
    apply(ctx)
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE].task, 'run the tests')
    assert.deepEqual(ctx.agentDefaultModel.currentSelection(), {
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'high',
    })
  } finally {
    dispose()
  }
})

test('two contexts with different --model values do not clobber each other', () => {
  const a = mockCtx(['--model', 'model-a', 't'])
  const b = mockCtx(['--model', 'model-b', 't'])
  try {
    apply(a.ctx)
    apply(b.ctx)
    assert.equal(a.ctx.agentDefaultModel.currentSelection().model, 'model-a')
    assert.equal(b.ctx.agentDefaultModel.currentSelection().model, 'model-b')
  } finally {
    a.dispose()
    b.dispose()
  }
})

test('--help lists flags, exits 0, and does not provide the service', () => {
  const { ctx, exits, dispose } = mockCtx(['--help'])
  const out = withCaptured('stdout', () => apply(ctx))
  try {
    assert.match(out, /--model/)
    assert.match(out, /--sandbox/)
    assert.match(out, /--file/)
    assert.match(out, /--format/)
    assert.match(out, /--full-auto/)
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE], undefined)
    assert.deepEqual(exits, [0])
  } finally {
    dispose()
  }
})

test('unknown option exits 1 without providing the service', () => {
  const { ctx, exits, dispose } = mockCtx(['--not-a-real-flag', 't'])
  const err = withCaptured('stderr', () => apply(ctx))
  try {
    assert.match(err, /unknown option/)
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE], undefined)
    assert.deepEqual(exits, [1])
  } finally {
    dispose()
  }
})

test('--model overlay leaves a settings.yaml byte-identical', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-extension-'))
  const settings = join(dir, 'settings.yaml')
  const original = 'agent-default-model:\n  provider: deepseek-official\n  model: deepseek-v4-flash\n'
  writeFileSync(settings, original)
  const { ctx, dispose } = mockCtx(['--model', 'deepseek-v4-pro', '--effort', 'max', 't'])
  try {
    apply(ctx)
    ctx.agentDefaultModel.currentSelection()
    assert.equal(readFileSync(settings, 'utf8'), original)
  } finally {
    dispose()
  }
})

test('--print-selection prints JSON and does not provide the service', () => {
  const { ctx, exits, dispose } = mockCtx(['--print-selection', '--model', 'deepseek-v4-pro'])
  const out = withCaptured('stdout', () => apply(ctx))
  try {
    assert.equal(JSON.parse(out).model, 'deepseek-v4-pro')
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE], undefined)
    assert.deepEqual(exits, [0])
  } finally {
    dispose()
  }
})

test('--config overlays after named flags', () => {
  const { ctx, dispose } = mockCtx(['--model', 'a', '--config', 'model=b', 't'])
  try {
    apply(ctx)
    assert.equal(ctx.agentDefaultModel.currentSelection().model, 'b')
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE].task, 't')
  } finally {
    dispose()
  }
})

test('-C changes process.cwd until dispose', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-cwd-'))
  const previous = process.cwd()
  const { ctx, dispose } = mockCtx(['-C', dir, 't'])
  try {
    apply(ctx)
    assert.equal(process.cwd(), dir)
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE].cwd, dir)
    dispose()
    assert.equal(process.cwd(), previous)
  } finally {
    process.chdir(previous)
  }
})

test('--env is process-local and restored on dispose', () => {
  const key = 'DSH_EXEC_EXTENSION_TEST_ENV'
  delete process.env[key]
  const { ctx, dispose } = mockCtx(['--env', `${key}=from-flag`, 't'])
  try {
    apply(ctx)
    assert.equal(process.env[key], 'from-flag')
    dispose()
    assert.equal(process.env[key], undefined)
  } finally {
    delete process.env[key]
  }
})

test('--timeout still provides the task and does not exit immediately', () => {
  const { ctx, exits, dispose } = mockCtx(['--timeout', '60', 't'])
  try {
    apply(ctx)
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE].task, 't')
    assert.deepEqual(exits, [])
  } finally {
    dispose()
  }
})

test('-m is an alias of --model', () => {
  const { ctx, dispose } = mockCtx(['-m', 'alias-model', 't'])
  try {
    apply(ctx)
    assert.equal(ctx.agentDefaultModel.currentSelection().model, 'alias-model')
  } finally {
    dispose()
  }
})

test('--sandbox and --full-auto land on the headlessStartup service', () => {
  const { ctx, listeners, dispose } = mockCtx(['--sandbox', 'read-only', '--full-auto', 't'])
  try {
    apply(ctx)
    const startup = ctx.provided[HEADLESS_STARTUP_SERVICE]
    assert.equal(startup.permissionMode, 'read-only')
    assert.equal(startup.autoApprove, true)
    assert.equal(startup.approvalPolicy, 'ask')
    assert.equal(listeners.some((entry) => entry.event === 'approval/request'), true)
  } finally {
    dispose()
  }
})

test('--tools-mode is published on the service', () => {
  const { ctx, dispose } = mockCtx(['--tools-mode', 'code', 't'])
  try {
    apply(ctx)
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE].toolsMode, 'code')
  } finally {
    dispose()
  }
})

test('--timeout fires appExit(1) after N seconds', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { ctx, exits, dispose } = mockCtx(['--timeout', '1.5', 't'])
  try {
    const err = withCaptured('stderr', () => {
      apply(ctx)
      assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE].task, 't')
      assert.deepEqual(exits, [])
      t.mock.timers.tick(1500)
    })
    assert.deepEqual(exits, [1])
    assert.match(err, /timed out/)
  } finally {
    dispose()
  }
})

test('--api-key sets DEEPSEEK_API_KEY until dispose', () => {
  const previous = process.env.DEEPSEEK_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  const { ctx, dispose } = mockCtx(['--api-key', 'sk-test', 't'])
  try {
    apply(ctx)
    assert.equal(process.env.DEEPSEEK_API_KEY, 'sk-test')
    dispose()
    assert.equal(process.env.DEEPSEEK_API_KEY, undefined)
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = previous
  }
})

test('--provider overlays currentSelection without saveSelection', () => {
  const { ctx, saveCalls, dispose } = mockCtx(['--provider', 'custom-route', 't'])
  try {
    apply(ctx)
    assert.equal(ctx.agentDefaultModel.currentSelection().provider, 'custom-route')
    assert.equal(saveCalls(), 0)
  } finally {
    dispose()
  }
})

test('--approval ask does not install an auto-grant answerer', () => {
  const { ctx, listeners, dispose } = mockCtx(['--approval', 'ask', 't'])
  try {
    apply(ctx)
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE].autoApprove, false)
    assert.equal(listeners.some((entry) => entry.event === 'approval/request'), false)
  } finally {
    dispose()
  }
})

test('--approval never does not install an auto-grant answerer', () => {
  const { ctx, listeners, dispose } = mockCtx(['--approval', 'never', 't'])
  try {
    apply(ctx)
    assert.equal(ctx.provided[HEADLESS_STARTUP_SERVICE].approvalPolicy, 'never')
    assert.equal(listeners.some((entry) => entry.event === 'approval/request'), false)
  } finally {
    dispose()
  }
})

test('--yolo plus --full-auto still never auto-grants', () => {
  const { ctx, listeners, dispose } = mockCtx(['--full-auto', '--yolo', 't'])
  try {
    apply(ctx)
    const startup = ctx.provided[HEADLESS_STARTUP_SERVICE]
    assert.equal(startup.permissionMode, 'danger-full-access')
    assert.equal(startup.approvalPolicy, 'never')
    assert.equal(startup.autoApprove, false)
    assert.equal(listeners.some((entry) => entry.event === 'approval/request'), false)
  } finally {
    dispose()
  }
})

test('--approval allow handler answers allowed-once', async () => {
  const { ctx, listeners, dispose } = mockCtx(['--approval', 'allow', 't'])
  try {
    apply(ctx)
    const handler = listeners.find((entry) => entry.event === 'approval/request')?.handler
    assert.equal(typeof handler, 'function')
    assert.equal(await handler(), 'allowed-once')
  } finally {
    dispose()
  }
})

test('apply --format json writes session/event JSONL and swallows runner text', () => {
  const runner = {
    captured: '',
    stdout: {
      write(chunk) {
        runner.captured += String(chunk)
        return true
      },
    },
  }
  const previous = bindings.runnerIo
  bindings.runnerIo = () => runner
  const { ctx, listeners, dispose } = mockCtx(['--format', 'json', 't'])
  try {
    const out = withCaptured('stdout', () => {
      apply(ctx)
      const handler = listeners.find((entry) => entry.event === 'session/event')?.handler
      assert.equal(typeof handler, 'function')
      handler({}, { type: 'assistant', seq: 3, data: { text: 'hi' } })
      runner.stdout.write('final answer\n')
    })
    assert.equal(out, `${JSON.stringify({ type: 'assistant', seq: 3, data: { text: 'hi' } })}\n`)
    assert.equal(out.includes('final answer'), false)
  } finally {
    bindings.runnerIo = previous
    dispose()
  }
})

test('apply -o writes captured runner text on dispose', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-apply-out-'))
  const outputPath = join(dir, 'last.txt')
  const runner = { stdout: { write() { return true } } }
  const previous = bindings.runnerIo
  bindings.runnerIo = () => runner
  const { ctx, dispose } = mockCtx(['-o', outputPath, 't'])
  try {
    apply(ctx)
    runner.stdout.write('final answer\n')
    dispose()
    assert.equal(readFileSync(outputPath, 'utf8'), 'final answer\n')
  } finally {
    bindings.runnerIo = previous
  }
})
