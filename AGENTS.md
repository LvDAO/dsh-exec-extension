# dsh-exec-extension

Official-pattern DeepSeek Harness **bundle** (`package.json` → `dsh.bundle.patch`). Install with the stock plugin channel:

```sh
dsh plugin --profile exec add @deepseek-ai/dsh-headless@0.1.0-rc.7
dsh plugin --profile exec add <this-package>
```

Pin headless to **0.1.0-rc.7** (or the `next` tag). npm `latest` for that package is still an older rc.

## What it replaces

Stock `headless-startup` only declares `[task...]`. This bundle **disables** that row and inserts `exec-extension-startup` → `dsh-exec-extension/startup`. Stock `headless-runner` is unchanged: it still injects `headlessStartup = { task }` and builds one Agent from `ctx.agentDefaultModel.currentSelection()`.

Do **not** add this bundle to a profile that must keep `dsh --profile headless --model x "t"` failing as an unknown option. Use a dedicated profile (example name: `exec`).

## CLI (after launcher flags)

Same handoff as stock web/headless: the launcher keeps `--profile` / `--dump-config`; this app owns the rest via `parseCmdline` + commander.

```text
dsh --profile exec [options] [--] [task...]
```

| Flag | Meaning |
|------|---------|
| `-m, --model <id>` | This-process default model |
| `--effort`, `--reasoning-effort` `<off\|high\|max>` | This-process `reasoningEffort` |
| `--provider <id>` | This-process provider |
| `-C, --cwd`, `--cd <path>` | `process.chdir` before the runner (it uses `process.cwd()`) |
| `--timeout <seconds>` | `appExit(1)` after N seconds |
| `--config <key=value>` | Repeatable overlay: `model`, `provider`, `effort` / `reasoningEffort` / `model_reasoning_effort` |
| `--env <KEY=VALUE>` | Repeatable `process.env` for this invocation |
| `--print-selection` | Print overlaid selection JSON and exit; task optional |
| `-h, --help` | App help (lists the flags above) |
| `-V, --version` | This extension version |

Unknown flags still error. Overlay wraps `currentSelection()` in memory and never calls `saveSelection()`.

## Constraints

- Node ≥ 22.19
- Effort enum is `off | high | max` only (`xhigh` is rejected; use `max`)
- Credentials stay process env (`DEEPSEEK_API_KEY` / `--env`); this plugin does not read credential files
- WASM overlay is committed under `js/generated/`; `npm prepare` skips rustc when that glue exists
