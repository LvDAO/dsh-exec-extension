/**
 * Official-pattern app command for the headless exec bundle.
 * Flag grammar lives here (commander); overlay stays in the Rust WASM.
 * @module dsh-exec-extension/command
 */

import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'

const require = createRequire(import.meta.url)
const { version } = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'))

const EFFORTS = new Set(['off', 'high', 'max'])

/** Repeatable `--config` / `--env` collector. */
export function collect(value, previous) {
  return [...previous, value]
}

/**
 * @param {string} raw
 * @param {Command} program
 * @returns {'off' | 'high' | 'max'}
 */
export function parseEffort(raw, program) {
  if (raw === 'xhigh') {
    program.error('error: effort "xhigh" is not supported; use max')
  }
  if (!EFFORTS.has(raw)) {
    program.error(`error: --effort must be one of off, high, max, got ${JSON.stringify(raw)}`)
  }
  return /** @type {'off' | 'high' | 'max'} */ (raw)
}

/**
 * Apply one `--config key=value`. Later entries win. Unknown keys fail closed.
 *
 * @param {string} kv
 * @param {{ model?: string, provider?: string, effort?: 'off' | 'high' | 'max' }} acc
 * @param {Command} program
 */
export function applyConfigEntry(kv, acc, program) {
  const eq = kv.indexOf('=')
  if (eq <= 0) {
    program.error(`error: --config must be key=value, got ${JSON.stringify(kv)}`)
  }
  const key = kv.slice(0, eq)
  const value = kv.slice(eq + 1)
  switch (key) {
    case 'model':
      acc.model = value
      break
    case 'provider':
      acc.provider = value
      break
    case 'effort':
    case 'reasoningEffort':
    case 'model_reasoning_effort':
      acc.effort = parseEffort(value, program)
      break
    default:
      program.error(`error: unknown --config key ${JSON.stringify(key)} (model, provider, effort)`)
  }
}

/**
 * @param {string} kv
 * @param {Command} program
 * @returns {{ key: string, value: string }}
 */
export function parseEnvEntry(kv, program) {
  const eq = kv.indexOf('=')
  if (eq <= 0) {
    program.error(`error: --env must be KEY=VALUE, got ${JSON.stringify(kv)}`)
  }
  return { key: kv.slice(0, eq), value: kv.slice(eq + 1) }
}

/**
 * @returns {Command}
 */
export function makeProgram() {
  return new Command()
    .name('dsh --profile <profile>')
    .description('Answer one task, print the final assistant message, and exit.')
    .version(version, '-V, --version', 'show this extension version')
    .helpOption('-h, --help', 'show this help')
    .option('-m, --model <id>', 'this-process default model')
    .option('--effort <off|high|max>', 'this-process reasoningEffort')
    .option('--reasoning-effort <off|high|max>', 'alias of --effort')
    .option('--provider <id>', 'this-process provider')
    .option('-C, --cwd <path>', 'working directory for this process (headless-runner uses process.cwd())')
    .option('--cd <path>', 'alias of --cwd')
    .option('--timeout <seconds>', 'abort this process after N seconds')
    .option(
      '--config <key=value>',
      'this-process override, repeatable (model, provider, effort|reasoningEffort|model_reasoning_effort)',
      collect,
      [],
    )
    .option('--env <KEY=VALUE>', 'set a process environment variable for this invocation (repeatable)', collect, [])
    .option('--print-selection', 'print the overlaid model selection as JSON and exit', false)
    .argument('[task...]', 'the task text; multiple words are joined by spaces')
    .addHelpText(
      'after',
      `
Examples:
  dsh --profile exec --model deepseek-v4-pro --effort max "run the tests"
  dsh --profile exec -m deepseek-v4-pro --reasoning-effort max "run the tests"
  dsh --profile exec -C /path/to/project "run the tests"
  dsh --profile exec --config model=deepseek-v4-pro --print-selection
  dsh --profile exec --env DEEPSEEK_API_KEY=sk-... "run the tests"
`,
    )
}

/**
 * @typedef {object} ResolvedInvocation
 * @property {string} [task]
 * @property {{ model?: string, provider?: string, effort?: 'off' | 'high' | 'max' }} overrides
 * @property {string} [cwd]
 * @property {number} [timeoutMs]
 * @property {boolean} printSelection
 * @property {{ key: string, value: string }[]} env
 */

/**
 * Read commander state after a successful parse.
 *
 * @param {Command} program
 * @returns {ResolvedInvocation}
 */
export function resolveInvocation(program) {
  const options = program.opts()
  /** @type {{ model?: string, provider?: string, effort?: 'off' | 'high' | 'max' }} */
  const overrides = {}
  if (options.model !== undefined) overrides.model = options.model
  if (options.provider !== undefined) overrides.provider = options.provider
  if (options.effort !== undefined) overrides.effort = parseEffort(options.effort, program)
  if (options.reasoningEffort !== undefined) overrides.effort = parseEffort(options.reasoningEffort, program)
  for (const kv of options.config ?? []) {
    applyConfigEntry(kv, overrides, program)
  }

  let timeoutMs
  if (options.timeout !== undefined) {
    if (!/^\d+(\.\d+)?$/.test(options.timeout) || Number(options.timeout) <= 0) {
      program.error(`error: --timeout must be a positive number of seconds, got ${JSON.stringify(options.timeout)}`)
    }
    timeoutMs = Number(options.timeout) * 1000
  }

  const cwdOpt = options.cwd !== undefined ? options.cwd : options.cd
  let cwd
  if (cwdOpt !== undefined) {
    cwd = resolve(cwdOpt)
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
      program.error(`error: --cwd is not a directory: ${cwdOpt}`)
    }
  }

  const env = (options.env ?? []).map((kv) => parseEnvEntry(kv, program))

  const task = program.args.join(' ')
  const printSelection = options.printSelection === true
  if (!printSelection && task.trim() === '') {
    program.error('error: a task is required, for example: dsh --profile exec "run the tests"')
  }

  return {
    ...task.trim() !== '' ? { task } : {},
    overrides,
    ...cwd !== undefined ? { cwd } : {},
    ...timeoutMs !== undefined ? { timeoutMs } : {},
    printSelection,
    env,
  }
}
