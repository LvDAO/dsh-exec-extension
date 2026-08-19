import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { installAutoApprove, installOutputHooks } from './output.js'

test('installAutoApprove answers allowed-once', async () => {
  let handler
  const ctx = {
    on(_event, fn) {
      handler = fn
      return () => { handler = undefined }
    },
    effect() {},
  }
  installAutoApprove(ctx)
  assert.equal(await handler(), 'allowed-once')
})

test('installOutputHooks swallows runner stdout in json format and writes -o', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-out-'))
  const outputPath = join(dir, 'last.txt')
  const cmdline = { stdout: { write() { return true } } }
  const runnerIo = { stdout: { write() { return true } } }
  const restore = installOutputHooks({
    ctx: { effect() {}, on() { return () => {} } },
    format: 'json',
    outputPath,
    cmdline,
    runnerIo,
  })
  runnerIo.stdout.write('final answer\n')
  restore()
  assert.equal(readFileSync(outputPath, 'utf8'), 'final answer\n')
})

test('text format still forwards runner stdout', () => {
  let forwarded = ''
  const runnerIo = {
    stdout: {
      write(chunk) {
        forwarded += chunk
        return true
      },
    },
  }
  const restore = installOutputHooks({
    ctx: { effect() {} },
    format: 'text',
    cmdline: { stdout: { write() { return true } } },
    runnerIo,
  })
  runnerIo.stdout.write('hello')
  assert.equal(forwarded, 'hello')
  restore()
})
