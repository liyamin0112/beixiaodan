#!/usr/bin/env bash
# 背小单 · 一键启动
cd "$(dirname "$0")" || exit 1

PORT="${PORT:-8787}"

if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 node，请先安装 Node.js 16 以上版本：https://nodejs.org/zh-cn/"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 16 ]; then
  echo "Node 版本过低（当前 $(node -v)），需要 16 及以上"
  exit 1
fi

# 端口被占用时先提示
if lsof -iTCP:"$PORT" -sTCP:LISTEN -P >/dev/null 2>&1; then
  echo "端口 $PORT 已被占用，若服务已在运行可直接使用；换端口请用 PORT=8899 ./start.sh"
  exit 1
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)

echo "正在启动背小单服务…"
echo "  本机     http://127.0.0.1:$PORT"
echo "  手机调试 http://$IP:$PORT   ← 小程序「我的 → 服务器地址」填这个"
echo "  停止服务 Ctrl + C   （数据保存在 server/data/db.json，不会丢）"
echo ""
exec node server/server.js
