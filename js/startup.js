/**
 * Replacement for `@deepseek-ai/dsh-headless/startup`.
 *
 * Official app-CLI pattern: `parseCmdline` + commander. Overlay of
 * `ctx.agentDefaultModel.currentSelection()` stays in-process (Rust WASM)
 * and never calls `saveSelection()`. The provided `headlessStartup` object
 * still has `task` for stock `headless-runner`; extra fields are for
 * sandbox-policy / approval / tools rows that inject this service.
 *
 * @module dsh-exec-extension/startup
 */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCmdline, internals } from '@deepseek-ai/dsh-cmdline'
import { io, makeProgram, resolveInvocation } from './command.js'
import { installAutoApprove, installOutputHooks } from './output.js'

const require = createRequire(import.meta.url)
const native = require(join(dirname(fileURLToPath(import.meta.url)), 'generated', 'native.js'))

export { internals, io }

/** Stable Cordis plugin name (row id is `exec-extension-startup`). */
export const name = 'dsh-exec-extension'

/** Wait for argv and the selection service we overlay. */
export const inject = ['cmdlineArgs', 'agentDefaultModel']

/** Service provided here and injected by stock `headless-runner`. */
export const HEADLESS_STARTUP_SERVICE = 'headlessStartup'

/**
 * @typedef {object} ModelSelection
 * @property {string} provider
 * @property {string} model
 * @property {'off' | 'high' | 'max'} [reasoningEffort]
 */

/**
 * Overlay this-process flags onto every `currentSelection()` read in this process.
 *
 * @param {{ agentDefaultModel: { currentSelection: () => ModelSelection } }} ctx
 * @param {{ model?: string, provider?: string, effort?: 'off' | 'high' | 'max' }} overrides
 */
function installOverlay(ctx, overrides) {
  const service = ctx.agentDefaultModel
  const original = service.currentSelection.bind(service)
  service.currentSelection = () => {
    const base = original()
    return JSON.parse(native.overlaySelection(JSON.stringify(base), JSON.stringify(overrides)))
  }
}

/**
 * @param {(fn: () => () => void) => void} [effect]
 * @param {() => void} restore
 */
function onDispose(effect, restore) {
  if (typeof effect === 'function') effect(() => restore)
}

function runnerIo() {
  return require('@deepseek-ai/dsh-headless').internals
}

/** Tests replace `runnerIo` so `--format json` / `-o` do not wrap the real headless module. */
export const bindings = { runnerIo }

/**
 * @param {{
 *   agentDefaultModel: { currentSelection: () => ModelSelection, saveSelection?: unknown },
 *   provide: (name: string, value: unknown) => void,
 *   get: (name: string) => unknown,
 *   effect?: (fn: () => () => void) => void,
 *   on?: (event: string, handler: (...args: unknown[]) => unknown) => (() => void) | void,
 * }} ctx
 */
export function apply(ctx) {
  const program = makeProgram()
  program.action(() => {
    const invocation = resolveInvocation(program, io)
    installOverlay(ctx, invocation.overrides)

    for (const { key, value } of invocation.env) {
      const had = Object.prototype.hasOwnProperty.call(process.env, key)
      const previous = process.env[key]
      process.env[key] = value
      onDispose(ctx.effect, () => {
        if (had) {
          if (previous === undefined) delete process.env[key]
          else process.env[key] = previous
        } else {
          delete process.env[key]
        }
      })
    }

    if (invocation.cwd !== process.cwd()) {
      const previous = process.cwd()
      process.chdir(invocation.cwd)
      onDispose(ctx.effect, () => {
        process.chdir(previous)
      })
    }

    if (invocation.printSelection) {
      internals.stdout.write(`${JSON.stringify(ctx.agentDefaultModel.currentSelection(), null, 2)}\n`)
      const exit = ctx.get('appExit')
      if (typeof exit === 'function') exit(0)
      return
    }

    if (invocation.timeoutMs !== undefined) {
      const timer = setTimeout(() => {
        internals.stderr.write('error: dsh-exec-extension: timed out\n')
        const exit = ctx.get('appExit')
        if (typeof exit === 'function') exit(1)
      }, invocation.timeoutMs)
      onDispose(ctx.effect, () => {
        clearTimeout(timer)
      })
    }

    if (invocation.autoApprove) installAutoApprove(ctx)

    if (invocation.format === 'json' || invocation.outputPath !== undefined) {
      installOutputHooks({
        ctx,
        format: invocation.format,
        outputPath: invocation.outputPath,
        cmdline: internals,
        runnerIo: bindings.runnerIo(),
      })
    }

    ctx.provide(HEADLESS_STARTUP_SERVICE, {
      task: invocation.task,
      cwd: process.cwd(),
      permissionMode: invocation.permissionMode,
      approvalPolicy: invocation.approvalPolicy,
      autoApprove: invocation.autoApprove,
      ...invocation.toolsMode !== undefined ? { toolsMode: invocation.toolsMode } : {},
      format: invocation.format,
    })
  })
  parseCmdline(ctx, program)
}
