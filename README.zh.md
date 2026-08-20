# dsh-exec-extension

DeepSeek Harness **bundle**，一次性 exec，形状与官方 surface 插件相同（`dsh.bundle.patch` + `parseCmdline` + commander）。官方 `headless-startup` 只声明 `[task...]`；本包禁用该行并插入仍提供 `headlessStartup.task` 的实现，**不改** `headless-runner`。

CLI 对齐 **OpenCode `run`** 与 **Pi `-p`**：stdin 拼进 prompt，`@file` / `-f` 附文件，`--format json` 打 session 事件流，`--dir` 设 cwd，`--yolo` 跳过审批询问（**不**关闭 sandbox，不是全开权限）。模型覆盖只在进程内（Rust WASM），不写 `settings.yaml`。

## 安装

```sh
dsh plugin --profile exec add @deepseek-ai/dsh-headless@0.1.0-rc.7
dsh plugin --profile exec add ./dsh-exec-extension
dsh --profile exec --help
```

只用独立 profile。官方 `headless --model` 必须仍因未知选项失败。

## 命令行

```text
dsh --profile exec [options] [--] [task|-]
cat README.md | dsh --profile exec "summarize this"
dsh --profile exec @notes.md --full-auto "use the notes"
```

| 旗标 | 含义 |
|------|------|
| `-m, --model` | 本进程模型（不进入 task） |
| `--effort`, `--reasoning-effort` | `off\|high\|max` |
| `--thinking` | Pi 档位；`xhigh`/`max` → `max`，`minimal`/`low`/`medium`/`high` → `high` |
| `--provider` | 本进程 provider |
| `-C, --cwd` / `--cd` / `--dir` | 工作目录（发布到 `headlessStartup.cwd`） |
| `--timeout <seconds>` | N 秒后 `appExit(1)` |
| `-s, --sandbox` / `--permission-mode` | `read-only` \| `workspace-write` \| `danger-full-access` |
| `--approval ask\|never\|allow` | `ask` 无 UI 则 fail-closed；`never` 自动拒绝；`allow` 自动批准 |
| `--full-auto` | workspace-write + auto-allow（CI） |
| `--yolo` / `--dangerously-skip-permissions` | 跳过审批询问（auto-allow）。**不**设 `danger-full-access`；默认 sandbox 仍是 `workspace-write`。全开权限请用 `--sandbox danger-full-access` |
| `--tools-mode native\|code\|both` | 工具呈现 |
| `-f, --file` / `@path` | 把文件正文附进 task |
| `--output-schema <path>` | **prompt 约束** JSON Schema，不是解码期强制 |
| `-o, --output-last-message <path>` | 同时把最终 assistant 文本写入文件 |
| `--format text\|json` / `--mode json` | `json` 为 session 事件 JSONL |
| `-c, --config key=value` | 可重复的本进程覆盖 |
| `--env KEY=VALUE` / `--api-key` | 只改进程环境变量，不写盘 |
| `--print-selection` | 打印 overlay 后的 selection JSON 并退出 |

未知旗标报错。Overlay 从不调用 `saveSelection()`。

`--output-schema` 只是 **prompt 约束**，不是解码期强制。`--approval allow` 会装本进程 auto-grant：dsh 的 `never` 是自动拒绝，headless 又没有审批 UI。

`headlessStartup` 为 `{ task, cwd, permissionMode, approvalPolicy, autoApprove, toolsMode?, format }`。sandbox-policy / approval / tools 通过 `!!js ctx.headlessStartup.*` 注入。官方 `headless-runner` 仍只读 `task`。

## 非目标

MCP、Host、HTTP、resume、`--image`、分叉 `headless-runner`。MCP 放 profile 静态 patch + 进程 env。

```sh
npm test
DSH_BIN=/path/to/dsh npm run acceptance
```
