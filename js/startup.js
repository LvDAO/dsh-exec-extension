/**
 * Replacement for `@deepseek-ai/dsh-headless/startup`.
 * Parses `--model` / `--effort` / `--provider` in Rust (WASM), overlays
 * `ctx.agentDefaultModel.currentSelection()` in process memory, and provides
 * the same `headlessStartup` service the stock runner injects.
 *
 * @module dsh-exec-extension/startup
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const native = require(join(dirname(fileURLToPath(import.meta.url)), 'generated', 'native.js'))

/** Stable Cordis plugin name (row id is `exec-extension-startup`). */
export const name = 'dsh-exec-extension'

/** Wait for argv and the selection service we overlay. */
export const inject = ['cmdlineArgs', 'agentDefaultModel']

/** Service provided here and injected by stock `headless-runner`. */
export const HEADLESS_STARTUP_SERVICE = 'headlessStartup'

/** Process streams; tests substitute captures, matching dsh-cmdline internals. */
export const internals = {
  stdout: process.stdout,
  stderr: process.stderr,
}

/**
 * @typedef {object} ModelSelection
 * @property {string} provider
 * @property {string} model
 * @property {'off' | 'high' | 'max'} [reasoningEffort]
 */

/**
 * @param {unknown} parsed
 * @returns {asserts parsed is { kind: 'help', text: string } | { kind: 'error', message: string, exit_code: number } | { kind: 'ok', invocation: { task: string, model?: string, provider?: string, effort?: 'off' | 'high' | 'max' } }}
 */
function assertParseOutcome(parsed) {
  if (parsed === null || typeof parsed !== 'object' || !('kind' in parsed)) {
    throw new Error('dsh-exec-extension: native parseArgv returned a non-object')
  }
}

/**
 * Overlay this-process flags onto every `currentSelection()` read in this process.
 * Does not call `saveSelection()` and does not touch settings or credentials files.
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
 * Parse argv, overlay the default model for this process, provide `headlessStartup`.
 *
 * @param {{
 *   cmdlineArgs: { get: () => readonly string[] },
 *   agentDefaultModel: { currentSelection: () => ModelSelection, saveSelection?: unknown },
 *   provide: (name: string, value: unknown) => void,
 *   get: (name: string) => ((code: number) => void) | undefined,
 * }} ctx
 */
export function apply(ctx) {
  const args = ctx.get('cmdlineArgs')
  const exit = ctx.get('appExit')
  if (args === undefined || exit === undefined) {
    throw new Error('dsh-exec-extension: the launcher must provide ctx.cmdlineArgs and ctx.appExit before the tree mounts')
  }

  const parsed = JSON.parse(native.parseArgv([...args.get()]))
  assertParseOutcome(parsed)

  switch (parsed.kind) {
    case 'help': {
      internals.stdout.write(parsed.text.endsWith('\n') ? parsed.text : `${parsed.text}\n`)
      exit(0)
      return
    }
    case 'error': {
      const message = parsed.message.endsWith('\n') ? parsed.message : `${parsed.message}\n`
      internals.stderr.write(message)
      exit(parsed.exit_code)
      return
    }
    case 'ok': {
      const { task, model, provider, effort } = parsed.invocation
      /** @type {{ model?: string, provider?: string, effort?: 'off' | 'high' | 'max' }} */
      const overrides = {}
      if (model !== undefined) overrides.model = model
      if (provider !== undefined) overrides.provider = provider
      if (effort !== undefined) overrides.effort = effort
      installOverlay(ctx, overrides)
      ctx.provide(HEADLESS_STARTUP_SERVICE, { task })
      return
    }
    default: {
      const exhaustive = parsed.kind
      throw new Error(`dsh-exec-extension: unknown parse kind ${JSON.stringify(exhaustive)}`)
    }
  }
}
