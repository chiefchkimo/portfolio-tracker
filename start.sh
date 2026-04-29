#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔧 檢查環境..."

# Backend venv
if [ ! -d "$SCRIPT_DIR/backend/.venv" ]; then
  echo "📦 建立 Python 虛擬環境..."
  python3 -m venv "$SCRIPT_DIR/backend/.venv"
fi

echo "📦 安裝 backend 套件..."
"$SCRIPT_DIR/backend/.venv/bin/pip" install -q -r "$SCRIPT_DIR/backend/requirements.txt"

# Frontend node_modules
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  echo "📦 安裝 frontend 套件（首次需要幾分鐘）..."
  cd "$SCRIPT_DIR/frontend" && npm install && cd "$SCRIPT_DIR"
fi

echo ""
echo "🚀 啟動服務..."

# Start backend
"$SCRIPT_DIR/backend/.venv/bin/uvicorn" main:app \
  --app-dir "$SCRIPT_DIR/backend" \
  --reload \
  --port 8000 \
  --log-level warning &
BACKEND_PID=$!

# Start frontend
cd "$SCRIPT_DIR/frontend" && npm run dev -- --port 3000 &
FRONTEND_PID=$!

echo ""
echo "✅ 財務工具已啟動"
echo "   前端：http://localhost:3000"
echo "   API 文件：http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止所有服務"

cleanup() {
  echo ""
  echo "正在關閉服務..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "已停止"
}

trap cleanup EXIT INT TERM
wait "$BACKEND_PID" "$FRONTEND_PID"
