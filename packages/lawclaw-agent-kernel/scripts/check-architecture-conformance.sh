#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DESIGN_DOC="${PROJECT_ROOT}/docs/design/agent-kernel-design.md"
REVIEW_DOC="${PROJECT_ROOT}/docs/design/agent-kernel-v2-architecture-review.md"
CATALOG_DOC="${PROJECT_ROOT}/docs/design/agent-kernel-domain-object-catalog.md"
APPROVAL_DOC="${PROJECT_ROOT}/docs/design/technical-approval-subsystem-design.md"
TOOL_DOC="${PROJECT_ROOT}/docs/design/tool-call-subsystem-design.md"
SESSION_FLOW_DOC="${PROJECT_ROOT}/docs/design/session-flow-engine-resource-subsystem-design.md"
OPS_INFRA_DOC="${PROJECT_ROOT}/docs/design/operations-infrastructure-minimum-design.md"
DIAGRAM_DIR="${PROJECT_ROOT}/docs/design/diagrams"

required_constraints=(
  UP-AGT-001 UP-AGT-002 UP-AGT-003 UP-AGT-004 UP-AGT-005
  UP-AGT-006 UP-AGT-007 UP-AGT-008 UP-AGT-009 UP-AGT-010
  UP-CTX-001 UP-CTX-002 UP-CTX-003 UP-TOOL-001 UP-DEL-001
  UP-DAT-001 UP-SEC-001 UP-RES-001 UP-OBS-001
  UP-INF-001 UP-INF-002 UP-DEP-001 UP-DEP-002 UP-DEP-003
)

for constraint_id in "${required_constraints[@]}"; do
  if ! rg -q "${constraint_id}" "${DESIGN_DOC}"; then
    echo "错误：主设计缺少上层约束 ${constraint_id} 的追踪记录。" >&2
    exit 1
  fi
done

required_v3_patterns=(
  'AgentRun.*核心执行聚合根'
  'AgentRuntime.*可重建'
  'AgentSession.*不是进程'
  'FlowEngine.*无状态'
  'Allow / Ask / Deny'
  'ExecutionPermit.*唯一'
  'Child Run.*Scheduler'
  'Multi-agent.*上层业务编排'
  'Kernel Core 不导入 Pi、Bun、SQLite、HTTP'
)

for pattern in "${required_v3_patterns[@]}"; do
  if ! rg -q "${pattern}" "${DESIGN_DOC}"; then
    echo "错误：主设计缺少 V3 约束：${pattern}" >&2
    exit 1
  fi
done

normative_sources=(
  "${DESIGN_DOC}"
  "${REVIEW_DOC}"
  "${CATALOG_DOC}"
  "${APPROVAL_DOC}"
  "${TOOL_DOC}"
  "${SESSION_FLOW_DOC}"
  "${OPS_INFRA_DOC}"
  "${DIAGRAM_DIR}"/*.puml
  "${DIAGRAM_DIR}"/domain/*.puml
)

candidate_design_sources=(
  "${DESIGN_DOC}"
  "${REVIEW_DOC}"
  "${CATALOG_DOC}"
  "${SESSION_FLOW_DOC}"
  "${DIAGRAM_DIR}"/*.puml
  "${DIAGRAM_DIR}"/domain/*.puml
)

forbidden_patterns=(
  'AgentRuntime 聚合根'
  'Runtime 是唯一聚合根'
  'Session 拥有多次 AgentRun'
  'PermissionGrant'
  'PermissionApprovalPort'
  '最大委派深度为 1'
  '子 Run 禁止再次委派'
  '单层子 Agent'
  'single-level subagent'
  'tenant_id'
  'tenantId:'
)

for pattern in "${forbidden_patterns[@]}"; do
  if rg -n --fixed-strings "${pattern}" "${normative_sources[@]}"; then
    echo "错误：V3 规范性产物仍包含已移除设计：${pattern}" >&2
    exit 1
  fi
done

for forbidden_type in 'class MultiAgentRun' 'class Participant' 'class RoleAssignment' 'class TeamMessage' 'component "MultiAgentManager' 'interface MultiAgentPort'; do
  if rg -n --fixed-strings "${forbidden_type}" "${candidate_design_sources[@]}"; then
    echo "错误：Kernel 候选设计仍定义上层 Multi-agent 类型：${forbidden_type}" >&2
    exit 1
  fi
done

if rg -n --glob '*.puml' '(Pi|ACP).*(-+>|\.+>).*(业务编排|Workflow)|(业务编排|Workflow).*(-+>|\.+>).*(Pi|ACP)' "${DIAGRAM_DIR}"; then
  echo "错误：图中出现业务编排与具体 Agent Adapter 的直接调用。" >&2
  exit 1
fi

if rg -n --glob '*.puml' '(Agent Kernel|Agent内核).*(WorkflowInstance|WorkflowStep|ApprovalCase|业务 Conversation)' "${DIAGRAM_DIR}"; then
  echo "错误：图中疑似把业务模型放入 Agent Kernel。" >&2
  exit 1
fi

echo "Agent Kernel System V3.1 文档基线与依赖静态检查通过。"
