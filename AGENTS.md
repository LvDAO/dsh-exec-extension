# dsh-exec-extension

Official-pattern DeepSeek Harness **bundle**. One-shot exec in the spirit of `opencode run` and `pi -p`: argv + piped stdin, file attachments, this-process model/sandbox flags, no settings writes.

```sh
dsh plugin --profile exec add @deepseek-ai/dsh-headless@0.1.0-rc.7
dsh plugin --profile exec add <this-package>
dsh --profile exec --help
```

Pin headless to **0.1.0-rc.7** (or `next`). Use a dedicated profile; do not add this to stock `headless`.

## CLI

Live flag grammar is commander in `js/command.js` (via `@deepseek-ai/dsh-cmdline` `parseCmdline`). Rust WASM is **overlay only** (`overlaySelection`). The WASM `parseArgv` helper is not the live CLI.

Launcher flags first (`--profile`, `--dump-config`). App flags after:

```text
dsh --profile exec [options] [--] [task|-]
cat README.md | dsh --profile exec "summarize this"
dsh --profile exec @notes.md "answer from the notes"
```

`--` stops flag parsing (remaining words are the task). Unknown flags error. Overlay never calls `saveSelection()`.

| Flag | Meaning |
|------|---------|
| `-m, --model` | This-process model; never part of the task |
| `--effort`, `--reasoning-effort` | `off\|high\|max` only (`xhigh` is rejected; use `max`) |
| `--thinking` | Pi tiers: `off` → `off`; `xhigh`/`max` → `max`; `minimal`/`low`/`medium`/`high` → `high` |
| `--provider` | This-process provider |
| `-C, --cwd` / `--cd` / `--dir` | Working directory (`process.chdir` until dispose; published on `headlessStartup.cwd`) |
| `--timeout <seconds>` | Positive seconds; `appExit(1)` after N seconds with a stderr timeout line |
| `-s, --sandbox` / `--permission-mode` | `read-only` \| `workspace-write` \| `danger-full-access`. `-s` wins if both are set |
| `--approval ask\|never\|allow` | `ask` fail-closes without a UI (no auto-grant); `never` auto-denies; `allow` is ask + auto-grant (`allowed-once`) |
| `--full-auto` | Auto-allow. Default sandbox stays `workspace-write`; does **not** escalate to `danger-full-access`. Explicit `--sandbox` is kept |
| `--yolo` / `--dangerously-skip-permissions` | Preset: `danger-full-access` + `never`. Wins over `--sandbox`, `--approval`, and `--full-auto` |
| `--tools-mode native\|code\|both` | Published on `headlessStartup.toolsMode` |
| `-f, --file` / `@path` | Attach file text into the task (10MB cap per file) |
| `--output-schema <path>` | Prompt-level JSON Schema suffix (valid JSON required; not constrained decode) |
| `-o, --output-last-message <path>` | Also write the captured final assistant text on dispose |
| `--format text\|json` / `--mode json` | `json` is one JSONL object `{ type, seq, data }` per `session/event`; runner final text is swallowed. `--config format=`/`mode=` win over the named flags; otherwise `--mode` wins over `--format` |
| `-c, --config key=value` | Repeatable overlay. Keys: `model`, `provider`, `effort` (`reasoningEffort`, `model_reasoning_effort`), `sandbox` (`permissionMode`, `permission_mode`), `approval`, `toolsMode` (`tools_mode`), `format` (`mode`). Later `--config` entries win over earlier named flags. Unknown keys fail |
| `--env KEY=VALUE` | Process env for this invocation; restored on dispose |
| `--api-key` | This-process `DEEPSEEK_API_KEY`; not written to disk |
| `--print-selection` | Print overlaid selection JSON and exit 0; no `headlessStartup` |
| `-V, --version` | This extension version |
| `-h, --help` | Commander help (lists the flags above) |

Stdin: OpenCode order (argv task, then stdin). `-` as the task is stdin only and requires a pipe. Auto-read of stdin is skipped when `NODE_TEST_CONTEXT` is set (so `node --test` does not consume the runner's stdin).

`headlessStartup` is `{ task, cwd, permissionMode, approvalPolicy, autoApprove, toolsMode?, format }`. Stock `headless-runner` still only reads `task`. sandbox-policy, approval, and tools inject the service (`!!js ctx.headlessStartup.*`). The approval `!!js` expression is double-quoted so YAML accepts the ternary.

### Policy composition

- Default: sandbox `workspace-write`, approval `ask`, `autoApprove` false (fail-closed; no `approval/request` answerer).
- `danger-full-access` without `--approval` defaults to `never` (auto-deny), which turns off `--full-auto` auto-grant. Combine with `--approval allow` to keep auto-grant on danger.
- `--full-auto` + `--sandbox read-only` stays read-only + auto-grant.
- `--yolo` (or `--dangerously-skip-permissions`) always yields danger-full-access + never + no auto-grant.

## Constraints

- Node ≥ 22.19; effort on `--effort` is `off\|high\|max` only
- Credentials: `DEEPSEEK_API_KEY` / `--api-key` / `--env` (process env only)
- Committed WASM under `js/generated/`; `prepare` skips rustc when present
- wasm-bindgen CLI **0.2.100**
- Do not add this bundle to stock `headless`; do not fork `headless-runner`

## Tests

- `npm test`: Rust overlay + hosted WASM `parseArgv` (not live CLI) + Node tests for commander, policy, startup, output, patch, and optional real ADM
- `npm run acceptance`: live `dsh --profile exec` composition (no API key). CI runs this after installing `@deepseek-ai/dsh@0.1.0-rc.7`
