#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_ROOT="$(cd "${PROJECT_ROOT}/../.." && pwd)"
TSX_BIN="${WORKSPACE_ROOT}/node_modules/.bin/tsx"

if [[ ! -x "${TSX_BIN}" ]]; then
  echo "错误：项目内 Pi CLI 尚未安装，请先运行 npm install。" >&2
  exit 1
fi

exec "${TSX_BIN}" "${PROJECT_ROOT}/src/pi-cli/launcher.ts" "$@"
