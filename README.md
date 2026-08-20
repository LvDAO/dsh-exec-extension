# dsh-exec-extension

A DeepSeek Harness **bundle** for one-shot exec, in the same shape as official surface plugins (`dsh.bundle.patch` + `parseCmdline` + commander). Stock `headless-startup` only declares `[task...]`; this bundle disables that row and inserts a replacement that still provides `headlessStartup.task` for unmodified `headless-runner`.

The CLI follows **OpenCode `run`** and **Pi `-p`**: piped stdin is merged into the prompt, `@file` / `-f` attaches files, `--format json` streams session events, `--dir` sets cwd, `--yolo` is danger-full-access + never. Model overlay is in-process (Rust WASM `overlaySelection` only) and never writes `$DSH_HOME/settings.yaml`. Live flags are commander in `js/command.js`; see [AGENTS.md](AGENTS.md) for the contract tests pin.

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

See [AGENTS.md](AGENTS.md) for the flag table. Highlights:

- **Who:** `--model` / `--effort` / `--thinking` / `--provider`
- **Where:** `--cwd` / `--dir`, `--sandbox`
- **How:** `--approval` / `--full-auto` / `--yolo`, `--timeout`, `--tools-mode`
- **Task:** argv, stdin, `-`, `-f` / `@path`, `--output-schema`
- **Out:** stdout last message, `-o`, `--format json`, `--print-selection`

`--output-schema` is a **prompt constraint**, not constrained decoding. `--approval allow` installs a process-local auto-grant because dsh `never` auto-**denies** and headless has no UI.

`headlessStartup` is `{ task, cwd, permissionMode, approvalPolicy, autoApprove, toolsMode?, format }`. sandbox-policy, approval, and tools inject that service (`!!js ctx.headlessStartup.*`).

## Non-goals

MCP, Host, HTTP, resume, `--image`, forking `headless-runner`. Put MCP on the profile patch + process env, not on this CLI.

## Develop

Node ≥ 22.19. WASM is committed; `prepare` skips rustc.

```sh
npm test
DSH_BIN=/path/to/dsh npm run acceptance
```

`npm test` covers the flag table in AGENTS.md. `npm run acceptance` is the live `dsh --profile exec` composition check (no API key).
