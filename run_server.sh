#!/usr/bin/env bash
# 远端 Linux 部署启动脚本（Ubuntu）。在 ~/project/where_do_we_go_to_eat 下执行: bash run_server.sh
# 后端用 backend/.venv 虚拟环境；前端用 serve.js（http:3000）与 https_server.js（https:8443）托管。
# HTTPS 同源服务用于进入「安全上下文」→ 浏览器精确定位可用；/api 自动转发到后端 :8000。
# 日志全部落盘，便于排查时直接贴出。
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/backend/logs" "$ROOT/frontend/logs" "$ROOT/logs"

# 若端口被旧进程占用，先按端口释放（用 fuser 而非 pkill，避免误杀执行本脚本的 shell）
fuser -k 3000/tcp 8000/tcp 8443/tcp 2>/dev/null || true
sleep 1

echo "==> starting backend (uvicorn, venv) on :8000 ..."
cd "$ROOT/backend"
# shellcheck disable=SC1091
source .venv/bin/activate
# 用 venv 内 python 显式启动，避免 setsid 子 shell 把 uvicorn 解析到 ~/.local/bin 导致 ModuleNotFoundError
setsid bash -c "'$ROOT/backend/.venv/bin/python' -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --log-level info >> \"$ROOT/backend/logs/backend.log\" 2>&1" &
echo "    backend log -> $ROOT/backend/logs/backend.log"

echo "==> starting frontend (static http) on :3000 ..."
export PATH="$HOME/.local/bin:$PATH"
setsid bash -c "node \"$ROOT/serve.js\" 3000 \"$ROOT/frontend/dist\" >> \"$ROOT/frontend/logs/frontend.log\" 2>&1" &
echo "    frontend log -> $ROOT/frontend/logs/frontend.log"

if [ -f "$ROOT/certs/server.crt" ] && [ -f "$ROOT/certs/server.key" ]; then
  echo "==> starting HTTPS same-origin proxy on :8443 ..."
  setsid bash -c "node \"$ROOT/https_server.js\" 8443 \"$ROOT/frontend/dist\" \"$ROOT/certs\" >> \"$ROOT/frontend/logs/https.log\" 2>&1" &
  echo "    https log -> $ROOT/frontend/logs/https.log"
else
  echo "==> skip HTTPS (未找到 $ROOT/certs/server.crt，先按 README 生成证书)"
fi

sleep 2
IP_NODE="node -e \"const os=require('os');const s=new Set();Object.values(os.networkInterfaces()).forEach(l=>(l||[]).forEach(i=>{const f=i.family==='IPv4'||i.family===4; if(f&&!i.internal) s.add(i.address);}));console.log([...s].join(' '));\""
IP="$(eval $IP_NODE | awk '{print $1}')"
echo
echo "✅ 已启动。预览地址："
echo "   前端 Web      : http://localhost:3000"
echo "   后端 API 文档 : http://localhost:8000/docs"
if [ -f "$ROOT/certs/server.crt" ]; then
  echo "   HTTPS(同源)   : https://localhost:8443   ← 精确定位需走这个（安全上下文）"
fi
echo
echo "📱 局域网（同网段手机/平板/电脑）："
for ip in $(eval $IP_NODE); do
  echo "   http  -> http://$ip:3000   （接口自动走 http://$ip:8000）"
  if [ -f "$ROOT/certs/server.crt" ]; then
    echo "   https -> https://$ip:8443  （精确定位；需在该设备安装 certs/ca.crt）"
  fi
done
echo
echo "⚠️ 其它设备打不开时，可能需放行防火墙: sudo ufw allow 3000,8000,8443"
echo "📝 日志: 后端 backend/logs/backend.log ; 前端 frontend/logs/access.log ; HTTPS frontend/logs/https.log"
echo "🛑 停止: fuser -k 3000/tcp 8000/tcp 8443/tcp 2>/dev/null"
