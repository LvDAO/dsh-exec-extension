# dsh-exec-extension

Official-pattern DeepSeek Harness **bundle**. One-shot exec in the spirit of `opencode run` and `pi -p`: argv + piped stdin, file attachments, this-process model/sandbox flags, no settings writes.

```sh
dsh plugin --profile exec add @deepseek-ai/dsh-headless@0.1.0-rc.7
dsh plugin --profile exec add <this-package>
dsh --profile exec --help
```

Pin headless to **0.1.0-rc.7** (or `next`). Use a dedicated profile; do not add this to stock `headless`.

## CLI

Launcher flags first (`--profile`, `--dump-config`). App flags after:

```text
dsh --profile exec [options] [--] [task|-]
cat README.md | dsh --profile exec "summarize this"
dsh --profile exec @notes.md "answer from the notes"
```

| Flag | Meaning |
|------|---------|
| `-m, --model` | This-process model |
| `--effort`, `--reasoning-effort` | `off\|high\|max` |
| `--thinking` | Pi thinking tiers; `xhigh`/`max` → `max`, `minimal`/`low`/`medium`/`high` → `high` |
| `--provider` | This-process provider |
| `-C, --cwd` / `--cd` / `--dir` | Working directory (published on `headlessStartup.cwd` so sandbox-policy sees it) |
| `--timeout <seconds>` | `appExit(1)` after N seconds |
| `-s, --sandbox` / `--permission-mode` | `read-only` \| `workspace-write` \| `danger-full-access` |
| `--approval ask\|never\|allow` | `ask` fail-closes without a UI; `never` auto-denies; `allow` auto-grants |
| `--full-auto` | workspace-write + auto-allow (CI) |
| `--yolo` / `--dangerously-skip-permissions` | Skip permission prompts (auto-allow); does not disable the sandbox |
| `--tools-mode native\|code\|both` | Tools presentation |
| `-f, --file` / `@path` | Attach file text into the task |
| `--output-schema <path>` | Prompt-level JSON Schema constraint (not constrained decode) |
| `-o, --output-last-message <path>` | Also write the final assistant text |
| `--format text\|json` / `--mode json` | `json` is session-event JSONL (OpenCode/Pi) |
| `-c, --config key=value` | Repeatable overlay |
| `--env KEY=VALUE` / `--api-key` | Process env only |
| `--print-selection` | Print overlaid selection JSON and exit |

Unknown flags error. Overlay never calls `saveSelection()`.

`headlessStartup` is `{ task, cwd, permissionMode, approvalPolicy, autoApprove, toolsMode?, format }`. Stock `headless-runner` still only reads `task`. sandbox-policy, approval, and tools inject the service.

## Constraints

- Node ≥ 22.19; effort on `--effort` is `off\|high\|max` only
- Credentials: `DEEPSEEK_API_KEY` / `--api-key` / `--env`
- Committed WASM under `js/generated/`; `prepare` skips rustc when present
