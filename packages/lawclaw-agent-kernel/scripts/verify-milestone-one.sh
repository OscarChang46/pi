#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/check-diagrams.sh"
"${SCRIPT_DIR}/check-architecture-conformance.sh"
"${SCRIPT_DIR}/verify-rendered-svg.sh"

echo "里程碑一自动化门禁全部通过。"
