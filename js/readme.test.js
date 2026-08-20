/**
 * Pins README.md / README.zh.md. Flag-table rows and the narrative claims
 * in those files are the functional description; extra implementation
 * tests live in the other `*.test.js` files.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { makeProgram, resolveInvocation } from './command.js'
import { installOutputHooks } from './output.js'
import { parseThinking } from './policy.js'
import { Command } from 'commander'
import { apply, HEADLESS_STARTUP_SERVICE } from './startup.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readmeEn = readFileSync(join(root, 'README.md'), 'utf8')
const readmeZh = readFileSync(join(root, 'README.zh.md'), 'utf8')
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

const testIo = {
  isTTY: () => true,
  readStdin: () => {
    throw new Error('stdin should not be read in TTY tests')
  },
  readFile: (path) => readFileSync(path, 'utf8'),
}

function parse(args, host = testIo) {
  const program = makeProgram()
  program.exitOverride()
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} })
  program.action(() => {})
  program.parse(args, { from: 'user' })
  return resolveInvocation(program, host)
}

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
    provided: {},
    provide(name, value) {
      this.provided[name] = value
    },
    get(name) {
      if (name === 'cmdlineArgs') return this.cmdlineArgs
      if (name === 'appExit') return (code) => { exits.push(code) }
      if (name === 'agentDefaultModel') return this.agentDefaultModel
      return undefined
    },
    effect() {},
    on() {
      return () => {}
    },
  }
  return { ctx, exits, saveCalls: () => saveCalls }
}

test('README documents official-pattern bundle and OpenCode/Pi exec', () => {
  assert.match(readmeEn, /dsh\.bundle\.patch/)
  assert.match(readmeEn, /parseCmdline/)
  assert.match(readmeEn, /commander/)
  assert.match(readmeEn, /headless-startup/)
  assert.match(readmeEn, /headlessStartup\.task/)
  assert.match(readmeEn, /headless-runner/)
  assert.match(readmeEn, /OpenCode/)
  assert.match(readmeEn, /Pi/)
  assert.match(readmeZh, /dsh\.bundle\.patch/)
  assert.match(readmeZh, /headless-runner/)
  assert.match(readmeEn, /does \*\*not\*\* disable the sandbox/)
  assert.match(readmeZh, /不是全开权限/)
})

test('README install: dedicated exec profile; stock headless must reject --model', () => {
  assert.match(readmeEn, /--profile exec/)
  assert.match(readmeEn, /dsh plugin --profile exec add dsh-exec-extension/)
  assert.match(readmeEn, /www\.npmjs\.com\/package\/dsh-exec-extension/)
  assert.match(readmeEn, /Dedicated profile only/)
  assert.match(readmeEn, /headless --model/)
  assert.match(readmeZh, /dsh plugin --profile exec add dsh-exec-extension/)
  assert.match(readmeZh, /www\.npmjs\.com\/package\/dsh-exec-extension/)
  assert.match(readmeZh, /独立 profile/)
  assert.match(readmeZh, /headless --model/)
})

test('bundle disables stock headless-startup and does not fork headless-runner', () => {
  assert.match(patch, /id:\s*headless-startup/)
  assert.match(patch, /disabled:\s*true/)
  assert.match(patch, /id:\s*exec-extension-startup/)
  assert.match(patch, /name:\s*dsh-exec-extension\/startup/)
  assert.doesNotMatch(patch, /id:\s*headless-runner/)
})

test('piped stdin is merged into the prompt (OpenCode order: argv then stdin)', () => {
  const invocation = parse(['summarize', 'this'], {
    isTTY: () => false,
    shouldReadStdin: () => true,
    readStdin: () => '# Title\nbody',
    readFile: testIo.readFile,
  })
  assert.equal(invocation.task, 'summarize this\n\n# Title\nbody')
})

test('"-" as the task is stdin only, as in the README usage line', () => {
  const invocation = parse(['-'], {
    isTTY: () => false,
    shouldReadStdin: () => true,
    readStdin: () => 'only stdin',
    readFile: testIo.readFile,
  })
  assert.equal(invocation.task, 'only stdin')
})

test('@file and -f attach file text into the task', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-readme-file-'))
  const path = join(dir, 'notes.md')
  writeFileSync(path, 'hello')
  assert.match(parse([`@${path}`, 'use', 'notes']).task, /hello/)
  assert.match(parse(['-f', path, 'use notes']).task, /hello/)
})

test('--format json streams session events as JSONL; --mode json is the alias', () => {
  assert.equal(parse(['--format', 'json', 't']).format, 'json')
  assert.equal(parse(['--mode', 'json', 't']).format, 'json')
  let jsonl = ''
  let handler
  const restore = installOutputHooks({
    ctx: {
      on(event, fn) {
        assert.equal(event, 'session/event')
        handler = fn
        return () => {}
      },
    },
    format: 'json',
    cmdline: { stdout: { write(chunk) { jsonl += chunk; return true } } },
    runnerIo: { stdout: { write() { return true } } },
  })
  handler({}, { type: 'assistant', seq: 1, data: { text: 'hi' } })
  restore()
  assert.equal(jsonl, `${JSON.stringify({ type: 'assistant', seq: 1, data: { text: 'hi' } })}\n`)
})

test('--dir / --cwd / --cd set the working directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-readme-cwd-'))
  assert.equal(parse(['--dir', dir, 't']).cwd, dir)
  assert.equal(parse(['-C', dir, 't']).cwd, dir)
  assert.equal(parse(['--cd', dir, 't']).cwd, dir)
})

test('--yolo skips permission prompts and does not open the sandbox', () => {
  const invocation = parse(['--yolo', 't'])
  assert.equal(invocation.permissionMode, 'workspace-write')
  assert.equal(invocation.autoApprove, true)
  assert.equal(invocation.approvalPolicy, 'ask')
  const alias = parse(['--dangerously-skip-permissions', 't'])
  assert.equal(alias.permissionMode, 'workspace-write')
  assert.equal(alias.autoApprove, true)
  const sandboxed = parse(['--sandbox', 'read-only', '--yolo', 't'])
  assert.equal(sandboxed.permissionMode, 'read-only')
  assert.equal(sandboxed.autoApprove, true)
})

test('--full-auto is workspace-write + auto-allow', () => {
  const invocation = parse(['--full-auto', 't'])
  assert.equal(invocation.permissionMode, 'workspace-write')
  assert.equal(invocation.autoApprove, true)
  assert.equal(invocation.approvalPolicy, 'ask')
})

test('--model is never part of the task; overlay does not call saveSelection()', () => {
  const invocation = parse(['--model', 'foo', 'prove', 'X'])
  assert.equal(invocation.overrides.model, 'foo')
  assert.equal(invocation.task, 'prove X')
  const { ctx, saveCalls } = mockCtx(['--model', 'deepseek-v4-pro', 't'])
  apply(ctx)
  ctx.agentDefaultModel.currentSelection()
  assert.equal(saveCalls(), 0)
})

test('--output-schema is a prompt constraint, not constrained decode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-readme-schema-'))
  const path = join(dir, 'schema.json')
  writeFileSync(path, '{"type":"object"}')
  const invocation = parse(['--output-schema', path, 'extract'])
  assert.match(invocation.task, /JSON Schema/)
  assert.match(invocation.task, /"type": "object"/)
  assert.equal('outputSchema' in invocation, false)
})

test('--approval allow auto-grants; never auto-denies; ask fail-closes', () => {
  const allow = parse(['--approval', 'allow', 't'])
  assert.equal(allow.approvalPolicy, 'ask')
  assert.equal(allow.autoApprove, true)
  const never = parse(['--approval', 'never', 't'])
  assert.equal(never.approvalPolicy, 'never')
  assert.equal(never.autoApprove, false)
  const ask = parse(['--approval', 'ask', 't'])
  assert.equal(ask.approvalPolicy, 'ask')
  assert.equal(ask.autoApprove, false)
})

test('headlessStartup has the README fields; sandbox/approval/tools inject it', () => {
  const { ctx } = mockCtx(['--tools-mode', 'code', '--sandbox', 'read-only', 't'])
  apply(ctx)
  const startup = ctx.provided[HEADLESS_STARTUP_SERVICE]
  assert.deepEqual(Object.keys(startup).sort(), [
    'approvalPolicy', 'autoApprove', 'cwd', 'format', 'permissionMode', 'task', 'toolsMode',
  ])
  assert.equal(startup.task, 't')
  assert.equal(startup.permissionMode, 'read-only')
  assert.equal(startup.toolsMode, 'code')
  assert.equal(startup.format, 'text')
  assert.match(patch, /ctx\.headlessStartup\.permissionMode/)
  assert.match(patch, /ctx\.headlessStartup\.cwd/)
  assert.match(patch, /ctx\.headlessStartup\.approvalPolicy/)
  assert.match(patch, /ctx\.headlessStartup\.toolsMode/)
})

test('unknown flags error; overlay never writes settings.yaml', () => {
  assert.throws(() => parse(['--not-a-real-flag', 't']), /unknown option/)
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-readme-settings-'))
  const settings = join(dir, 'settings.yaml')
  const original = 'agent-default-model:\n  provider: deepseek-official\n  model: deepseek-v4-flash\n'
  writeFileSync(settings, original)
  const { ctx } = mockCtx(['--model', 'deepseek-v4-pro', 't'])
  apply(ctx)
  ctx.agentDefaultModel.currentSelection()
  assert.equal(readFileSync(settings, 'utf8'), original)
})

test('--thinking maps Pi tiers as the README table states', () => {
  const program = new Command()
  program.exitOverride()
  assert.equal(parseThinking('xhigh', program), 'max')
  assert.equal(parseThinking('max', program), 'max')
  assert.equal(parseThinking('minimal', program), 'high')
  assert.equal(parseThinking('low', program), 'high')
  assert.equal(parseThinking('medium', program), 'high')
  assert.equal(parseThinking('high', program), 'high')
  assert.equal(parse(['--effort', 'max', 't']).overrides.effort, 'max')
  assert.throws(() => parse(['--effort', 'xhigh', 't']), /max/)
})

test('--timeout, -o, --print-selection, --api-key, --config match the README table', () => {
  assert.equal(parse(['--timeout', '1.5', 't']).timeoutMs, 1500)
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-readme-out-'))
  assert.equal(parse(['-o', join(dir, 'last.txt'), 't']).outputPath, join(dir, 'last.txt'))
  const printed = parse(['--print-selection', '--model', 'm'])
  assert.equal(printed.printSelection, true)
  assert.equal(printed.task, undefined)
  assert.deepEqual(parse(['--api-key', 'sk-test', 't']).env, [{ key: 'DEEPSEEK_API_KEY', value: 'sk-test' }])
  assert.equal(parse(['--config', 'model=b', 't']).overrides.model, 'b')
})

test('--sandbox / --permission-mode and --provider are this-process flags', () => {
  assert.equal(parse(['--sandbox', 'read-only', 't']).permissionMode, 'read-only')
  assert.equal(parse(['--permission-mode', 'workspace-write', 't']).permissionMode, 'workspace-write')
  assert.equal(parse(['--provider', 'custom-route', 't']).overrides.provider, 'custom-route')
})

test('README non-goals are not on the CLI: no --image, resume, Host, or HTTP flags', () => {
  const help = makeProgram().helpInformation()
  for (const absent of ['--image', '--resume', '--host', '--port', '--mcp']) {
    assert.equal(help.includes(absent), false, absent)
  }
})

test('README develop commands are npm test and npm run acceptance', () => {
  assert.match(readmeEn, /npm test/)
  assert.match(readmeEn, /npm run acceptance/)
  assert.match(readmeZh, /npm test/)
  assert.match(readmeZh, /npm run acceptance/)
})
