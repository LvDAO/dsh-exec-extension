import assert from 'node:assert/strict'
import { closeSync, ftruncateSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Command } from 'commander'
import { io, makeProgram, parseEffort, resolveInvocation } from './command.js'
import { parseThinking, resolvePolicy } from './policy.js'
import { assembleTask, MAX_FILE_BYTES, splitAtFiles } from './task.js'

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

test('named flags: model is never part of the task', () => {
  const invocation = parse(['--model', 'foo', 'prove', 'X'])
  assert.equal(invocation.overrides.model, 'foo')
  assert.equal(invocation.task, 'prove X')
})

test('--config model= wins over earlier --model', () => {
  const invocation = parse(['--model', 'a', '--config', 'model=b', 't'])
  assert.equal(invocation.overrides.model, 'b')
})

test('--config effort aliases', () => {
  const a = parse(['--config', 'reasoningEffort=max', 't'])
  assert.equal(a.overrides.effort, 'max')
  const b = parse(['--config', 'model_reasoning_effort=high', 't'])
  assert.equal(b.overrides.effort, 'high')
})

test('--config rejects unknown keys', () => {
  assert.throws(() => parse(['--config', 'foo=bar', 't']), /unknown --config key/)
})

test('--config sandbox= is accepted', () => {
  const invocation = parse(['--config', 'sandbox=read-only', 't'])
  assert.equal(invocation.permissionMode, 'read-only')
})

test('xhigh is rejected on --effort', () => {
  const program = new Command()
  program.exitOverride()
  assert.throws(() => parseEffort('xhigh', program), /use max/)
})

test('--print-selection allows omitting the task', () => {
  const invocation = parse(['--print-selection', '--model', 'm'])
  assert.equal(invocation.printSelection, true)
  assert.equal(invocation.task, undefined)
})

test('--cwd / --cd / --dir must be a directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-cwd-'))
  const invocation = parse(['-C', dir, 't'])
  assert.equal(invocation.cwd, dir)
  assert.equal(parse(['--cd', dir, 't']).cwd, dir)
  assert.equal(parse(['--dir', dir, 't']).cwd, dir)
  assert.throws(() => parse(['--cwd', join(dir, 'missing'), 't']), /not a directory/)
})

test('--reasoning-effort is an alias of --effort', () => {
  const invocation = parse(['--reasoning-effort', 'max', 't'])
  assert.equal(invocation.overrides.effort, 'max')
})

test('--thinking maps Pi tiers onto dsh effort', () => {
  const program = new Command()
  program.exitOverride()
  assert.equal(parseThinking('xhigh', program), 'max')
  assert.equal(parseThinking('medium', program), 'high')
  assert.equal(parse(['--thinking', 'max', 't']).overrides.effort, 'max')
})

test('--env parses KEY=VALUE', () => {
  const invocation = parse(['--env', 'FOO=bar', '--env', 'BAZ=', 't'])
  assert.deepEqual(invocation.env, [
    { key: 'FOO', value: 'bar' },
    { key: 'BAZ', value: '' },
  ])
  assert.throws(() => parse(['--env', 'NOVALUE', 't']), /KEY=VALUE/)
})

test('-m is an alias of --model', () => {
  const invocation = parse(['-m', 'foo', 'prove', 'X'])
  assert.equal(invocation.overrides.model, 'foo')
  assert.equal(invocation.task, 'prove X')
})

test('--timeout must be positive', () => {
  const invocation = parse(['--timeout', '1.5', 't'])
  assert.equal(invocation.timeoutMs, 1500)
  assert.throws(() => parse(['--timeout', '0', 't']), /positive/)
})

test('piped stdin is merged after the argv task', () => {
  const invocation = parse(['summarize', 'this'], {
    isTTY: () => false,
    shouldReadStdin: () => true,
    readStdin: () => '# Title\nbody',
    readFile: testIo.readFile,
  })
  assert.equal(invocation.task, 'summarize this\n\n# Title\nbody')
})

test('"-" as the task is stdin only', () => {
  const invocation = parse(['-'], {
    isTTY: () => false,
    shouldReadStdin: () => true,
    readStdin: () => 'only stdin',
    readFile: testIo.readFile,
  })
  assert.equal(invocation.task, 'only stdin')
})

