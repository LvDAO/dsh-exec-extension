#!/usr/bin/env bash
# Live dsh acceptance for dsh-exec-extension. Requires Node >= 22.19 and a
# dsh 0.1.0-rc.7 install. Does not call a provider (no API key needed for the
# CLI/composition checks). Overlay against real AgentDefaultModelConfig is
# js/integration.real-adm.test.js.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSH_BIN="${DSH_BIN:-$(command -v dsh || true)}"
if [[ -z "$DSH_BIN" ]]; then
  echo "acceptance: dsh not on PATH; set DSH_BIN" >&2
  exit 2
fi

STOCK_HOME="$(mktemp -d "${TMPDIR:-/tmp}/dsh-exec-stock.XXXXXX")"
EXEC_HOME="$(mktemp -d "${TMPDIR:-/tmp}/dsh-exec-exec.XXXXXX")"
cleanup() { rm -rf "$STOCK_HOME" "$EXEC_HOME"; }
trap cleanup EXIT

echo "== stock headless still rejects --model =="
DSH_HOME="$STOCK_HOME" out="$("$DSH_BIN" --profile headless --model x t 2>&1 || true)"
printf '%s\n' "$out"
printf '%s\n' "$out" | grep -q "unknown option '--model'"

echo "== install dedicated exec profile =="
DSH_HOME="$EXEC_HOME" "$DSH_BIN" plugin --profile exec add @deepseek-ai/dsh-headless@0.1.0-rc.7
DSH_HOME="$EXEC_HOME" "$DSH_BIN" plugin --profile exec add "$ROOT"

echo "== dump-config disables stock startup and injects headlessStartup =="
dump="$(DSH_HOME="$EXEC_HOME" "$DSH_BIN" --profile exec --dump-config)"
printf '%s\n' "$dump" | grep -A2 'id: headless-startup' | grep -q 'disabled: true'
printf '%s\n' "$dump" | grep -q 'id: exec-extension-startup'
printf '%s\n' "$dump" | grep -q 'name: dsh-exec-extension/startup'
printf '%s\n' "$dump" | grep -q 'ctx.headlessStartup.permissionMode'
printf '%s\n' "$dump" | grep -q 'ctx.headlessStartup.approvalPolicy'
printf '%s\n' "$dump" | grep -q 'ctx.headlessStartup.toolsMode'
printf '%s\n' "$dump" | grep -q 'ctx.headlessStartup.cwd'

echo "== exec --help lists flags =="
help="$(DSH_HOME="$EXEC_HOME" "$DSH_BIN" --profile exec --help)"
printf '%s\n' "$help"
for flag in \
  --model --effort --sandbox --approval --full-auto --file --format \
  --output-schema --tools-mode --thinking --yolo --timeout --api-key \
  --print-selection --permission-mode --cwd --env --dangerously-skip-permissions \
  --output-last-message --provider
do
  printf '%s\n' "$help" | grep -q -- "$flag"
done

echo "== missing task / unknown option =="
task_out="$(DSH_HOME="$EXEC_HOME" "$DSH_BIN" --profile exec 2>&1 || true)"
printf '%s\n' "$task_out" | grep -q 'a task is required'
unk_out="$(DSH_HOME="$EXEC_HOME" "$DSH_BIN" --profile exec --not-a-real-flag t 2>&1 || true)"
printf '%s\n' "$unk_out" | grep -q "unknown option '--not-a-real-flag'"

echo "== --print-selection does not require a task =="
sel_out="$(DSH_HOME="$EXEC_HOME" "$DSH_BIN" --profile exec --print-selection --model deepseek-v4-pro --effort max 2>&1 || true)"
printf '%s\n' "$sel_out"
printf '%s\n' "$sel_out" | grep -q 'deepseek-v4-pro'

echo "== --print-selection --config does not require a task =="
cfg_out="$(DSH_HOME="$EXEC_HOME" "$DSH_BIN" --profile exec --print-selection --config model=deepseek-v4-pro 2>&1 || true)"
printf '%s\n' "$cfg_out"
printf '%s\n' "$cfg_out" | grep -q 'deepseek-v4-pro'

echo "== stdin merge does not write settings =="
printf 'piped body\n' | DSH_HOME="$EXEC_HOME" "$DSH_BIN" --profile exec --sandbox read-only "summarize" >/dev/null 2>&1 || true
if [[ -e "$EXEC_HOME/settings.yaml" ]]; then
  echo "acceptance: settings.yaml was created" >&2
  exit 1
fi
if [[ -e "$EXEC_HOME/.credentials.yaml" ]]; then
  echo "acceptance: .credentials.yaml was created" >&2
  exit 1
fi

echo "acceptance: ok"
