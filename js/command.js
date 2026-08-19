/**
 * Official-pattern app command for the headless exec bundle.
 * Flag grammar lives here (commander); overlay stays in the Rust WASM.
 * @module dsh-exec-extension/command
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import {
  parseFormat,
  parseThinking,
  parseToolsMode,
  resolvePolicy,
} from './policy.js'
import { assembleTask, MAX_FILE_BYTES, splitAtFiles } from './task.js'

const require = createRequire(import.meta.url)
const { version } = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'))

const EFFORTS = new Set(['off', 'high', 'max'])

/** Tests stub this so `node --test` does not consume the runner's stdin. */
export const io = {
  isTTY: () => process.stdin.isTTY === true,
  shouldReadStdin: () => process.stdin.isTTY !== true && process.env.NODE_TEST_CONTEXT === undefined,
  readStdin: () => readFileSync(0, 'utf8'),
  readFile: (path) => readFileSync(path, 'utf8'),
}

/** Repeatable `--config` / `--env` / `--file` collector. */
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
 * @param {Record<string, string>} acc
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
    case 'provider':
    case 'effort':
    case 'reasoningEffort':
    case 'model_reasoning_effort':
    case 'sandbox':
    case 'permissionMode':
    case 'permission_mode':
    case 'approval':
    case 'toolsMode':
    case 'tools_mode':
    case 'format':
    case 'mode':
      acc[key] = value
      break
    default:
      program.error(
        `error: unknown --config key ${JSON.stringify(key)} (model, provider, effort, sandbox, approval, toolsMode, format)`,
      )
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
 * @param {string} path
 * @param {Command} program
 * @param {{ readFile: (path: string) => string }} host
 * @returns {{ path: string, body: string }}
 */
export function readAttachedFile(path, program, host) {
  const absolute = resolve(path)
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    program.error(`error: --file is not a file: ${path}`)
  }
  const bytes = statSync(absolute).size
  if (bytes > MAX_FILE_BYTES) {
    program.error(`error: --file exceeds ${MAX_FILE_BYTES} bytes: ${path}`)
  }
  return { path: absolute, body: host.readFile(absolute) }
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
    .option('--thinking <level>', 'Pi-style thinking level (off|minimal|low|medium|high|xhigh|max → dsh effort)')
    .option('--provider <id>', 'this-process provider')
    .option('-C, --cwd <path>', 'working directory for this process (headless-runner uses process.cwd())')
    .option('--cd <path>', 'alias of --cwd')
    .option('--dir <path>', 'OpenCode-style alias of --cwd')
    .option('--timeout <seconds>', 'abort this process after N seconds')
    .option('-s, --sandbox <mode>', 'read-only | workspace-write | danger-full-access')
    .option('--permission-mode <mode>', 'alias of --sandbox')
    .option('--approval <ask|never|allow>', 'headless approval: ask (fail-closed), never (auto-deny), allow (auto-grant)')
    .option('--full-auto', 'workspace-write + auto-allow approvals (CI)', false)
    .option('--yolo', 'danger-full-access + approval never (OpenCode)', false)
    .option('--dangerously-skip-permissions', 'alias of --yolo', false)
    .option('--tools-mode <native|code|both>', 'this-process tools presentation')
    .option('-f, --file <path>', 'attach a file into the task (repeatable, OpenCode -f / Pi @file)', collect, [])
    .option('--output-schema <path>', 'append a JSON Schema constraint to the task (prompt-level, not constrained decode)')
    .option('-o, --output-last-message <path>', 'also write the final assistant text to a file')
    .option('--format <text|json>', 'text (default) or json (session event JSONL, OpenCode --format)', 'text')
    .option('--mode <text|json>', 'Pi-style alias of --format')
    .option('-c, --config <key=value>', 'this-process override, repeatable', collect, [])
    .option('--env <KEY=VALUE>', 'set a process environment variable for this invocation (repeatable)', collect, [])
    .option('--api-key <key>', 'this-process DEEPSEEK_API_KEY (not written to disk)')
    .option('--print-selection', 'print the overlaid model selection as JSON and exit', false)
    .argument('[task...]', 'the task text; @path tokens attach files (Pi). "-" means stdin only.')
    .addHelpText(
      'after',
      `
Examples:
  dsh --profile exec --model deepseek-v4-pro --effort max "run the tests"
  dsh --profile exec --full-auto -C /path/to/project "run the tests"
  cat README.md | dsh --profile exec --sandbox read-only "summarize this"
  dsh --profile exec -f prompt.md --format json "review the attached file"
  dsh --profile exec @notes.md "answer from the notes"
  dsh --profile exec --print-selection --config model=deepseek-v4-pro
`,
    )
}

