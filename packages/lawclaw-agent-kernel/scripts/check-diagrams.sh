#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIAGRAM_DIR="${PROJECT_ROOT}/docs/design/diagrams"
source "${SCRIPT_DIR}/diagram-runtime.sh"
EXPECTED_COUNT=19

mapfile_compat() {
  local target_name="$1"
  shift
  eval "${target_name}=()"
  while IFS= read -r item; do
    eval "${target_name}+=(\"\${item}\")"
  done < <("$@")
}

mapfile_compat diagram_files find "${DIAGRAM_DIR}" -mindepth 2 -type f -name '[0-9][0-9]-*.puml' -not -path '*/rendered/*' -print
if [[ "${#diagram_files[@]}" -ne "${EXPECTED_COUNT}" ]]; then
  echo "错误：编号 PlantUML 数量应为 ${EXPECTED_COUNT}，实际为 ${#diagram_files[@]}。" >&2
  exit 1
fi

for source_file in "${diagram_files[@]}"; do
  source_name="${source_file#${DIAGRAM_DIR}/}"
  if ! rg -q '^@startuml' "${source_file}" || ! rg -q '^@enduml' "${source_file}"; then
    echo "错误：${source_name} 缺少 @startuml 或 @enduml。" >&2
    exit 1
  fi
  if ! rg -q '^!include .*(?:theme|drawio-theme)\.puml$' "${source_file}"; then
    echo "错误：${source_name} 未引用统一主题。" >&2
    exit 1
  fi
  docker run --rm \
    --volume "${DIAGRAM_DIR}:/workspace" \
    --workdir /workspace \
    "${PLANTUML_IMAGE}" \
    -charset UTF-8 -checkonly "${source_name}"
done

echo "PlantUML 语法检查通过：${EXPECTED_COUNT}/${EXPECTED_COUNT}。"
