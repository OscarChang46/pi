#!/usr/bin/env bash

# PlantUML Docker 运行时公共配置。调用方必须启用 set -euo pipefail。
PLANTUML_IMAGE="plantuml/plantuml:1.2026.7"
PLANTUML_FONT_MOUNT=()
PLANTUML_FONT_TEMP_DIR=""

prepare_plantuml_cjk_font() {
  local project_root="$1"
  local font_source="${LAWCLAW_CJK_FONT_PATH:-}"
  local candidate

  if [[ -z "${font_source}" ]]; then
    for candidate in \
      "/System/Library/Fonts/Hiragino Sans GB.ttc" \
      "/System/Library/Fonts/STHeiti Medium.ttc"; do
      if [[ -f "${candidate}" ]]; then
        font_source="${candidate}"
        break
      fi
    done
  fi

  if [[ -z "${font_source}" || ! -f "${font_source}" ]]; then
    echo "错误：未找到中文字体。请通过 LAWCLAW_CJK_FONT_PATH 指定 Hiragino Sans GB 兼容字体文件。" >&2
    return 1
  fi

  PLANTUML_FONT_TEMP_DIR="$(mktemp -d "${project_root}/.plantuml-font.XXXXXX")"
  cp "${font_source}" "${PLANTUML_FONT_TEMP_DIR}/LawClawCJK.ttc"
  PLANTUML_FONT_MOUNT=(
    --volume "${PLANTUML_FONT_TEMP_DIR}/LawClawCJK.ttc:/usr/share/fonts/truetype/dejavu/LawClawCJK.ttc:ro"
  )
}

cleanup_plantuml_cjk_font() {
  if [[ -n "${PLANTUML_FONT_TEMP_DIR}" && -d "${PLANTUML_FONT_TEMP_DIR}" ]]; then
    find "${PLANTUML_FONT_TEMP_DIR}" -type f -delete
    rmdir "${PLANTUML_FONT_TEMP_DIR}"
  fi
}
