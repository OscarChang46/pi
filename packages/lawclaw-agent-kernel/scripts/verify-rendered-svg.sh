#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIAGRAM_DIR="${PROJECT_ROOT}/docs/design/diagrams"
RENDERED_DIR="${DIAGRAM_DIR}/rendered"
EXPECTED_COUNT=10
source "${SCRIPT_DIR}/diagram-runtime.sh"

prepare_plantuml_cjk_font "${PROJECT_ROOT}"
temporary_dir=""

cleanup_verification_artifacts() {
  if [[ -n "${temporary_dir}" && -d "${temporary_dir}" ]]; then
    find "${temporary_dir}" -type f -delete
    find "${temporary_dir}" -depth -type d -empty -delete
  fi
  cleanup_plantuml_cjk_font
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

mapfile_compat svg_files find "${RENDERED_DIR}" -maxdepth 1 -type f -name '[0-9][0-9]-*.svg' -print
if [[ "${#svg_files[@]}" -ne "${EXPECTED_COUNT}" ]]; then
  echo "错误：渲染 SVG 数量应为 ${EXPECTED_COUNT}，实际为 ${#svg_files[@]}。" >&2
  exit 1
fi

for svg_file in "${svg_files[@]}"; do
  svg_name="$(basename "${svg_file}")"
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
  if ! rg -q 'font-family="[^"]*Hiragino Sans GB[^"]*"' "${svg_file}"; then
    echo "错误：${svg_name} 未使用约定的中文字体族。" >&2
    exit 1
  fi
done

temporary_dir="$(mktemp -d)"
mkdir -p "${temporary_dir}/rendered"
cp "${DIAGRAM_DIR}"/*.puml "${temporary_dir}/"
docker run --rm \
  "${PLANTUML_FONT_MOUNT[@]}" \
  --volume "${temporary_dir}:/workspace" \
  --workdir /workspace \
  "${PLANTUML_IMAGE}" \
  -charset UTF-8 -tsvg -o rendered '[0-9][0-9]-*.puml'

for svg_file in "${svg_files[@]}"; do
  svg_name="$(basename "${svg_file}")"
  if ! cmp -s "${svg_file}" "${temporary_dir}/rendered/${svg_name}"; then
    echo "错误：${svg_name} 与当前 PlantUML 源文件不一致，请重新渲染。" >&2
    exit 1
  fi
done

echo "SVG XML、中文文本、可缩放性和源文件一致性检查通过。"
