#!/usr/bin/env bash
# 一次性把三个服务装成 systemd 常驻（开机自启 + 崩溃自动重启）。
#   sudo bash deploy/systemd/install.sh
#
# 装完后：
#   systemctl status  where-eat-backend where-eat-frontend where-eat-https
#   systemctl restart where-eat-backend
#   journalctl -u where-eat-backend -n 50        # 也可以直接看 backend/logs/*.log
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

install -m 644 "$DIR/where-eat-backend.service"  /etc/systemd/system/
install -m 644 "$DIR/where-eat-frontend.service" /etc/systemd/system/
install -m 644 "$DIR/where-eat-https.service"    /etc/systemd/system/
systemctl daemon-reload

# 先清掉手工 setsid 启起的旧进程，避免端口被占
fuser -k 3000/tcp 8000/tcp 8443/tcp 2>/dev/null || true
sleep 1

systemctl enable --now where-eat-backend.service where-eat-frontend.service where-eat-https.service

echo
echo "== 状态 =="
systemctl --no-pager --full status \
  where-eat-backend.service where-eat-frontend.service where-eat-https.service \
  | grep -E "●|Active:|Loaded:" || true
