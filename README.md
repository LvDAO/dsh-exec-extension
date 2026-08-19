# dsh-exec-extension

A DeepSeek Harness **bundle** in the official extension shape (`dsh.bundle.patch` + `dsh plugin add`). It replaces stock `headless-startup` so one-shot headless accepts a richer per-invocation CLI **without writing `$DSH_HOME/settings.yaml`**.

Stock `@deepseek-ai/dsh-headless` only declares `[task...]`. A sidecar that also reads `ctx.cmdlineArgs` cannot add `--model`: the stock commander still runs `program.parse()` on the **full** argv and exits on an unknown option. This bundle **disables** that row and inserts a replacement that still provides:

```ts
headlessStartup = { task: string }
```

Stock `headless-runner` is unchanged. It injects `headlessStartup`, reads `task`, and builds one Agent via `ctx.agentDefaultModel.currentSelection()`.

The app CLI is the same pattern as stock web/headless startup: **commander + `@deepseek-ai/dsh-cmdline` `parseCmdline`**. Selection overlay stays in **Rust WASM** and never calls `saveSelection()`.

## CLI

Launcher flags stay first. App flags follow:

```text
dsh --profile <profile> [options] [--] [task...]
```

| Argument | Required | Meaning |
|----------|----------|---------|
| `-m, --model <id>` | no | This-process default model. Omit → existing `ctx.agentDefaultModel`. |
| `--effort <off\|high\|max>` | no | This-process `reasoningEffort`. Omit → **do not inject** an effort. |
| `--reasoning-effort <off\|high\|max>` | no | Alias of `--effort`. If both are set, this one wins. |
| `--provider <id>` | no | This-process provider. Omit → deployment default. |
| `-C, --cwd <path>` / `--cd <path>` | no | Working directory for this process (`headless-runner` uses `process.cwd()`). |
| `--timeout <seconds>` | no | Request `appExit(1)` after N seconds. |
| `--config <key=value>` | no | Repeatable this-process override. Keys: `model`, `provider`, `effort`, `reasoningEffort`, `model_reasoning_effort`. Later entries win over named flags. |
| `--env <KEY=VALUE>` | no | Repeatable `process.env` for this invocation (not written to disk). |
| `--print-selection` | no | Print the overlaid model selection as JSON and exit. Task is optional. |
| `<task>` | yes, unless `--print-selection` | Task text; multiple words joined by spaces (same as stock headless). |

`--help` lists these flags. `-V, --version` prints this package version.

`--model foo prove X`: `foo` is the model; it is **never** part of `task`.

`--effort` accepts **only** `off | high | max`. `xhigh` is rejected (`use max`). Unknown flags still error.

## Override semantics

- Overlay / wrap `ctx.agentDefaultModel.currentSelection()` so **this** `headless-runner` Agent sees the flags.
- Does **not** call `saveSelection()`, and does not write `$DSH_HOME/settings.yaml`, `.credentials.yaml`, or the profile’s `cordis.patch.yml`.
- Isolation is argv + process memory. N concurrent `dsh` processes with a shared home do not clobber each other.

## Install (official plugin channel)

Requires `@deepseek-ai/dsh-headless@0.1.0-rc.7` **already on the profile** (npm `latest` for that package is an older `0.0.1-rc.1`; pin `0.1.0-rc.7` or the `next` tag), then this bundle **after** it (`dsh plugin add` appends). A new profile starts as `dsh-base` only. Node **≥ 22.19** (dsh uses `node:zlib` zstd).

```sh
dsh plugin --profile exec add @deepseek-ai/dsh-headless@0.1.0-rc.7
dsh plugin --profile exec add ./dsh-exec-extension
# or, once published: dsh plugin --profile exec add dsh-exec-extension
```

Do not add this bundle to a profile that must keep stock `dsh --profile headless --model x "t"` failing as an unknown option. Use a dedicated profile (example name: `exec`).

Confirm the stock startup row is disabled:

```sh
dsh --profile exec --dump-config
```

You should see `headless-startup` with `disabled: true` and `exec-extension-startup` resolving to `dsh-exec-extension/startup`.

```sh
dsh --profile exec --help
dsh --profile exec --model deepseek-v4-pro --effort max "run the tests"
dsh --profile exec --config model=deepseek-v4-pro --print-selection
```

Credentials stay process env (`DEEPSEEK_API_KEY` or `--env`). This plugin does not read or copy credential files.

`npm prepare` / `dsh plugin add` from a tarball uses the committed `js/generated/` WASM and does **not** require rustc. Set `DSH_EXEC_FORCE_WASM_BUILD=1` to rebuild.

## Why the patch disables instead of renaming

Cordis `applyEntryPatches` **skips** an id-targeted patch when `name` does not match the existing row (`patch: name mismatch … skipping`). Restating `name: dsh-exec-extension/startup` on `id: headless-startup` does not replace the module. The bundle therefore disables the stock row and inserts a new id that still provides `headlessStartup`.

## Non-goals

- MCP servers, Host, HTTP, or a web runtime
- Resident daemon / worker roster
- `--json` / `--sandbox` / resume / max-turns (those need a runner fork)
- Per-run `--patch` YAML generation
- Forking or rewriting `headless-runner`

## Develop

Rust 1.83+, Node 22.19+, `wasm-bindgen-cli` **0.2.100** (must match `Cargo.toml`) if you rebuild WASM.

```sh
npm test          # cargo test && node --test
npm run build     # wasm32-unknown-unknown → js/generated/
```

Pin: `@deepseek-ai/dsh-headless` `0.1.0-rc.7` (npm `next`). The compatibility hinge is the `headlessStartup` service name.

```sh
npm test
DSH_BIN=/path/to/dsh npm run acceptance
```