test('Pi @file and -f attach file bodies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-file-'))
  const path = join(dir, 'notes.md')
  writeFileSync(path, 'hello')
  const fromAt = parse([`@${path}`, 'use', 'notes'])
  assert.match(fromAt.task, /hello/)
  assert.match(fromAt.task, /use notes/)
  const fromFlag = parse(['-f', path, 'use notes'])
  assert.match(fromFlag.task, /hello/)
})

test('--output-schema appends a prompt-level constraint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-schema-'))
  const path = join(dir, 'schema.json')
  writeFileSync(path, '{"type":"object"}')
  const invocation = parse(['--output-schema', path, 'extract'])
  assert.match(invocation.task, /JSON Schema/)
  assert.match(invocation.task, /"type": "object"/)
})

test('--full-auto auto-approves and keeps default workspace-write', () => {
  const invocation = parse(['--full-auto', 't'])
  assert.equal(invocation.permissionMode, 'workspace-write')
  assert.equal(invocation.autoApprove, true)
  assert.equal(invocation.approvalPolicy, 'ask')
})

test('--yolo is danger-full-access and never-ask', () => {
  const invocation = parse(['--yolo', 't'])
  assert.equal(invocation.permissionMode, 'danger-full-access')
  assert.equal(invocation.approvalPolicy, 'never')
  assert.equal(invocation.autoApprove, false)
})

test('--approval allow is ask + auto-grant', () => {
  const invocation = parse(['--approval', 'allow', 't'])
  assert.equal(invocation.approvalPolicy, 'ask')
  assert.equal(invocation.autoApprove, true)
})

test('--format json and --mode json', () => {
  assert.equal(parse(['--format', 'json', 't']).format, 'json')
  assert.equal(parse(['--mode', 'json', 't']).format, 'json')
  assert.equal(parse(['t']).format, 'text')
})

test('--sandbox rejects unknown modes', () => {
  assert.throws(() => parse(['--sandbox', 't', 'task']), /read-only/)
})

