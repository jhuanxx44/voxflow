#!/usr/bin/env bash
# Start the repository Web app from the authoritative pyproject/uv.lock and package-lock.json.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_ONLY=false

while getopts "b" opt; do
    case $opt in
        b) BACKEND_ONLY=true ;;
        *) echo "用法: $0 [-b]"; exit 1 ;;
    esac
done

cleanup() {
    echo ""
    echo "正在停止服务..."
    [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null || true
    [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    wait 2>/dev/null
    echo "已停止"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

cd "$SCRIPT_DIR"

if ! command -v uv >/dev/null 2>&1; then
    echo "缺少 uv。安装说明: https://docs.astral.sh/uv/getting-started/installation/" >&2
    exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
    echo "缺少 ffmpeg/ffprobe；请先安装 FFmpeg。" >&2
    exit 1
fi

echo "同步 Web Python 依赖 (pyproject.toml + uv.lock)..."
uv sync --python 3.11 --frozen --inexact \
    --extra web --extra asr-local --extra providers --extra tts

# 启动后端
echo "启动后端 (port 8082)..."
uv run --frozen --no-sync python app.py &
BACKEND_PID=$!

if [ "$BACKEND_ONLY" = true ]; then
    echo ""
    echo "================================"
    echo "  后端: http://localhost:8082"
    echo "  Ctrl+C 停止服务"
    echo "================================"
    echo ""
    wait "$BACKEND_PID"
else
    if ! command -v npm >/dev/null 2>&1; then
        echo "缺少 Node.js/npm；请安装 Node.js 20+。" >&2
        exit 1
    fi
    echo "同步前端依赖 (package-lock.json)..."
    npm ci

    FRONTEND_LOG="$SCRIPT_DIR/.vite.log"
    echo "启动前端 (port 3001)，日志: .vite.log"
    npm run dev -- --host 127.0.0.1 > "$FRONTEND_LOG" 2>&1 &
    FRONTEND_PID=$!

    echo ""
    echo "================================"
    echo "  后端: http://localhost:8082"
    echo "  前端: http://localhost:3001"
    echo "  前端日志: tail -f .vite.log"
    echo "  Ctrl+C 停止所有服务"
    echo "================================"
    echo ""
    wait "$BACKEND_PID" "$FRONTEND_PID"
fi
