#!/bin/sh
# 启动静态服务器（根目录为本项目目录）
# 用法: ./serve.sh [端口]   默认 8000
# 然后访问 http://localhost:8000/
cd "$(dirname "$0")" || exit 1
PORT="${1:-8000}"
echo "Serving $(pwd) at http://localhost:${PORT}/"
exec python3 -m http.server "$PORT"
