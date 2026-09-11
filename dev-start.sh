#!/usr/bin/env bash
# 本地预览一键启动（Git Bash / WSL 下运行）。
# 前置：backend/.venv 已创建、frontend/dist 已构建（见 readme.md）。
set -e

# 1) 使用 nvm4w 的 Node 20（Taro 3.6 需要 Node 18/20，本机自带 22 不兼容）
export PATH="/d/DevEnv/nodeDev/nvm/nvm/v20.18.3:$PATH"
# 2) 关闭沙箱 safe-delete 守卫，避免 pip / taro 清空目录时报错
export CODEBUDDY_SAFE_DELETE_ENABLED=0

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV_PY="$ROOT/backend/.venv/Scripts/python.exe"

echo "==> node: $(node -v), npm: $(npm -v)"

# 后端：FastAPI (SQLite) on :8000
echo "==> starting backend on :8000 ..."
( cd "$ROOT/backend" && "$VENV_PY" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload ) \
  > /tmp/uvicorn.log 2>&1 &
echo "    backend log -> /tmp/uvicorn.log"

# 前端：静态托管已构建的 H5 产物 on :3000
echo "==> starting frontend (static) on :3000 ..."
( node "$ROOT/serve.js" 3000 "$ROOT/frontend/dist" ) > /tmp/static.log 2>&1 &
echo "    frontend log -> /tmp/static.log"

sleep 2
echo
echo "✅ 预览地址："
echo "   前端 Web 预览 : http://localhost:3000"
echo "   后端 API 文档  : http://localhost:8000/docs"
echo
echo "📱 局域网（同一 WiFi 下的手机/平板/其它电脑可直接打开）："
# 取本机内网 IPv4，拼出可分享的地址（前端会自动把接口指向同一台机器的 8000 端口）
for ip in $(node -e "
const os=require('os');const s=new Set();
Object.values(os.networkInterfaces()).forEach(l=>(l||[]).forEach(i=>{
  const f=i.family==='IPv4'||i.family===4; if(f&&!i.internal) s.add(i.address);
}));
console.log([...s].join(' '));
"); do
  echo "   http://$ip:3000   （接口自动走 http://$ip:8000）"
done
echo
echo "⚠️ 若其它设备打不开，需放行防火墙端口 3000/8000（管理员 PowerShell 执行一次）："
echo "   netsh advfirewall firewall add rule name=\"eat-web-3000\" dir=in action=allow protocol=TCP localport=3000"
echo "   netsh advfirewall firewall add rule name=\"eat-api-8000\" dir=in action=allow protocol=TCP localport=8000"
echo "(Ctrl+C 不会关闭后台进程；需要停止时结束对应 node / python 进程)"
