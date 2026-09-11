# 内网 HTTPS 部署与证书说明（where_do_we_go_to_eat）

> 本文记录「让局域网/内网也能用浏览器精确定位」这套 HTTPS 方案的**完整操作与原理**，用于后续维护与上下文恢复。
> 只记录**方案与配置**，不记录临时性的 bug 修复过程。

---

## 一、需求背景（为什么做这件事）

本应用的核心功能依赖**获取用户当前位置**。但浏览器出于安全限制：**只有在「安全上下文」里才允许精确定位**。

- ✅ 安全上下文：`https://…`（证书被设备信任）、`http://localhost` / `http://127.0.0.1`
- ❌ 非安全上下文：`http://192.168.x.x`（局域网 IP）

在 `http://192.168.31.5:xxxx` 这类地址下，`navigator.geolocation` 直接被浏览器禁用，控制台报：

```
Only secure origins are allowed (see: https://permanently-removed.invalid/...)
```

**结论：想让内网设备（手机/平板/其它电脑）用精确定位，必须把页面跑在内网 HTTPS 上。**

> 补充：IP 定位（按公网出口 IP 反查城市）不受此限制，但**只有城市级精度**，只能作为兜底，不能替代精确定位。

---

## 二、整体架构

在原有「HTTP 前端 + HTTP 后端」之外，新增一个 **HTTPS 同源服务器**：

```
                        ┌─────────────────────────────────────────┐
   测试设备(手机/PC) ──► │  https://192.168.31.5:8443   (推荐)      │
                        │  https_server.js                         │
                        │    ├── /             → frontend/dist     │
                        │    └── /api/*,/docs* → 反代 127.0.0.1:8000│
                        └─────────────────────────────────────────┘
                        ┌─────────────────────────────────────────┐
   （保留）浏览器 ──────► │  http://192.168.31.5:3000   serve.js      │
                        │    └── /             → frontend/dist     │
                        └─────────────────────────────────────────┘
                        ┌─────────────────────────────────────────┐
                        │  http://127.0.0.1:8000   uvicorn (后端)  │
                        │    FastAPI + MySQL                       │
                        └─────────────────────────────────────────┘
```

**为什么 HTTPS 服务器要把 `/api` 也反代过来？**
页面是 `https://` 时，如果接口仍请求 `http://host:8000`，会被浏览器当作**混合内容（Mixed Content）**拦截。
所以让页面和接口**同源**（都在 `https://192.168.31.5:8443`），前端只管请求 `/api/*`。

---

## 三、证书体系

### 3.1 证书文件位置

| 位置 | 文件 | 说明 |
| --- | --- | --- |
| **Linux 服务器** `~/project/where_do_we_go_to_eat/certs/` | `ca.key` / `ca.crt` | 本地根 CA（CA 私钥，切勿外泄） |
| 同上 | `server.key` / `server.crt` | 服务器证书（被 CA 签发） |
| 同上 | `server.csr` / `san.cnf` / `ca.srl` | 签发过程的中间文件 |
| **Windows 本机（项目目录）** `E:\code\3_MY_Github\where_do_we_go_to_eat\ca.crt` | `ca.crt` | 从服务器拷回的根证书（供安装） |
| **Windows 本机（项目目录）** `…\where_do_we_go_to_eat\certs\ca.crt` | `ca.crt` | 同上（原始存放位置） |

服务器上还可通过网址下载根证书：
- `http://192.168.31.5:3000/ca.crt`（未装证书时也能访问）
- `https://192.168.31.5:8443/ca.crt`

> `certs/`、`*.crt`、`*.key`、`*.pem` 均已在 `.gitignore` 中排除，**不会提交到 GitHub**。

### 3.2 证书的 SAN（关键）

`server.crt` 的 `subjectAltName` 同时包含域名与 IP，因此**用 IP 直接访问也能通过校验**（手机不必配域名）：

```
DNS:eat.lan, DNS:localhost, IP Address:192.168.31.5, IP Address:127.0.0.1
```

有效期 825 天（iOS 13+ 对 TLS 服务器证书有 ≤825 天的硬性上限）。

### 3.3 在 Linux 服务器上重新生成证书

```bash
cd ~/project/where_do_we_go_to_eat/certs

# 1) 本地根 CA（10 年）
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -subj "/CN=WhereToEat Local CA/O=where_do_we_go_to_eat" -out ca.crt

# 2) 服务器证书（含 IP/域名 SAN）
openssl genrsa -out server.key 2048
openssl req -new -key server.key -subj "/CN=eat.lan/O=where_do_we_go_to_eat" -out server.csr
cat > san.cnf <<'EOF'
subjectAltName=DNS:eat.lan,DNS:localhost,IP:192.168.31.5,IP:127.0.0.1
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
basicConstraints=CA:FALSE
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 825 -sha256 -extfile san.cnf

chmod 600 ca.key server.key
```

