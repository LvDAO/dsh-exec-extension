import assert from 'node:assert/strict'
import test from 'node:test'
import { Command } from 'commander'
import { parseThinking, resolvePolicy, THINKING_TO_EFFORT } from './policy.js'

function program() {
  const command = new Command()
  command.exitOverride()
  command.configureOutput({ writeOut: () => {}, writeErr: () => {} })
  return command
}

test('--thinking maps every documented Pi tier onto dsh effort', () => {
  assert.deepEqual(THINKING_TO_EFFORT, {
    off: 'off',
    minimal: 'high',
    low: 'high',
    medium: 'high',
    high: 'high',
    xhigh: 'max',
    max: 'max',
  })
  const command = program()
  for (const [tier, effort] of Object.entries(THINKING_TO_EFFORT)) {
    assert.equal(parseThinking(tier, command), effort, tier)
  }
})

test('--thinking rejects unknown tiers', () => {
  assert.throws(() => parseThinking('ultra', program()), /--thinking/)
})

test('default policy is workspace-write + ask without auto-grant', () => {
  const policy = resolvePolicy({ program: program() })
  assert.deepEqual(policy, {
    permissionMode: 'workspace-write',
    approvalPolicy: 'ask',
    autoApprove: false,
  })
})

test('--full-auto auto-grants and keeps default workspace-write', () => {
  const policy = resolvePolicy({ fullAuto: true, program: program() })
  assert.equal(policy.permissionMode, 'workspace-write')
  assert.equal(policy.approvalPolicy, 'ask')
  assert.equal(policy.autoApprove, true)
})

test('--full-auto keeps an explicit sandbox', () => {
  const policy = resolvePolicy({ fullAuto: true, sandbox: 'read-only', program: program() })
  assert.equal(policy.permissionMode, 'read-only')
  assert.equal(policy.autoApprove, true)
})

test('danger-full-access without --approval defaults to never and drops --full-auto', () => {
  const policy = resolvePolicy({
    sandbox: 'danger-full-access',
    fullAuto: true,
    program: program(),
  })
  assert.equal(policy.permissionMode, 'danger-full-access')
  assert.equal(policy.approvalPolicy, 'never')
  assert.equal(policy.autoApprove, false)
})

test('--full-auto + danger-full-access + --approval allow keeps auto-grant', () => {
  const policy = resolvePolicy({
    sandbox: 'danger-full-access',
    fullAuto: true,
    approval: 'allow',
    program: program(),
  })
  assert.equal(policy.permissionMode, 'danger-full-access')
  assert.equal(policy.approvalPolicy, 'ask')
  assert.equal(policy.autoApprove, true)
})

test('--yolo is a preset that wins over sandbox, approval, and --full-auto', () => {
  const policy = resolvePolicy({
    yolo: true,
    fullAuto: true,
    sandbox: 'read-only',
    approval: 'allow',
    program: program(),
  })
  assert.deepEqual(policy, {
    permissionMode: 'danger-full-access',
    approvalPolicy: 'never',
    autoApprove: false,
  })
})

test('--yolo still rejects unknown --sandbox values', () => {
  assert.throws(
    () => resolvePolicy({ yolo: true, sandbox: 'bogus', program: program() }),
    /read-only/,
  )
})

test('--approval never is auto-deny without auto-grant', () => {
  const policy = resolvePolicy({ approval: 'never', fullAuto: true, program: program() })
  assert.equal(policy.approvalPolicy, 'never')
  assert.equal(policy.autoApprove, false)
})

test('--approval allow is ask + auto-grant', () => {
  const policy = resolvePolicy({ approval: 'allow', program: program() })
  assert.equal(policy.approvalPolicy, 'ask')
  assert.equal(policy.autoApprove, true)
})

test('--sandbox wins over --permission-mode when both are set', () => {
  const policy = resolvePolicy({
    sandbox: 'read-only',
    permissionMode: 'danger-full-access',
    program: program(),
  })
  assert.equal(policy.permissionMode, 'read-only')
})
