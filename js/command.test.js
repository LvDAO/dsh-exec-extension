import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Command } from 'commander'
import { applyConfigEntry, makeProgram, parseEffort, resolveInvocation } from './command.js'

function parse(args) {
  const program = makeProgram()
  program.exitOverride()
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} })
  program.action(() => {})
  program.parse(args, { from: 'user' })
  return resolveInvocation(program)
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
  assert.throws(() => parse(['--config', 'sandbox=danger', 't']), /unknown --config key/)
})

test('xhigh is rejected', () => {
  const program = new Command()
  program.exitOverride()
  assert.throws(() => parseEffort('xhigh', program), /use max/)
})

test('--print-selection allows omitting the task', () => {
  const invocation = parse(['--print-selection', '--model', 'm'])
  assert.equal(invocation.printSelection, true)
  assert.equal(invocation.task, undefined)
})

test('--cwd must be a directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-cwd-'))
  const invocation = parse(['-C', dir, 't'])
  assert.equal(invocation.cwd, dir)
  assert.equal(parse(['--cd', dir, 't']).cwd, dir)
  assert.throws(() => parse(['--cwd', join(dir, 'missing'), 't']), /not a directory/)
})

test('--reasoning-effort is an alias of --effort', () => {
  const invocation = parse(['--reasoning-effort', 'max', 't'])
  assert.equal(invocation.overrides.effort, 'max')
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

test('help text lists the extra flags', () => {
  const text = makeProgram().helpInformation()
  for (const flag of ['--model', '--effort', '--reasoning-effort', '--provider', '--cwd', '--timeout', '--config', '--print-selection', '--env']) {
    assert.match(text, new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
