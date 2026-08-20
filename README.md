# dsh-exec-extension

A DeepSeek Harness **bundle** for one-shot exec, in the same shape as official surface plugins (`dsh.bundle.patch` + `parseCmdline` + commander). Stock `headless-startup` only declares `[task...]`; this bundle disables that row and inserts a replacement that still provides `headlessStartup.task` for unmodified `headless-runner`.

The CLI follows **OpenCode `run`** and **Pi `-p`**: piped stdin is merged into the prompt, `@file` / `-f` attaches files, `--format json` streams session events, `--dir` sets cwd, `--yolo` is full access. Model overlay is in-process (Rust WASM) and never writes `$DSH_HOME/settings.yaml`.

## Install

```sh
dsh plugin --profile exec add @deepseek-ai/dsh-headless@0.1.0-rc.7
dsh plugin --profile exec add ./dsh-exec-extension
dsh --profile exec --help
```

Dedicated profile only. Stock `dsh --profile headless --model x "t"` must still fail.

## CLI

```text
dsh --profile exec [options] [--] [task|-]
cat README.md | dsh --profile exec "summarize this"
dsh --profile exec @notes.md --full-auto "use the notes"
```

| Flag | Meaning |
|------|---------|
| `-m, --model` | This-process model (never part of the task) |
| `--effort`, `--reasoning-effort` | `off\|high\|max` |
| `--thinking` | Pi thinking tiers; `xhigh`/`max` → `max`, `minimal`/`low`/`medium`/`high` → `high` |
| `--provider` | This-process provider |
| `-C, --cwd` / `--cd` / `--dir` | Working directory (published on `headlessStartup.cwd`) |
| `--timeout <seconds>` | `appExit(1)` after N seconds |
| `-s, --sandbox` / `--permission-mode` | `read-only` \| `workspace-write` \| `danger-full-access` |
| `--approval ask\|never\|allow` | `ask` fail-closes without a UI; `never` auto-denies; `allow` auto-grants |
| `--full-auto` | workspace-write + auto-allow (CI) |
| `--yolo` / `--dangerously-skip-permissions` | danger-full-access + never (OpenCode); full access |
| `--tools-mode native\|code\|both` | Tools presentation |
| `-f, --file` / `@path` | Attach file text into the task |
| `--output-schema <path>` | Prompt-level JSON Schema constraint (**not** constrained decode) |
| `-o, --output-last-message <path>` | Also write the final assistant text |
| `--format text\|json` / `--mode json` | `json` is session-event JSONL |
| `-c, --config key=value` | Repeatable this-process overlay |
| `--env KEY=VALUE` / `--api-key` | Process env only (not written to disk) |
| `--print-selection` | Print overlaid selection JSON and exit |

Unknown flags error. Overlay never calls `saveSelection()`.

`--output-schema` is a **prompt constraint**, not constrained decoding. `--approval allow` installs a process-local auto-grant because dsh `never` auto-**denies** and headless has no UI.

`headlessStartup` is `{ task, cwd, permissionMode, approvalPolicy, autoApprove, toolsMode?, format }`. sandbox-policy, approval, and tools inject that service (`!!js ctx.headlessStartup.*`). Stock `headless-runner` still only reads `task`.

## Non-goals

MCP, Host, HTTP, resume, `--image`, forking `headless-runner`. Put MCP on the profile patch + process env, not on this CLI.

## Develop

Node ≥ 22.19. WASM is committed; `prepare` skips rustc.

```sh
npm test
DSH_BIN=/path/to/dsh npm run acceptance
```
