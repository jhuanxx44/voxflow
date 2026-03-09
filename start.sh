#!/bin/bash
# VoxFlow 后端启动脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

# 检查虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    echo "虚拟环境不存在，正在创建..."
    python3.11 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
fi

# 激活并启动
cd "$SCRIPT_DIR"
exec "$VENV_DIR/bin/python" app.py
