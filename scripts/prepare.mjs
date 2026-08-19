/**
 * npm prepare: rebuild WASM only when the committed glue is missing.
 * dsh.pub / `dsh plugin add` from a tarball or git checkout with
 * `js/generated/` must not require rustc. Set DSH_EXEC_FORCE_WASM_BUILD=1
 * to rebuild anyway.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wasm = join(root, 'js/generated/native_bg.wasm')
const glue = join(root, 'js/generated/native.js')

if (existsSync(wasm) && existsSync(glue) && process.env.DSH_EXEC_FORCE_WASM_BUILD !== '1') {
  process.stdout.write('prepare: using committed js/generated WASM (set DSH_EXEC_FORCE_WASM_BUILD=1 to rebuild)\n')
  process.exit(0)
}

const result = spawnSync('npm', ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})
process.exit(result.status === null ? 1 : result.status)
