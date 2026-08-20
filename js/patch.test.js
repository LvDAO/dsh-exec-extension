import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const patch = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'cordis.patch.yml'),
  'utf8',
)

test('bundle patch disables stock headless-startup instead of renaming it', () => {
  const disableYaml = patch
    .split('- insert:')[0]
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .join('\n')
  assert.match(disableYaml, /id:\s*headless-startup/)
  assert.match(disableYaml, /disabled:\s*true/)
  assert.doesNotMatch(disableYaml, /^\s*name:/m)
})

test('bundle patch inserts a replacement that still mounts this package startup', () => {
  assert.match(patch, /id:\s*exec-extension-startup/)
  assert.match(patch, /name:\s*dsh-exec-extension\/startup/)
})

test('bundle patch delays sandbox, approval, and tools until headlessStartup exists', () => {
  assert.match(patch, /id:\s*sandbox-policy/)
  assert.match(patch, /id:\s*approval/)
  assert.match(patch, /id:\s*tools/)
  assert.match(patch, /ctx\.headlessStartup\.permissionMode/)
  assert.match(patch, /ctx\.headlessStartup\.cwd/)
  assert.match(patch, /ctx\.headlessStartup\.approvalPolicy/)
  assert.match(patch, /ctx\.headlessStartup\.toolsMode/)
})

test('bundle patch quotes the approval !!js ternary', () => {
  assert.match(
    patch,
    /policy:\s*!!js\s+"ctx\.headlessStartup\.approvalPolicy/,
  )
})