> ⚠️ 服务器 IP 变了（例如 `192.168.31.5` 变化）就必须重签，并把新 IP 加进 SAN，否则浏览器会因「名称不匹配」报警。

### 3.4 Windows 安装根证书（原始操作记录）

目的：让 Windows 上的浏览器（Chrome/Edge 走系统证书库）信任这个自签 CA，不再提示「不安全」。

**证书原始路径**：`E:\code\3_MY_Github\where_do_we_go_to_eat\ca.crt`

**已执行的命令**（装到「当前用户 → 受信任的根证书颁发机构」，**无需管理员**）：

```bat
certutil -user -addstore Root "E:\code\3_MY_Github\where_do_we_go_to_eat\ca.crt"
:: 输出：证书 "WhereToEat Local CA" 添加到存储。  CertUtil: -addstore 命令成功完成。
```

校验：

```bat
certutil -user -store Root | findstr /I "WhereToEat"
```

**卸载/撤销**：

```bat
certutil -user -delstore Root "WhereToEat Local CA"
```

> 也可图形化：双击 `ca.crt` → 安装证书 → 本地计算机/当前用户 → 「受信任的根证书颁发机构」。
> 装完**需完全退出并重开浏览器**才会生效。

**验证结果（踩坑记录，重要）**：
- 安装前，Windows 自带 `curl` 报 `SEC_E_UNTRUSTED_ROOT`（不受信任）。
- 安装后，错误变为 `CRYPT_E_NO_REVOCATION_CHECK`（**证书已受信任**，只剩自签 CA 没有吊销列表这一项）。
- 该吊销检查是 **curl/schannel 的严格行为，浏览器是软失败、不受影响**：`curl --ssl-no-revoke` 与 PowerShell `Invoke-WebRequest` 均返回 200，浏览器也不报警。

### 3.5 在 Linux 客户端安装根证书（如需）

若某台 Linux 设备要信任它：

```bash
sudo cp ca.crt /usr/local/share/ca-certificates/wheretoeat-ca.crt
sudo update-ca-certificates
```

### 3.6 其它测试设备（手机/iOS/Android）

- **iOS**：Safari 打开 `http://192.168.31.5:3000/ca.crt` 安装描述文件 → 再到「设置 → 通用 → 关于本机 → 证书信任设置」**打开完全信任**（这步不能漏）。
- **Android**：设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书 → 选择下载的 `ca.crt`。
- 安装后访问 `https://192.168.31.5:8443/`。

> 两个静态服务器已把 `.crt`/`.pem` 以 `application/x-x509-ca-cert` 返回，手机打开链接会直接进入安装流程。
> 想用域名 `eat.lan` 访问，需在设备/路由器 DNS 或 hosts 里把 `eat.lan` 解析到 `192.168.31.5`。

---

## 四、部署与运维

### 4.1 服务器目录（Ubuntu）

```
~/project/where_do_we_go_to_eat/
├── backend/           FastAPI（venv 在 backend/.venv，Python 3.8 + virtualenv）
│   └── logs/          backend.log（后端）、browser.log（浏览器端上报）
├── frontend/
│   ├── dist/          H5 构建产物（本地 Node 20 构建后 scp 上传）
│   └── logs/          access.log（:3000）、https-access.log（:8443）、frontend.log/https.log
├── certs/             CA 与服务器证书
├── serve.js           :3000 HTTP 静态服务器
├── https_server.js    :8443 HTTPS 服务器（静态 + /api 反代）
└── run_server.sh      一键启动
```

### 4.2 启动 / 停止

```bash
cd ~/project/where_do_we_go_to_eat
bash run_server.sh                              # 同时起 8000 / 3000 / 8443
fuser -k 3000/tcp 8000/tcp 8443/tcp             # 停止
```

> `run_server.sh` 里后端用 `setsid .venv/bin/python -m uvicorn …` 显式启动——**不能写 `uvicorn`**，否则会被解析到 `~/.local/bin/uvicorn`（缺依赖）导致后端起不来。
> 服务是 `setsid` 脱离 SSH 启动的，**机器重启不会自动恢复**；需要开机自启可另配 systemd。

### 4.3 前端改动如何生效

前端是静态产物，改动后必须：**本地 Node 20 构建 → scp 上传 `frontend/dist`**。

> ⚠️ 远程机器（Ubuntu 20.04，glibc 2.31）**不能**直接构建：Taro 3.6.23 的原生二进制要求 glibc ≥ 2.32，会报 `undefined symbol: __libc_single_threaded`。所以固定「本地构建、上传产物」。

