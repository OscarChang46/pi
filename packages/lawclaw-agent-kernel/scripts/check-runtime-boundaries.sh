#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if rg -n "@earendil-works/pi-|bun:sqlite|from ['\"](?:express|fastify)" \
  "${PROJECT_ROOT}/src/contracts" "${PROJECT_ROOT}/src/control" "${PROJECT_ROOT}/src/cognitive/agent-runtime.ts" "${PROJECT_ROOT}/src/tools" "${PROJECT_ROOT}/src/security" "${PROJECT_ROOT}/src/observability"; then
  echo "错误：Kernel/Contracts 导入了具体 Runtime、存储或 HTTP 框架。" >&2
  exit 1
fi

if rg -n 'export (interface|type|class) .*\b(WorkflowInstance|WorkflowStep|ApprovalCase|Conversation)\b' \
  "${PROJECT_ROOT}/src/contracts" "${PROJECT_ROOT}/src/control" "${PROJECT_ROOT}/src/cognitive/agent-runtime.ts" "${PROJECT_ROOT}/src/tools" "${PROJECT_ROOT}/src/security" "${PROJECT_ROOT}/src/observability"; then
  echo "错误：Kernel/Contracts 出现了业务编排或业务会话类型。" >&2
  exit 1
fi

if rg -n '\bnew (PiAgentAdapter|ReadOnlyToolProvider|PiCliDelegationProvider|FakeDelegationProvider)\b' \
  "${PROJECT_ROOT}/src/control" "${PROJECT_ROOT}/src/cognitive/agent-runtime.ts" "${PROJECT_ROOT}/src/tools" "${PROJECT_ROOT}/src/security" "${PROJECT_ROOT}/src/observability" "${PROJECT_ROOT}/src/contracts"; then
  echo "错误：具体 Adapter 在 Composition Root 之外被实例化。" >&2
  exit 1
fi

for required_config_file in \
  "${PROJECT_ROOT}/config/agent-kernel.yaml" \
  "${PROJECT_ROOT}/config/prompts.zh-CN.yaml"; do
  if [[ ! -s "${required_config_file}" ]]; then
    echo "错误：缺少模型或系统提示词配置 ${required_config_file}。" >&2
    exit 1
  fi
done

if rg -n '你是 LawClaw' "${PROJECT_ROOT}/src"; then
  echo "错误：运行时代码中出现硬编码系统提示词，应改为 Prompt Catalog ID。" >&2
  exit 1
fi

if rg -n 'provider:[[:space:]]*["'\'']|modelId:[[:space:]]*["'\'']' \
  "${PROJECT_ROOT}/src/application" "${PROJECT_ROOT}/src/pi-cli"; then
  echo "错误：Composition Root 或 Pi CLI 中出现硬编码模型选择。" >&2
  exit 1
fi

required_config_sections=(model prompts kernel tools cli runtime runLimits readOnly delegationPolicy toolPolicy)
for section in "${required_config_sections[@]}"; do
  if ! rg -q "${section}" "${PROJECT_ROOT}/config/agent-kernel.yaml"; then
    echo "错误：统一配置缺少运行参数区域 ${section}。" >&2
    exit 1
  fi
done

if rg -n 'const MAX_|static readonly #max' \
  "${PROJECT_ROOT}/src/control" "${PROJECT_ROOT}/src/cognitive/agent-runtime.ts" "${PROJECT_ROOT}/src/tools" "${PROJECT_ROOT}/src/security" "${PROJECT_ROOT}/src/observability" "${PROJECT_ROOT}/src/execution" "${PROJECT_ROOT}/src/infrastructure"; then
  echo "错误：Kernel/Adapter 出现未注入的可调容量常量。" >&2
  exit 1
fi

if rg -n 'from ["'\'']\.\./config/' "${PROJECT_ROOT}/src/control" "${PROJECT_ROOT}/src/cognitive/agent-runtime.ts" "${PROJECT_ROOT}/src/tools" "${PROJECT_ROOT}/src/security" "${PROJECT_ROOT}/src/observability"; then
  echo "错误：Kernel 不得直接读取或依赖配置加载器。" >&2
  exit 1
fi

if rg -n 'new Date|Date\.now|Date\.parse' \
  "${PROJECT_ROOT}/src/control" "${PROJECT_ROOT}/src/cognitive/agent-runtime.ts" "${PROJECT_ROOT}/src/tools" "${PROJECT_ROOT}/src/security" "${PROJECT_ROOT}/src/observability" \
  "${PROJECT_ROOT}/src/application" \
  "${PROJECT_ROOT}/src/pi-cli" \
  "${PROJECT_ROOT}/src/execution" "${PROJECT_ROOT}/src/infrastructure" \
  --glob '!system-time-adapter.ts'; then
  echo "错误：除 SystemTimeAdapter 外的运行时代码绕过 TimePort 访问系统时间。" >&2
  exit 1
fi

if ! rg -q 'interface TimePort' "${PROJECT_ROOT}/src/contracts/types.ts" || \
   ! rg -q 'readonly time: TimeContext' "${PROJECT_ROOT}/src/contracts/types.ts"; then
  echo "错误：统一 TimePort 或 RequestContext 时区契约缺失。" >&2
  exit 1
fi

forbidden_temporary_term='de''mo'
if rg -n -i "${forbidden_temporary_term}" \
  "${PROJECT_ROOT}/src" \
  "${PROJECT_ROOT}/test" \
  "${PROJECT_ROOT}/config" \
  "${PROJECT_ROOT}/scripts" \
  "${PROJECT_ROOT}/README.md" \
  "${PROJECT_ROOT}/package.json"; then
  echo "错误：正式工程的代码、函数签名、注释或活跃配置重新出现临时演示命名。" >&2
  exit 1
fi

node -e '
  const p = require(process.argv[1]);
  const workspaceBaseline = ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent"];
  for (const name of workspaceBaseline) {
    if (p.dependencies?.[name] !== "^0.84.4") {
      console.error(`错误：${name} 必须与 Pi workspace 0.84.4 基线一致。`);
      process.exit(1);
    }
  }
  if (p.dependencies?.["@earendil-works/pi-agent-core"] !== undefined) {
    console.error("错误：Kernel 不得直接依赖 Pi 原生 Agent Loop。");
    process.exit(1);
  }
' "${PROJECT_ROOT}/package.json"

echo "运行时依赖与职责边界检查通过。"

node "${SCRIPT_DIR}/check-source-boundaries.mjs"
node "${SCRIPT_DIR}/check-flow-state-constants.mjs"
