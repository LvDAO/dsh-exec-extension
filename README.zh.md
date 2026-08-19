# dsh-exec-extension

DeepSeek Harness **bundle**，一次性 exec，形状与官方 surface 插件相同（`dsh.bundle.patch` + `parseCmdline` + commander）。官方 `headless-startup` 只声明 `[task...]`；本包禁用该行并插入仍提供 `headlessStartup.task` 的实现，**不改** `headless-runner`。

CLI 对齐 **OpenCode `run`** 与 **Pi `-p`**：stdin 拼进 prompt，`@file` / `-f` 附文件，`--format json` 打 session 事件流，`--dir` 设 cwd，`--yolo` 为全开权限。模型覆盖只在进程内（Rust WASM），不写 `settings.yaml`。

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

旗标表见 [AGENTS.md](AGENTS.md)。`--output-schema` 只是 **prompt 约束**，不是解码期强制。`--approval allow` 会装本进程 auto-grant：dsh 的 `never` 是自动拒绝，headless 又没有审批 UI。

`headlessStartup` 为 `{ task, cwd, permissionMode, approvalPolicy, autoApprove, toolsMode?, format }`。sandbox-policy / approval / tools 通过 `!!js ctx.headlessStartup.*` 注入。

## 非目标

MCP、Host、HTTP、resume、`--image`、分叉 `headless-runner`。MCP 放 profile 静态 patch + 进程 env。

```sh
npm test
DSH_BIN=/path/to/dsh npm run acceptance
```