---

## 五、代码改动清单（文件 → 改了什么 → 为什么）

> 前端：`frontend/src`；后端：`backend/app`。

| 文件 | 改动 | 为什么 |
| --- | --- | --- |
| `https_server.js`（新增） | 以 https 提供 `frontend/dist`，并把 `/api/*`、`/docs`、`/redoc`、`/openapi.json` 反代到 `127.0.0.1:8000`；访问日志写 `frontend/logs/https-access.log` | 让内网有 https（安全上下文），且页面与接口同源，规避混合内容拦截 |
| `frontend/src/config.ts` | `getApiBase()`：`https:` 时返回**同源 origin**；`http:` 时维持 `host:8000` | 原逻辑在 https 下会拼出 `https://host:8000`，与后端 http 端口不匹配且触发混合内容 |
| `run_server.sh` | 增加 `:8443` 的启动与端口释放；后端改用 venv python 显式启动 | 统一启停；修掉 uvicorn 被解析到 `~/.local/bin` 的问题 |
| `serve.js` | 访问日志目录由「项目根 `logs/`」改为 `frontend/logs/`；`.crt/.pem` 以 `application/x-x509-ca-cert` 返回 | 日志路径与部署文档一致；手机打开证书链接可直接安装 |
| `frontend/src/utils/amap.ts` | 新增 `getLocateEnv()`（安全上下文/geolocation/协议主机）；定位四级兜底**逐级记录失败原因**并上报；给浏览器定位加 9s 外层超时；浏览器侧 IP 源改为 `api.ip.sb` → `ipwho.is` → `ipinfo.io`；新增 `getClientPublicIp()` 并把公网 IP 传给后端 | ① 定位失败可见可查；② 防止 `getCurrentPosition` 不回调导致整链卡死；③ `ipapi.co` 已 403；④ 服务端拿不到客户端出口 IP，需前端告知 |
| `frontend/src/components/JoinMeetup.tsx`、`frontend/src/pages/meetup-create/index.tsx` | 定位提示按「是否安全上下文」区分；失败时把具体原因显示在页面上 | 用户能直接看到“为什么失败”，而不是笼统的“定位失败” |
| `backend/app/api/geo.py` | 新增 `?ip=` 参数：可按指定 IP 走高德 `/v3/ip`；公共 IP 兜底改用 `ipwho.is/{ip}`、`ipinfo.io/{ip}` | 让 `/api/geo/ip` 能定位**客户端真实出口 IP**（否则只能定位到服务器所在城市）；去掉会 403 的 ipapi.co |
| `backend/app/api/debug.py` | 浏览器调试日志由 `%TEMP%/amap_debug.log` 改为 **`backend/logs/browser.log`** | /tmp 路径不易找到；固定进项目目录便于 tail/贴出 |
| `.gitignore` / `.gitattributes`（新增） | 忽略 `.env`/`certs`/`.venv`/`node_modules`/`dist`/`*.db`/`.workbuddy`；统一 LF | 防密钥入库；防 Linux 上 `.sh` 因 CRLF 无法执行 |
| `backend/.env.example` | 补充 `AMAP_SECURITY_CODE`、`FRONTEND_BASE` | 便于他人按模板配置 |
| `frontend/src/components/MapPicker.tsx`（新增） | 高德地图「地图选点」组件：点选/拖动标记 + 反查地址；沿用 MapView 的容器兜底（原生 div 宿主、等尺寸、ResizeObserver、失败上报） | 手动选择从「输经纬度」升级为「图上点选」 |
| `frontend/src/pages/meetup-create/index.tsx`、`frontend/src/components/JoinMeetup.tsx` | 手动选择区块改为「**地图选点** + 搜索（把地图移到该处）」，经纬度输入收进可折叠的「**其他方式**（次选）」；环境判断由 `Taro.getEnv() === 'h5'` 改为 `process.env.TARO_ENV === 'h5'` | ⚠️ `Taro.getEnv()` 在 H5 返回 `'WEB'`，写 `'h5'` **恒为 false**，会让 H5 端跳过定位兜底链（见「已知限制」） |

---

## 六、定位策略（四级兜底）

`frontend/src/utils/amap.ts` 的 `amapLocate()` 依次尝试：

