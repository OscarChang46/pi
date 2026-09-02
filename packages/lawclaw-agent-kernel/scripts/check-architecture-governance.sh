#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROCESS_DOC="${PROJECT_ROOT}/docs/governance/architecture-change-process.md"
BASELINE="${PROJECT_ROOT}/docs/governance/architecture-baseline.yaml"
CHANGE="${PROJECT_ROOT}/docs/governance/changes/ACR-2026-0006-pi-monorepo-integration.md"

for required_file in "${PROCESS_DOC}" "${BASELINE}" "${CHANGE}"; do
  if [[ ! -s "${required_file}" ]]; then
    echo "错误：缺少架构治理产物 ${required_file}" >&2
    exit 1
  fi
done

required_process_terms=(
  "DRAFT" "IMPACT_ANALYZED" "APPROVED" "VERIFIED" "BASELINED"
  "上层优先" "质量波动预算" "不扩权替代方案" "总体 Draw.io"
)

for term in "${required_process_terms[@]}"; do
  if ! rg -q "${term}" "${PROCESS_DOC}"; then
    echo "错误：架构变更流程缺少必需语义：${term}" >&2
    exit 1
  fi
done

if ! rg -q 'baseline_id: "AKB-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}"' "${BASELINE}"; then
  echo "错误：架构基线编号不符合规范。" >&2
  exit 1
fi

if ! rg -q '状态：(APPROVED|IMPLEMENTING|VERIFIED|BASELINED|CLOSED)' "${CHANGE}"; then
  echo "错误：当前 ACR 尚未获得实现授权。" >&2
  exit 1
fi

if ! rg -q '总体 Draw.io：对外职责不变，无需修改' "${CHANGE}"; then
  echo "错误：ACR 未说明总体 Draw.io 是否需要同步。" >&2
  exit 1
fi

if ! rg -q 'ACR-2026-0006' "${BASELINE}"; then
  echo "错误：Pi monorepo 集成变更尚未写入当前架构基线。" >&2
  exit 1
fi

echo "架构变更治理检查通过。"
