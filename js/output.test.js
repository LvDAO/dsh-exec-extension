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

test('installOutputHooks json writes session/event JSONL and swallows runner stdout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-out-'))
  const outputPath = join(dir, 'last.txt')
  let jsonl = ''
  let handler
  const cmdline = { stdout: { write(chunk) { jsonl += chunk; return true } } }
  const runnerIo = { stdout: { write() { return true } } }
  const restore = installOutputHooks({
    ctx: {
      effect() {},
      on(event, fn) {
        assert.equal(event, 'session/event')
        handler = fn
        return () => { handler = undefined }
      },
    },
    format: 'json',
    outputPath,
    cmdline,
    runnerIo,
  })
  handler({}, { type: 'assistant', seq: 3, data: { text: 'hi' } })
  runnerIo.stdout.write('final answer\n')
  restore()
  assert.equal(jsonl, `${JSON.stringify({ type: 'assistant', seq: 3, data: { text: 'hi' } })}\n`)
  assert.equal(readFileSync(outputPath, 'utf8'), 'final answer\n')
})

test('installOutputHooks json falls back when the event is not an object', () => {
  let jsonl = ''
  let handler
  const restore = installOutputHooks({
    ctx: {
      on(_event, fn) {
        handler = fn
        return () => {}
      },
    },
    format: 'json',
    cmdline: { stdout: { write(chunk) { jsonl += chunk; return true } } },
    runnerIo: { stdout: { write() { return true } } },
  })
  handler({}, 'not-an-object')
  restore()
  assert.equal(jsonl, `${JSON.stringify({ type: 'unknown', data: 'not-an-object' })}\n`)
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
