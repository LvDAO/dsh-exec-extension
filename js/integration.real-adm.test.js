import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { apply, HEADLESS_STARTUP_SERVICE } from './startup.js'

async function importSpecifier(specifier) {
  try {
    return await import(specifier)
  } catch {
    // ESM does not honor NODE_PATH; resolve from extra node_modules roots.
  }
  const roots = [
    process.env.DSH_NODE_MODULES,
    ...(process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : []),
  ].filter((root) => root !== undefined && root !== '')
  for (const root of roots) {
    try {
      const require = createRequire(join(root, 'package.json'))
      const resolved = require.resolve(specifier)
      return await import(pathToFileURL(resolved).href)
    } catch {
      continue
    }
  }
  return undefined
}

test('real AgentDefaultModelConfig overlay: --model is not the task', async (t) => {
  const cordis = await importSpecifier('@deepseek-ai/cordis')
  const adm = await importSpecifier('@deepseek-ai/dsh-agent-default-model')
  const cmdline = await importSpecifier('@deepseek-ai/dsh-cmdline')
  if (cordis === undefined || adm === undefined || cmdline === undefined) {
    t.skip('install @deepseek-ai/dsh (or set NODE_PATH / DSH_NODE_MODULES) to run this check')
    return
  }

  const AgentDefaultModelConfig = adm.default
  const ctx = new cordis.Context()
  await ctx.plugin(AgentDefaultModelConfig, { provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  const baseline = ctx.agentDefaultModel.currentSelection()
  assert.equal(baseline.model, 'deepseek-v4-flash')

  const exits = []
  cmdline.provideCmdline(ctx, {
    args: ['--model', 'deepseek-v4-pro', '--effort', 'max', 'prove', 'X'],
    exit: (code) => { exits.push(code) },
  })
  apply(ctx)

  assert.equal(ctx.get(HEADLESS_STARTUP_SERVICE).task, 'prove X')
  assert.deepEqual(ctx.agentDefaultModel.currentSelection(), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-pro',
    reasoningEffort: 'max',
  })
  assert.deepEqual(exits, [])
  await ctx.fiber.dispose()
})

test('real AgentDefaultModelConfig --print-selection exits 0 without headlessStartup', async (t) => {
  const cordis = await importSpecifier('@deepseek-ai/cordis')
  const adm = await importSpecifier('@deepseek-ai/dsh-agent-default-model')
  const cmdline = await importSpecifier('@deepseek-ai/dsh-cmdline')
  if (cordis === undefined || adm === undefined || cmdline === undefined) {
    t.skip('install @deepseek-ai/dsh (or set NODE_PATH / DSH_NODE_MODULES) to run this check')
    return
  }

  const AgentDefaultModelConfig = adm.default
  const ctx = new cordis.Context()
  await ctx.plugin(AgentDefaultModelConfig, { provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  const exits = []
  let out = ''
  const previous = cmdline.internals.stdout
  cmdline.internals.stdout = { write(chunk) { out += chunk; return true } }
  try {
    cmdline.provideCmdline(ctx, {
      args: ['--print-selection', '--config', 'model=deepseek-v4-pro'],
      exit: (code) => { exits.push(code) },
    })
    apply(ctx)
  } finally {
    cmdline.internals.stdout = previous
  }

  assert.equal(JSON.parse(out).model, 'deepseek-v4-pro')
  assert.equal(ctx.get(HEADLESS_STARTUP_SERVICE), undefined)
  assert.deepEqual(exits, [0])
  await ctx.fiber.dispose()
})
