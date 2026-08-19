/**
 * Last-message capture and optional JSONL session-event stream.
 * Stock headless-runner writes the final assistant text to its module
 * `internals.stdout`; wrapping that object does not fork the runner.
 * @module dsh-exec-extension/output
 */

import { writeFileSync } from 'node:fs'

/**
 * @param {{
 *   ctx: { on?: (event: string, handler: (...args: unknown[]) => void) => (() => void) | void, effect?: (fn: () => () => void) => void }
 *   format: 'text' | 'json'
 *   outputPath?: string
 *   cmdline: { stdout: { write: (chunk: string) => unknown } }
 *   runnerIo: { stdout: { write: (chunk: string) => unknown } }
 * }} opts
 */
export function installOutputHooks(opts) {
  const { ctx, format, outputPath, cmdline, runnerIo } = opts
  let last = ''
  const original = runnerIo.stdout.write.bind(runnerIo.stdout)
  runnerIo.stdout.write = (chunk) => {
    last += String(chunk)
    if (format !== 'json') original(chunk)
    return true
  }

  let stopJson
  if (format === 'json' && typeof ctx.on === 'function') {
    stopJson = ctx.on('session/event', (_session, event) => {
      const record = event && typeof event === 'object'
        ? { type: /** @type {{ type?: string }} */ (event).type, seq: /** @type {{ seq?: number }} */ (event).seq, data: /** @type {{ data?: unknown }} */ (event).data }
        : { type: 'unknown', data: event }
      cmdline.stdout.write(`${JSON.stringify(record)}\n`)
    })
  }

  const restore = () => {
    runnerIo.stdout.write = original
    if (typeof stopJson === 'function') stopJson()
    if (outputPath !== undefined) writeFileSync(outputPath, last)
  }

  if (typeof ctx.effect === 'function') ctx.effect(() => restore)
  return restore
}

/**
 * Headless has no approval UI. `ask` without an answerer fail-closes.
 * `--approval allow` / `--full-auto` install a process-local auto-grant.
 *
 * @param {{ on?: (event: string, handler: (...args: unknown[]) => unknown) => (() => void) | void, effect?: (fn: () => () => void) => void }} ctx
 */
export function installAutoApprove(ctx) {
  if (typeof ctx.on !== 'function') return () => {}
  const stop = ctx.on('approval/request', () => Promise.resolve('allowed-once'))
  const restore = () => {
    if (typeof stop === 'function') stop()
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => restore)
  return restore
}
