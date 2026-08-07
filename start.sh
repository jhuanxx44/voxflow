#!/bin/bash
# VoxFlow 启动脚本
# 用法: ./start.sh        同时启动前后端
#       ./start.sh -b     仅启动后端

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
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
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
    wait 2>/dev/null
    echo "已停止"
}
trap cleanup EXIT INT TERM

cd "$SCRIPT_DIR"

# 检查虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    echo "虚拟环境不存在，正在创建..."
    python3.11 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
fi

# 启动后端
echo "启动后端 (port 8082)..."
"$VENV_DIR/bin/python" app.py &
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
    # 检查 node_modules
    if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
        echo "正在安装前端依赖..."
        npm install
    fi

    FRONTEND_LOG="$SCRIPT_DIR/.vite.log"
    echo "启动前端 (port 3001)，日志: .vite.log"
    npx vite --host 127.0.0.1 > "$FRONTEND_LOG" 2>&1 &
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