test('help text lists the extra flags', () => {
  const text = makeProgram().helpInformation()
  for (const flag of [
    '--model', '--effort', '--sandbox', '--approval', '--full-auto', '--file',
    '--format', '--output-schema', '--output-last-message', '--tools-mode', '--thinking',
    '--yolo', '--timeout', '--api-key', '--print-selection', '--permission-mode',
    '--cwd', '--env', '--dangerously-skip-permissions', '--provider', '--version',
  ]) {
    assert.match(text, new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('splitAtFiles treats @path as attachments', () => {
  assert.deepEqual(splitAtFiles(['@a.md', 'do', 'it']), { files: ['a.md'], words: ['do', 'it'] })
})

test('assembleTask joins argv, stdin, files, schema', () => {
  const text = assembleTask({
    argvTask: 'summarize',
    stdinText: 'doc',
    files: [{ path: '/a.md', body: 'hi' }],
    outputSchemaText: '{"type":"object"}',
  })
  assert.match(text, /summarize/)
  assert.match(text, /doc/)
  assert.match(text, /hi/)
  assert.match(text, /JSON Schema/)
})

test('resolvePolicy: danger-full-access defaults approval to never', () => {
  const program = new Command()
  program.exitOverride()
  const policy = resolvePolicy({ sandbox: 'danger-full-access', program })
  assert.equal(policy.approvalPolicy, 'never')
  assert.equal(policy.autoApprove, false)
})

test('--provider is a this-process overlay and not part of the task', () => {
  const invocation = parse(['--provider', 'custom-route', 'do', 'it'])
  assert.equal(invocation.overrides.provider, 'custom-route')
  assert.equal(invocation.task, 'do it')
})

test('--permission-mode is an alias of --sandbox; -s wins if both are set', () => {
  assert.equal(parse(['--permission-mode', 'read-only', 't']).permissionMode, 'read-only')
  const both = parse(['--permission-mode', 'danger-full-access', '--sandbox', 'read-only', 't'])
  assert.equal(both.permissionMode, 'read-only')
})

test('--dangerously-skip-permissions is an alias of --yolo', () => {
  const invocation = parse(['--dangerously-skip-permissions', 't'])
  assert.equal(invocation.permissionMode, 'danger-full-access')
  assert.equal(invocation.approvalPolicy, 'never')
  assert.equal(invocation.autoApprove, false)
})

test('--full-auto keeps an explicit --sandbox', () => {
  const invocation = parse(['--sandbox', 'read-only', '--full-auto', 't'])
  assert.equal(invocation.permissionMode, 'read-only')
  assert.equal(invocation.autoApprove, true)
  assert.equal(invocation.approvalPolicy, 'ask')
})

test('--approval never is auto-deny; ask is fail-closed', () => {
  const never = parse(['--approval', 'never', 't'])
  assert.equal(never.approvalPolicy, 'never')
  assert.equal(never.autoApprove, false)
  const ask = parse(['--approval', 'ask', 't'])
  assert.equal(ask.approvalPolicy, 'ask')
  assert.equal(ask.autoApprove, false)
})

test('--config overlays approval, toolsMode, format, and provider', () => {
  const invocation = parse([
    '--config', 'approval=allow',
    '--config', 'toolsMode=code',
    '--config', 'format=json',
    '--config', 'provider=custom-route',
    't',
  ])
  assert.equal(invocation.approvalPolicy, 'ask')
  assert.equal(invocation.autoApprove, true)
  assert.equal(invocation.toolsMode, 'code')
  assert.equal(invocation.format, 'json')
  assert.equal(invocation.overrides.provider, 'custom-route')
})

test('--config permissionMode= and tools_mode= aliases', () => {
  const invocation = parse([
    '--config', 'permissionMode=read-only',
    '--config', 'tools_mode=both',
    '--config', 'mode=json',
    't',
  ])
  assert.equal(invocation.permissionMode, 'read-only')
  assert.equal(invocation.toolsMode, 'both')
  assert.equal(invocation.format, 'json')
})

test('--config format= overlays --format; --mode is an alias of --format', () => {
  assert.equal(parse(['--format', 'text', '--config', 'format=json', 't']).format, 'json')
  assert.equal(parse(['--format', 'text', '--mode', 'json', 't']).format, 'json')
})

test('--api-key is this-process DEEPSEEK_API_KEY', () => {
  const invocation = parse(['--api-key', 'sk-test', 't'])
  assert.deepEqual(invocation.env, [{ key: 'DEEPSEEK_API_KEY', value: 'sk-test' }])
})

test('--output-schema rejects invalid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-schema-bad-'))
  const path = join(dir, 'schema.json')
  writeFileSync(path, 'not json')
  assert.throws(() => parse(['--output-schema', path, 't']), /not valid JSON/)
})

test('--file rejects missing paths, directories, and bodies over 10MB', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-file-bad-'))
  assert.throws(() => parse(['-f', join(dir, 'missing.md'), 't']), /not a file/)
  assert.throws(() => parse(['-f', dir, 't']), /not a file/)
  const big = join(dir, 'big.bin')
  const fd = openSync(big, 'w')
  ftruncateSync(fd, MAX_FILE_BYTES + 1)
  closeSync(fd)
  assert.throws(() => parse(['-f', big, 't']), /exceeds/)
})

test('empty or whitespace-only argv is rejected unless --print-selection', () => {
  assert.throws(() => parse([]), /a task is required/)
  assert.throws(() => parse(['   ']), /a task is required/)
})

test('"-" on a TTY is rejected', () => {
  assert.throws(() => parse(['-']), /requires piped stdin/)
})

test('-- stops flag parsing so later words are the task', () => {
  const invocation = parse(['--model', 'foo', '--', '--effort', 'max', 'prove'])
  assert.equal(invocation.overrides.model, 'foo')
  assert.equal(invocation.overrides.effort, undefined)
  assert.equal(invocation.task, '--effort max prove')
})

test('repeated --model: last wins', () => {
  const invocation = parse(['--model', 'a', '--model', 'b', 't'])
  assert.equal(invocation.overrides.model, 'b')
})

test('--timeout rejects non-positive values', () => {
  assert.throws(() => parse(['--timeout', '-1', 't']), /positive/)
  assert.throws(() => parse(['--timeout', 'abc', 't']), /positive/)
})

test('invalid enum flags fail closed', () => {
  assert.throws(() => parse(['--format', 'yaml', 't']), /text or json/)
  assert.throws(() => parse(['--tools-mode', 'all', 't']), /native/)
  assert.throws(() => parse(['--approval', 'yes', 't']), /ask/)
  assert.throws(() => parse(['--effort', 'ultra', 't']), /off, high, max/)
})

test('NODE_TEST_CONTEXT skips auto stdin so the test runner keeps its stdin', () => {
  assert.equal(process.env.NODE_TEST_CONTEXT !== undefined, true)
  assert.equal(io.shouldReadStdin(), false)
})
