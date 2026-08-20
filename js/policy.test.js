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

test('--thinking maps every README Pi tier onto dsh effort', () => {
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

test('--full-auto is workspace-write + auto-allow', () => {
  const policy = resolvePolicy({ fullAuto: true, program: program() })
  assert.equal(policy.permissionMode, 'workspace-write')
  assert.equal(policy.approvalPolicy, 'ask')
  assert.equal(policy.autoApprove, true)
})

test('--yolo skips prompts (auto-allow) and does not open the sandbox', () => {
  const policy = resolvePolicy({ yolo: true, program: program() })
  assert.equal(policy.permissionMode, 'workspace-write')
  assert.equal(policy.approvalPolicy, 'ask')
  assert.equal(policy.autoApprove, true)
})

test('--yolo keeps an explicit --sandbox', () => {
  const policy = resolvePolicy({ yolo: true, sandbox: 'read-only', program: program() })
  assert.equal(policy.permissionMode, 'read-only')
  assert.equal(policy.autoApprove, true)
})

test('--approval never auto-denies; allow auto-grants; ask fail-closes', () => {
  const never = resolvePolicy({ approval: 'never', program: program() })
  assert.equal(never.approvalPolicy, 'never')
  assert.equal(never.autoApprove, false)
  const allow = resolvePolicy({ approval: 'allow', program: program() })
  assert.equal(allow.approvalPolicy, 'ask')
  assert.equal(allow.autoApprove, true)
  const ask = resolvePolicy({ approval: 'ask', program: program() })
  assert.equal(ask.approvalPolicy, 'ask')
  assert.equal(ask.autoApprove, false)
})
