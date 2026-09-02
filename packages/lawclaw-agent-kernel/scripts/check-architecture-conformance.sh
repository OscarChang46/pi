#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DESIGN_DOC="${PROJECT_ROOT}/docs/design/agent-kernel-design.md"
DIAGRAM_DIR="${PROJECT_ROOT}/docs/design/diagrams"

required_constraints=(
  UP-AGT-001 UP-AGT-002 UP-AGT-003 UP-AGT-004 UP-AGT-005
  UP-AGT-006 UP-AGT-007 UP-AGT-008 UP-AGT-009 UP-AGT-010
  UP-CTX-001 UP-CTX-002 UP-CTX-003 UP-TOOL-001 UP-DEL-001
  UP-DAT-001 UP-SEC-001 UP-RES-001
  UP-OBS-001 UP-INF-001 UP-INF-002 UP-DEP-001 UP-DEP-002 UP-DEP-003
)

for constraint_id in "${required_constraints[@]}"; do
  if ! rg -q "${constraint_id}" "${DESIGN_DOC}" "${DIAGRAM_DIR}"/*.puml; then
    echo "错误：缺少上层约束 ${constraint_id} 的追踪记录。" >&2
    exit 1
  fi
done

if rg -n --glob '*.puml' '(Pi|ACP).*(-+>|\.+>).*(业务编排|Workflow)|(业务编排|Workflow).*(-+>|\.+>).*(Pi|ACP)' "${DIAGRAM_DIR}"; then
  echo "错误：图中出现业务编排与具体 Agent Runtime 的直接调用。" >&2
  exit 1
fi

if rg -n --glob '*.puml' '(Agent Kernel|Agent内核|Agent Kernel 内部).*(WorkflowInstance|WorkflowStep|ApprovalCase|Conversation)' "${DIAGRAM_DIR}"; then
  echo "错误：图中疑似把业务模型放入 Agent Kernel。" >&2
  exit 1
fi

if ! rg -q '不得拥有.*WorkflowInstance' "${DESIGN_DOC}"; then
  echo "错误：设计文档未固化 Workflow 禁止职责。" >&2
  exit 1
fi

if ! rg -q '不得拥有.*ApprovalCase' "${DESIGN_DOC}"; then
  echo "错误：设计文档未固化业务审批禁止职责。" >&2
  exit 1
fi

if ! rg -q '最大委派深度为 1' "${DESIGN_DOC}" || ! rg -q '子 Run 禁止再次委派' "${DESIGN_DOC}"; then
  echo "错误：未固化首版单层子 Agent 的深度边界。" >&2
  exit 1
fi

if ! rg -q 'Context Engine.*不拥有业务 Conversation' "${DESIGN_DOC}"; then
  echo "错误：未固化规范化执行上下文与业务 Conversation 的所有权边界。" >&2
  exit 1
fi

if ! rg -q 'run.resume.*不属于首版' "${DESIGN_DOC}"; then
  echo "错误：未明确把同 Run 恢复降为后续可选能力。" >&2
  exit 1
fi

if ! rg -q '@earendil-works/pi-ai@0\.84\.4' "${DESIGN_DOC}" || \
   ! rg -q '@earendil-works/pi-coding-agent@0\.84\.4' "${DESIGN_DOC}"; then
  echo "错误：Pi workspace 依赖未对齐 0.84.4 基线。" >&2
  exit 1
fi

echo "总体架构职责与依赖静态检查通过。"
