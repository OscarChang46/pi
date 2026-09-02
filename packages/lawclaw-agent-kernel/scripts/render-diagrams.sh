#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIAGRAM_DIR="${PROJECT_ROOT}/docs/design/diagrams"
OUTPUT_DIR="${DIAGRAM_DIR}/rendered"
source "${SCRIPT_DIR}/diagram-runtime.sh"

prepare_plantuml_cjk_font "${PROJECT_ROOT}"
trap cleanup_plantuml_cjk_font EXIT

mkdir -p "${OUTPUT_DIR}"

mapfile_compat() {
  local target_name="$1"
  shift
  eval "${target_name}=()"
  while IFS= read -r item; do
    eval "${target_name}+=(\"\${item}\")"
  done < <("$@")
}

mapfile_compat diagram_files find "${DIAGRAM_DIR}" -maxdepth 1 -type f -name '[0-9][0-9]-*.puml' -print
if [[ "${#diagram_files[@]}" -ne 10 ]]; then
  echo "错误：应有 10 张编号 PlantUML，实际为 ${#diagram_files[@]} 张。" >&2
  exit 1
fi

for source_file in "${diagram_files[@]}"; do
  source_name="$(basename "${source_file}")"
  docker run --rm \
    "${PLANTUML_FONT_MOUNT[@]}" \
    --volume "${DIAGRAM_DIR}:/workspace" \
    --workdir /workspace \
    "${PLANTUML_IMAGE}" \
    -charset UTF-8 -tsvg -o rendered "${source_name}"
done

echo "已使用 ${PLANTUML_IMAGE} 生成 10 张 SVG：${OUTPUT_DIR}"
