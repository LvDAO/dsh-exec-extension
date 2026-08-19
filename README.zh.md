# dsh-exec-extension

DeepSeek Harness **bundle**：替换官方 `headless-startup`，让一次性 headless 接受本进程的 `--model` / `--effort` / `--provider`，且**不写** `$DSH_HOME/settings.yaml`。

官方 `@deepseek-ai/dsh-headless` 的 commander 只声明 `[task...]`。旁路插件即使也读 `ctx.cmdlineArgs`，也挡不住官方 `program.parse()` 把 `--model` 当成未知选项。本 bundle **禁用**该行，再插入仍提供同一服务的实现：

```ts
headlessStartup = { task: string }
```

官方 `headless-runner` 不改：注入 `headlessStartup`，从 lazy config 读 `task`，再用 `ctx.agentDefaultModel.currentSelection()` 建 Agent。

契约逻辑（argv、effort 枚举、selection 覆盖）用 **Rust** 写成 WASM；`js/startup.js` 只做 Cordis `apply` 胶水。

## 命令行

启动器旗标在前，应用旗标在后：

```text
dsh --profile <profile> [--model <id>] [--effort off|high|max] [--provider <id>] [--] <task>
```

| 参数 | 必填 | 含义 |
|------|------|------|
| `--model` | 否 | 本进程默认模型。省略则沿用 `ctx.agentDefaultModel`（settings / 组合）。 |
| `--effort` | 否 | 本进程 `reasoningEffort`。省略则**不注入** effort。 |
| `--provider` | 否 | 本进程 provider。省略则用部署默认（通常 `deepseek-official`）。 |
| `<task>` | 是 | 任务文本；多词用空格拼接（与官方 headless 相同）。 |

`--help` 必须列出上述旗标。

`--model foo prove X`：`foo` 是模型，**绝不会**进入 `task`。

`--effort` 只接受 `off | high | max`。出现 `--model` 时原样使用，不按模型 id 特例。

## 覆盖语义

- 包装 `ctx.agentDefaultModel.currentSelection()`，让本进程的 `headless-runner` 看到旗标。
- **不**调用 `saveSelection()`，不写 `settings.yaml`、`.credentials.yaml`、profile 的 `cordis.patch.yml`。
- 隔离只靠 argv + 进程内存。N 个并发 `dsh` 进程共享同一 `$DSH_HOME` 时互不覆盖；带 `--model` / `--effort` 的一次运行前后，共享文件字节级不变。

## 安装

profile 上必须**先有** `@deepseek-ai/dsh-headless@0.1.0-rc.7`（npm `latest` 仍是旧的 `0.0.1-rc.1`，请钉 `0.1.0-rc.7` 或 `next` 标签），再安装本 bundle（`dsh plugin add` 追加）。新 profile 初始只有 `dsh-base`。Node **≥ 22.19**（dsh 使用 `node:zlib` 的 zstd）。

```sh
dsh plugin --profile exec add @deepseek-ai/dsh-headless@0.1.0-rc.7
dsh plugin --profile exec add ./dsh-exec-extension
```

不要把它装进仍需保留「官方 `dsh --profile headless --model x "t"` 因未知选项失败」的 profile。用独立 profile（示例名：`exec`）。

```sh
dsh --profile exec --dump-config
```

应看到 `headless-startup` 为 `disabled: true`，以及 `exec-extension-startup` → `dsh-exec-extension/startup`。

```sh
dsh --profile exec --model deepseek-v4-pro --effort max "run the tests"
dsh --profile exec --help
```

凭据仍走进程环境（`DEEPSEEK_API_KEY`）。本插件不读、不复制凭据文件。

## 为何是禁用而不是改 name

Cordis `applyEntryPatches` 在 id 补丁的 `name` 与现有行不一致时会 **跳过**（`patch: name mismatch`）。对 `headless-startup` 重写 `name` 换不成模块。因此禁用官方行，再插入新 id，同时继续 `provide('headlessStartup', …)`。

## 非目标

- MCP、Host、HTTP、Web
- 常驻守护进程 / worker 名册
- Codex 的 `--config model_reasoning_effort=…`
- 每次运行生成 `--patch` YAML
- 分叉或改写 `headless-runner`

## 开发

Rust 1.83+、Node 22.19+、`wasm-bindgen-cli` **0.2.100**（须与 `Cargo.toml` 一致）。

```sh
npm test
npm run build
```

兼容铰链：`headlessStartup` 服务名；请钉住 `@deepseek-ai/dsh-headless` `0.1.0-rc.7`（npm `next`）。

```sh
npm test
DSH_BIN=/path/to/dsh npm run acceptance
```
