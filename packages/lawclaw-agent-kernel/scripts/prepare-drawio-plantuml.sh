#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOMAIN_DIR="${PROJECT_ROOT}/docs/design/diagrams/domain"
THEME_FILE="${DOMAIN_DIR}/drawio-theme.puml"

if [[ "$#" -lt 1 || "$#" -gt 2 ]]; then
  echo "用法：$0 <domain-puml-file> [--clipboard]" >&2
  exit 1
fi

source_file="$1"
if [[ "${source_file}" != /* ]]; then
  source_file="${DOMAIN_DIR}/${source_file}"
fi
if [[ ! -f "${source_file}" ]]; then
  echo "错误：PlantUML 源文件不存在：${source_file}" >&2
  exit 1
fi
if [[ "${2:-}" != "" && "${2:-}" != "--clipboard" ]]; then
  echo "错误：未知参数 ${2}" >&2
  exit 1
fi

render_expanded_source() {
  local include_count=0

  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "!include drawio-theme.puml" ]]; then
      include_count=$((include_count + 1))
      # 去掉主题文件中的 PlantUML 单引号注释，减少 Draw.io 内嵌源码噪声。
      # 使用 awk，避免依赖 GNU sed 的 \xNN 转义。
      awk 'substr($0, 1, 1) != "\047" { print }' "${THEME_FILE}"
    else
      printf '%s\n' "${line}"
    fi
  done < "${source_file}"

  if [[ "${include_count}" -ne 1 ]]; then
    echo "错误：$(basename "${source_file}") 必须且只能包含一次 !include drawio-theme.puml。" >&2
    return 1
  fi
}

if [[ "${2:-}" == "--clipboard" ]]; then
  render_expanded_source | pbcopy
  echo "已复制 Draw.io 原生 PlantUML 导入文本：$(basename "${source_file}")"
else
  render_expanded_source
fi
