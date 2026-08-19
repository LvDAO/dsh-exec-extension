import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Command } from 'commander'
import { makeProgram, parseEffort, resolveInvocation } from './command.js'
import { parseThinking, resolvePolicy } from './policy.js'
import { assembleTask, splitAtFiles } from './task.js'

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

test('--full-auto auto-approves without changing danger-full-access', () => {
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