/**
 * @typedef {object} ResolvedInvocation
 * @property {string} [task]
 * @property {{ model?: string, provider?: string, effort?: 'off' | 'high' | 'max' }} overrides
 * @property {string} cwd
 * @property {number} [timeoutMs]
 * @property {boolean} printSelection
 * @property {{ key: string, value: string }[]} env
 * @property {'read-only' | 'workspace-write' | 'danger-full-access'} permissionMode
 * @property {'ask' | 'never'} approvalPolicy
 * @property {boolean} autoApprove
 * @property {'native' | 'code' | 'both'} [toolsMode]
 * @property {'text' | 'json'} format
 * @property {string} [outputPath]
 */

/**
 * Read commander state after a successful parse.
 *
 * @param {Command} program
 * @param {typeof io} [host]
 * @returns {ResolvedInvocation}
 */
export function resolveInvocation(program, host = io) {
  const options = program.opts()
  /** @type {Record<string, string>} */
  const config = {}
  for (const kv of options.config ?? []) {
    applyConfigEntry(kv, config, program)
  }

  /** @type {{ model?: string, provider?: string, effort?: 'off' | 'high' | 'max' }} */
  const overrides = {}
  const model = config.model ?? options.model
  const provider = config.provider ?? options.provider
  if (model !== undefined) overrides.model = model
  if (provider !== undefined) overrides.provider = provider
  if (options.effort !== undefined) overrides.effort = parseEffort(options.effort, program)
  if (options.reasoningEffort !== undefined) overrides.effort = parseEffort(options.reasoningEffort, program)
  if (options.thinking !== undefined) overrides.effort = parseThinking(options.thinking, program)
  const configEffort = config.effort ?? config.reasoningEffort ?? config.model_reasoning_effort
  if (configEffort !== undefined) overrides.effort = parseEffort(configEffort, program)

  const policy = resolvePolicy({
    sandbox: config.sandbox ?? options.sandbox,
    permissionMode: config.permissionMode ?? config.permission_mode ?? options.permissionMode,
    approval: config.approval ?? options.approval,
    fullAuto: options.fullAuto === true,
    yolo: options.yolo === true || options.dangerouslySkipPermissions === true,
    program,
  })

  let toolsMode
  const toolsRaw = config.toolsMode ?? config.tools_mode ?? options.toolsMode
  if (toolsRaw !== undefined) toolsMode = parseToolsMode(toolsRaw, program)

  const format = parseFormat(options.mode ?? config.format ?? config.mode ?? options.format ?? 'text', program)

  let timeoutMs
  if (options.timeout !== undefined) {
    if (!/^\d+(\.\d+)?$/.test(options.timeout) || Number(options.timeout) <= 0) {
      program.error(`error: --timeout must be a positive number of seconds, got ${JSON.stringify(options.timeout)}`)
    }
    timeoutMs = Number(options.timeout) * 1000
  }

  const cwdOpt = options.cwd ?? options.cd ?? options.dir
  let cwd = process.cwd()
  if (cwdOpt !== undefined) {
    cwd = resolve(cwdOpt)
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
      program.error(`error: --cwd is not a directory: ${cwdOpt}`)
    }
  }

  const env = (options.env ?? []).map((kv) => parseEnvEntry(kv, program))
  if (options.apiKey !== undefined) env.push({ key: 'DEEPSEEK_API_KEY', value: options.apiKey })

  const split = splitAtFiles(program.args)
  const attached = [...(options.file ?? []), ...split.files].map((path) => readAttachedFile(path, program, host))

  let outputSchemaText
  if (options.outputSchema !== undefined) {
    const schemaFile = readAttachedFile(options.outputSchema, program, host)
    try {
      outputSchemaText = JSON.stringify(JSON.parse(schemaFile.body), null, 2)
    } catch {
      program.error(`error: --output-schema is not valid JSON: ${options.outputSchema}`)
    }
  }

  const argvTask = split.words.join(' ')
  const dash = argvTask.trim() === '-'
  const printSelection = options.printSelection === true
  const piped = typeof host.shouldReadStdin === 'function' ? host.shouldReadStdin() : !host.isTTY()
  let stdinText
  if (!printSelection && (dash || piped)) {
    if (dash && host.isTTY()) {
      program.error('error: "-" as the task requires piped stdin')
    }
    stdinText = host.readStdin()
  }

  const task = assembleTask({
    argvTask: dash ? '' : argvTask,
    stdinText,
    files: attached,
    outputSchemaText,
  })

  if (!printSelection && task.trim() === '') {
    program.error('error: a task is required, for example: dsh --profile exec "run the tests"')
  }

  let outputPath
  if (options.outputLastMessage !== undefined) {
    outputPath = resolve(options.outputLastMessage)
  }

  return {
    ...task.trim() !== '' ? { task } : {},
    overrides,
    cwd,
    ...timeoutMs !== undefined ? { timeoutMs } : {},
    printSelection,
    env,
    permissionMode: policy.permissionMode,
    approvalPolicy: policy.approvalPolicy,
    autoApprove: policy.autoApprove,
    ...toolsMode !== undefined ? { toolsMode } : {},
    format,
    ...outputPath !== undefined ? { outputPath } : {},
  }
}

