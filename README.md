# dsh-exec-extension

A DeepSeek Harness **bundle** that replaces stock `headless-startup` so one-shot headless accepts per-invocation model flags **without writing `$DSH_HOME/settings.yaml`**.

Stock `@deepseek-ai/dsh-headless` only declares `[task...]`. A sidecar that also reads `ctx.cmdlineArgs` cannot add `--model`: the stock commander still runs `program.parse()` on the **full** argv and exits on an unknown option. This bundle **disables** that row and inserts a replacement that still provides:

```ts
headlessStartup = { task: string }
```

Stock `headless-runner` is unchanged. It injects `headlessStartup`, reads `task` from lazy config, and builds one Agent via `ctx.agentDefaultModel.currentSelection()`.

Contract logic (argv grammar, effort enum, selection overlay) is **Rust**, compiled to WebAssembly. `js/startup.js` is the Cordis `apply` glue.

## CLI

Launcher flags stay first. App flags follow:

```text
dsh --profile <profile> [--model <id>] [--effort off|high|max] [--provider <id>] [--] <task>
```

| Argument     | Required | Meaning |
|--------------|----------|---------|
| `--model`    | no       | This-process default model. Omit → existing `ctx.agentDefaultModel` (settings / composition). |
| `--effort`   | no       | This-process `reasoningEffort`. Omit → **do not inject** an effort. |
| `--provider` | no       | This-process provider. Omit → deployment default (usually `deepseek-official`). |
| `<task>`     | yes      | Task text; multiple words joined by spaces (same as stock headless). |

`--help` lists these flags.

`--model foo prove X`: `foo` is the model; it is **never** part of `task`.

`--effort` accepts **only** `off | high | max`.

If `--model` is present, it is used as-is. Model ids are not special-cased.

## Override semantics

- Overlay / wrap `ctx.agentDefaultModel.currentSelection()` so **this** `headless-runner` Agent sees the flags.
- Does **not** call `saveSelection()`, and does not write `$DSH_HOME/settings.yaml`, `.credentials.yaml`, or the profile’s `cordis.patch.yml`.
- Isolation is argv + process memory. N concurrent `dsh` processes with a shared home do not clobber each other; shared files stay byte-identical across a run that passed `--model` / `--effort`.

## Install

Requires `@deepseek-ai/dsh-headless` **already on the profile**, then this bundle **after** it (`dsh plugin add` appends). A new profile starts as `dsh-base` only:

```sh
dsh plugin --profile exec add @deepseek-ai/dsh-headless
dsh plugin --profile exec add ./dsh-exec-extension
```

Do not add this bundle to a profile that must keep stock `dsh --profile headless --model x "t"` failing as an unknown option. Use a dedicated profile (example name: `exec`).

Confirm the stock startup row is disabled:

```sh
dsh --profile exec --dump-config
```

You should see `headless-startup` with `disabled: true` and `exec-extension-startup` resolving to `dsh-exec-extension/startup`.

Run:

```sh
dsh --profile exec --model deepseek-v4-pro --effort max "run the tests"
dsh --profile exec --help
```

Credentials stay process env (`DEEPSEEK_API_KEY`). This plugin does not read or copy credential files.

## Why the patch disables instead of renaming

Cordis `applyEntryPatches` **skips** an id-targeted patch when `name` does not match the existing row (`patch: name mismatch … skipping`). Restating `name: dsh-exec-extension/startup` on `id: headless-startup` does not replace the module. The bundle therefore disables the stock row and inserts a new id that still provides `headlessStartup`.

## Non-goals

- MCP servers, Host, HTTP, or a web runtime
- Resident daemon / worker roster
- Codex `--config model_reasoning_effort=…` spellings
- Per-run `--patch` YAML generation
- Forking or rewriting `headless-runner`

## Develop

Rust 1.83+, Node 22.19+, `wasm-bindgen-cli` **0.2.100** (must match `Cargo.toml`).

```sh
npm test          # cargo test && node --test
npm run build     # wasm32-unknown-unknown → js/generated/
```

Pin: `@deepseek-ai/dsh-headless` ≥ `0.1.0-rc.7`. The compatibility hinge is the `headlessStartup` service name.
