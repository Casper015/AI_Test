#!/usr/bin/env bash
# 本地静态服务（零依赖：只用系统 python3）。
#
# 用法：
#   bash scripts/serve.sh            # 默认 127.0.0.1:8123
#   bash scripts/serve.sh 9000       # 指定端口
#   PORT=9000 bash scripts/serve.sh
#   SERVE_DIR=dist bash scripts/serve.sh    # 预览构建产物
#
# 说明：项目为多文件 ESM 工程，必须经 HTTP 访问（file:// 下 ES module 会被浏览器拦截）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PORT="${1:-${PORT:-8123}}"
HOST="${HOST:-127.0.0.1}"
SERVE_DIR="${SERVE_DIR:-.}"

if ! [[ "${PORT}" =~ ^[0-9]+$ ]]; then
  echo "serve: 端口必须是数字，收到 '${PORT}'" >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "serve: 未找到 python3；本项目不依赖 npm，请安装 python3 或用任意静态服务器指向 ${ROOT}" >&2
  exit 127
fi

TARGET="${ROOT}/${SERVE_DIR}"
if [[ ! -d "${TARGET}" ]]; then
  echo "serve: 目录不存在：${TARGET}" >&2
  exit 2
fi
if [[ "${SERVE_DIR}" == "." && ! -f "${TARGET}/index.html" ]]; then
  echo "serve: ${TARGET}/index.html 不存在，无法作为站点根目录" >&2
  exit 2
fi

echo "========================================================="
echo " 紫禁天朝 · 静态服务"
echo " root  : ${ROOT}"
echo " serve : ${TARGET}"
echo " URL   : http://${HOST}:${PORT}/"
if [[ "${SERVE_DIR}" == "." ]]; then
  echo " 入口  : http://${HOST}:${PORT}/index.html"
else
  echo " （dist 预览）http://${HOST}:${PORT}/index.html"
fi
echo " 停止  : Ctrl+C"
echo "========================================================="

exec python3 -m http.server "${PORT}" --bind "${HOST}" --directory "${TARGET}"
