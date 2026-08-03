#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "[1/4] 安装 Termux 运行依赖"
pkg update -y
pkg install -y nodejs git

echo "[2/4] 安装项目依赖"
npm install --no-audit --no-fund

echo "[3/4] 构建网页版客户端"
npm run build

echo "[4/4] 启动网页与多人联机服务器"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8080}"
echo "本机访问：http://127.0.0.1:${PORT}"
echo "局域网访问：http://手机局域网IP:${PORT}"
exec npm start