| 级别 | 方式 | 精度 | 依赖 |
| --- | --- | --- | --- |
| ① | 浏览器精确定位 `navigator.geolocation` → WGS-84 转 GCJ-02 → 反查地址 | **精确**（楼栋级） | 安全上下文 + 浏览器定位服务可用 + 用户授权 |
| ② | 高德 JS IP 定位（`noGeoLocation:true`） | 城市级 | 高德 JS 脚本可加载 |
| ③ | **浏览器直连公共 IP 服务：`api.ip.sb/geoip` → `ipwho.is` → `ipinfo.io`**（首选 `api.ip.sb`） | 城市级 | 目标服务支持 CORS（三者均返回 `Access-Control-Allow-Origin: *`） |
| ④ | 服务端 `/api/geo/ip?ip=本机公网IP` | 城市级 | 后端可达；由前端 `getClientPublicIp()` 先取公网 IP |

> **为什么 ③ 在 ④ 前面**：③ 由浏览器直连，拿到的是**本机出口 IP**的城市，最贴合用户；④ 作为最后兜底。
> **踩坑**：高德 `/v3/ip` 会**忽略 `ip` 参数**（实测传任意 IP 仍按调用方出口 IP 返回），所以服务端指定 IP 时**跳过高德**，改用 `ipwho.is/{ip}` / `ipinfo.io/{ip}/json`。
> **为什么需要前端告诉服务端公网 IP**：内网访问时服务端只能看到客户端的内网 IP（如 `192.168.31.2`），拿不到公网出口 IP。

每级成功/失败都会：
- 写入服务器 **`backend/logs/browser.log`**（经 `POST /api/debug/log` 上报）；
- 失败原因汇总进最终抛出的错误，显示在页面上。

---

## 七、日志位置一览

| 日志 | 路径（服务器 `~/project/where_do_we_go_to_eat/`） | 用途 |
| --- | --- | --- |
| 后端 | `backend/logs/backend.log` | uvicorn 访问与错误 |
| **浏览器端上报（定位链路）** | `backend/logs/browser.log` | **排查定位问题首选** |
| HTTPS 访问 | `frontend/logs/https-access.log` | 谁在什么时候请求了什么 |
| HTTP 访问 | `frontend/logs/access.log` | 同上（:3000） |
| 前端进程输出 | `frontend/logs/frontend.log` / `https.log` | 进程启动/崩溃信息 |

---

## 八、验证方法

```bash
# 服务器本机
curl -sk https://127.0.0.1:8443/                      # 200
curl -sk "https://127.0.0.1:8443/api/geo/ip"          # 城市级坐标
curl -s  --cacert ~/project/where_do_we_go_to_eat/certs/ca.crt \
     -o /dev/null -w "%{http_code}\n" https://127.0.0.1:8443/   # 证书链校验通过 → 200

# Windows（已装 CA）
curl.exe --ssl-no-revoke -o NUL -w "%{http_code}" https://192.168.31.5:8443/
```

---

## 九、已知限制与注意事项

1. **桌面 Chrome/Edge 在国内通常拿不到精确定位**：其定位依赖 Google 的定位服务（`googleapis.com`），国内直连不可达。即使 HTTPS 正确，桌面端多数情况只能回退到 IP 城市级；**用手机浏览器测试最可靠**（走系统 GPS/WiFi）。小程序端用腾讯定位，国内可用。
2. **IP 定位只有城市级精度**，且依赖公网出口 IP 被服务商数据库收录；开代理会让出口 IP 变成代理的 IP，反查出来的城市随之改变。
3. **`ipapi.co` 会返回 403**，已不再作为首选；首选 `api.ip.sb/geoip`。
4. **服务重启后不会自动拉起**（非 systemd）；服务器重启后需手动 `bash run_server.sh`。
5. **服务器 IP 变化需重签证书**（SAN 必须包含新 IP）。
6. Windows 自带 `curl` 用 schannel，对自签 CA 会因「无吊销列表」报 `CRYPT_E_NO_REVOCATION_CHECK`；这是 curl 的严格检查，**浏览器不受影响**，curl 可加 `--ssl-no-revoke`。
7. **Taro 环境判断**：`Taro.getEnv()` 在 H5 返回 **`'WEB'`**、小程序返回 **`'WEAPP'`**（都是大写）。
   务必用**构建期常量** `process.env.TARO_ENV === 'h5' / 'weapp'`；否则 H5 分支会**静默失效**
   （本项目曾因此让 H5 端不走定位兜底、定位直接失败，且错误无 `message` → 页面只显示「未知原因」）。
8. **本机开代理会影响 IP 定位**：浏览器出口 IP 会变成代理的 IP，IP 定位结果即**代理所在地**
   （实测拿到日本兵库县）。要按真实位置做 IP 定位，请关闭代理；精确定位请用手机浏览器。

---

## 十、Git 仓库

- 远端：`git@github.com:dancehole/where_do_we_go_to_eat.git`（SSH，分支 `main`）
- `.env`、`certs/`、`dist/`、`.venv/`、`node_modules/`、`.workbuddy/` 均不入库。
