#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIAGRAM_DIR="${PROJECT_ROOT}/docs/design/diagrams"
RENDERED_DIR="${DIAGRAM_DIR}/rendered"
EXPECTED_COUNT=19
source "${SCRIPT_DIR}/diagram-runtime.sh"

temporary_dir="$(mktemp -d)"

cleanup_verification_artifacts() {
  if [[ -n "${temporary_dir}" && -d "${temporary_dir}" ]]; then
    find "${temporary_dir}" -type f -delete
    find "${temporary_dir}" -depth -type d -empty -delete
  fi
}

trap cleanup_verification_artifacts EXIT

mapfile_compat() {
  local target_name="$1"
  shift
  eval "${target_name}=()"
  while IFS= read -r item; do
    eval "${target_name}+=(\"\${item}\")"
  done < <("$@")
}

mapfile_compat svg_files find "${RENDERED_DIR}" -mindepth 2 -type f -name '[0-9][0-9]-*.svg' -print
if [[ "${#svg_files[@]}" -ne "${EXPECTED_COUNT}" ]]; then
  echo "错误：渲染 SVG 数量应为 ${EXPECTED_COUNT}，实际为 ${#svg_files[@]}。" >&2
  exit 1
fi

for svg_file in "${svg_files[@]}"; do
  svg_name="${svg_file#${RENDERED_DIR}/}"
  xmllint --noout "${svg_file}"
  if ! rg -q '<svg[^>]+viewBox=' "${svg_file}"; then
    echo "错误：${svg_name} 缺少 viewBox，无法可靠缩放。" >&2
    exit 1
  fi
  if ! rg -q '[一-龥]' "${svg_file}"; then
    echo "错误：${svg_name} 未保留中文文本。" >&2
    exit 1
  fi
  if rg -q 'Syntax Error|An error has occurred|This position is ignored|Please use CSS style' "${svg_file}"; then
    echo "错误：${svg_name} 包含 PlantUML 错误或可见警告。" >&2
    exit 1
  fi
  if ! rg -q 'font-family="[^"]*(Hiragino Sans GB|PingFang SC)[^"]*"' "${svg_file}"; then
    echo "错误：${svg_name} 未使用约定的中文字体族。" >&2
    exit 1
  fi

  source_name="${svg_name%.svg}.puml"
  embedded_path="${temporary_dir}/${source_name}.embedded"
  source_path="${temporary_dir}/${source_name}.source"
  mkdir -p "$(dirname "${embedded_path}")"
  docker run --rm \
    --volume "${DIAGRAM_DIR}:/workspace:ro" \
    --workdir /workspace \
    "${PLANTUML_IMAGE}" \
    -metadata "rendered/${svg_name}" \
    | awk '/^@startuml/{capture=1; print "@startuml"; next} capture {print; if ($0=="@enduml") exit}' \
    > "${embedded_path}"
  awk 'NR==1 && /^@startuml/{print "@startuml"; next} {print}' \
    "${DIAGRAM_DIR}/${source_name}" \
    > "${source_path}"
  if ! diff -B -q "${embedded_path}" "${source_path}" >/dev/null; then
    echo "错误：${svg_name} 内嵌的 PlantUML 源与当前源文件不一致，请重新渲染。" >&2
    exit 1
  fi
done

echo "SVG XML、中文文本、可缩放性和源文件一致性检查通过。"
