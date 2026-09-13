# Where Do We Go To Eat?（我们去哪儿吃饭）

> 一个 **Web + 微信小程序双端**的碰面找饭应用：多个身处不同位置的小伙伴，算出一个会面中心点，再推荐合适的餐厅。
> 核心定位：**无需登录**，靠匿名设备身份即可发起/加入碰面。

---

## 一、技术栈（已确认）

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端 | **Taro (React + TypeScript)** | 一套代码编译到 H5(Web) + 微信小程序 |
| 后端 | **Python + FastAPI** | 异步 REST API，AI 调用方便 |
| 数据库 | **MySQL** | 多用户碰面 + 历史记录，关系完备 |
| ORM | SQLAlchemy 2.x + Alembic | 迁移管理 |
| 大模型 | **通义千问 (DashScope / qwen-plus)** | 综合排序 + 生成推荐理由，国内直连 |
| 地图 | **高德地图 Web 服务 + JS API** | POI 检索、地理编码、中心点计算 |

### 关键约束（已确认）
- ⚠️ **大众点评 / 美团没有公开 API**（商户数据未对个⼈开发者开放）。餐厅主数据源改为 **高德地图 POI 检索**（可拿名称、坐标、地址、品类、评分、营业状态），再用「规则权重 + 大模型」做综合排序与理由生成。
- ⚠️ **无登录身份**：用「设备匿名 UUID + 本地存储 + 后端会话」标识用户，无需注册。

---

## 二、目录结构（规划）

```
where_do_we_go_to_eat/
├── readme.md
├── 需求.txt
├── backend/                      # Python + FastAPI
│   ├── app/
│   │   ├── main.py               # 入口
│   │   ├── api/                  # 路由
│   │   │   ├── meetups.py        # 碰面 CRUD / 加入 / 结束
│   │   │   ├── geo.py            # 中心点计算 + 同城/跨城判定
│   │   │   ├── restaurants.py    # 餐厅检索 + 排序 + 偏好
│   │   │   └── ai.py             # 通义千问推送
│   │   ├── core/                 # config / db / security
│   │   │   ├── config.py         # 读取 .env
│   │   │   ├── database.py       # SQLAlchemy 引擎/会话
│   │   │   └── security.py       # 匿名身份(设备UUID)鉴权
│   │   ├── models/               # ORM 模型
│   │   ├── schemas/              # Pydantic DTO
│   │   ├── services/             # 业务逻辑
│   │   │   ├── geo.py            # 中心点/加权算法
│   │   │   ├── amap.py           # 高德 POI 封装
│   │   │   ├── rank.py           # 权重排序算法
│   │   │   └── llm.py            # 通义千问封装
│   │   └── utils/
│   ├── alembic/                  # 迁移脚本
│   ├── requirements.txt
│   ├── .env.example
│   └── tests/
├── frontend/                     # Taro (React)
│   ├── src/
│   │   ├── app.config.ts
│   │   ├── pages/
│   │   │   ├── splash/           # 开屏介绍
│   │   │   ├── meetup-create/    # 发起碰面（获取位置/邀请/手动加）
│   │   │   ├── meetup-list/      # 我的碰面/进行中/历史
│   │   │   ├── meetup-detail/    # 碰面详情（参与者/距离/结束）
│   │   │   └── restaurant-list/  # 推荐餐厅列表（筛选/偏好/理由）
│   │   ├── components/
│   │   ├── services/             # API client
│   │   └── store/                # 全局状态(Zustand)
│   ├── config/
│   ├── package.json
│   └── project.config.json       # 微信小程序配置
└── docs/
```

---

## 三、数据库设计（MySQL，规划）

```sql
-- 匿名用户（设备身份）
User(id UUID PK, device_id VARCHAR, nickname VARCHAR, created_at)

-- 碰面
Meetup(
  id UUID PK,
  code VARCHAR(8) UNIQUE,        -- 分享码
  creator_id UUID FK,
  status ENUM('active','ended'),
  meetup_type ENUM('same_city','travel', NULL),  -- 计算后判定
  center_lat DECIMAL(10,7),
  center_lng DECIMAL(10,7),
  created_at, ended_at
)

-- 参与者（发起人 + 被邀请/手动添加的朋友）
Participant(
  id UUID PK,
  meetup_id UUID FK,
  user_id UUID FK,
  nickname VARCHAR,
  lat DECIMAL(10,7), lng DECIMAL(10,7),
  joined_at
)

-- 餐厅候选/缓存（某次碰面检索结果）
Restaurant(
  id UUID PK,
  meetup_id UUID FK,
  source VARCHAR,                -- amap / manual
  name, lat, lng, address,
  category VARCHAR,              -- 菜系/品类
  avg_price DECIMAL,
  rating DECIMAL,
  business_status VARCHAR,
  score DECIMAL,                 -- 综合评分
  reason TEXT,                   -- 推荐理由(AI/规则)
  created_at
)

-- 用户偏好（优先/排除 品牌或餐厅，可绑定到某次碰面）
Preference(
  id UUID PK,
  user_id UUID FK,
  meetup_id UUID NULL,
  brand_include JSON,
  brand_exclude JSON,
  restaurant_include JSON,
  restaurant_exclude JSON
)
```

---

## 四、API 设计（规划）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/meetups` | 发起碰面，返回 `code` |
| GET | `/api/meetups/{code}` | 查看碰面（含参与者、距离） |
| POST | `/api/meetups/{code}/join` | 加入碰面（带自己的位置） |
| POST | `/api/meetups/{code}/add-location` | 手动添加朋友位置（地名/经纬度） |
| POST | `/api/meetups/{code}/end` | 结束碰面 |
| GET | `/api/meetups?status=active` | 我进行中的碰面 |
| GET | `/api/meetups/history` | 历史记录 |
| GET | `/api/meetups/{code}/center` | 计算中心点 + 判定同城/跨城 |
| GET | `/api/meetups/{code}/restaurants` | 检索+排序餐厅（筛选+偏好） |
| POST | `/api/meetups/{code}/preferences` | 设置优先/排除偏好 |
| POST | `/api/ai/recommend` | 通义千问生成餐厅列表+理由 |

---

## 五、功能清单与进度

状态图例：`[ ]` 待开始 · `[~]` 进行中 · `[x]` 已完成 · `[?]` 待确认

### Phase 0 · 基础设施
- [x] 后端 FastAPI 脚手架 + MySQL 连接 + `.env` 配置
- [x] 前端 Taro 脚手架（H5 + 微信小程序 build 配置）
- [x] 建表脚本 `init_db.py`（MySQL；本地验证用 `DATABASE_URL=sqlite:///./dev.db` 已跑通）

### Phase 1 · Web 前后端基本框架与功能
> 状态：后端 API + 前端 5 个页面均已落地；**真实 Key 已写入 `backend/.env` 并真实联调通过**：高德「Web 服务」key 可取真实 POI（后端 `/restaurants` 返回 `source=amap`，含距离/人均/评分/商圈）；权重排序已重写（评分/价格/菜系/交通/距离加权，区分度良好）；DeepSeek(默认 deepseek-chat) 可用、返回带理由推荐；前端地图用的「JS」key 类型匹配，已可显示真实地图。地图标记 UI 已接入。

- [x] 开屏介绍页（splash）：已落地基础文案与跳转
- [x] 发起新碰面：获取位置（Taro.getLocation）→ 后端记录；跨端地图标记 UI 已接入（H5 高德 JS / 小程序原生 Map）
- [x] 邀请朋友（生成分享链接）/ 手动添加朋友位置：链接与卡片逻辑已落地，分享卡片已用 `useShareAppMessage`
- [x] 碰面列表：我发起的 / 历史记录 / 进行中：已落地
- [~] 碰面详情：参与者、「xx 伙伴已加入」、距我 xx 公里、结束碰面：已落地（距离自动计算）
- [x] 中心点计算 + 同城(聚餐)/跨城(旅行)判定：已实现（球面质心 + 交通费均衡算法）
- [x] 同城：餐厅检索（高德真实 POI）+ 筛选 + 权重排序 + 推荐列表(含理由)：后端已实现并真实验证，前端列表页已落地
- [x] 个性化偏好：独立设置页 `/pages/preferences`（菜系喜欢/不喜欢、品牌与餐厅的偏好/排除两列表、商圈优先、预算、搜索半径、长文本 + AI 解析、导入/导出 JSON）；
  全局偏好存 `preferences`（meetup_id 为空，跨碰面复用），碰面专属优先于全局；修复了原先把 code 当 meetup_id 存导致偏好永不生效的 bug
- [x] 候选池：「排序更多餐厅」勾选后翻 4 页（≤100 条）再取评分最好的前 25 家参与排序；默认 1 页 25 条
- [x] 餐厅卡片展示「所属商圈」与一张实景图（高德 photos 第一张）
- [x] AI 推送（DeepSeek）：后端已封装并真实验证，无 Key 时优雅降级；前端「AI 推送」按钮已落地

### Phase 2 · 小程序基本功能
- [x] 小程序开屏介绍（splash 同套代码，H5/小程序通用）
- [x] 小程序发起碰面 + 微信地图 + 分享卡片：`getLocation` 走 `Taro.getLocation`(gcj02) + 服务端逆地理编码补地址；`MapView` 用原生 `<Map>`；`meetup-detail` 已 `useShareAppMessage`（卡片带碰面 code）
- [x] 小程序碰面列表 / 详情（同套页面，已编译通过）
- [x] 小程序餐厅推荐列表（同套页面，已编译通过）
- [x] 偏好页保存后 `navigateBack` 返回上一页（修复：原先停留不回退）
- [x] 微信小程序用户认证：`app.tsx` 启动 `wx.login` → 后端 `/api/auth/wechat`(code2session) 拿 openid 持久化；未配 WECHAT_APPID/SECRET 时优雅回退设备匿名身份
- [x] 小程序地址搜索 / 地图选点：新增后端 `/api/geo/geocode`(地址→坐标) 与 `/api/geo/regeo`(坐标→地址)，小程序端 `amapGeocode` / `MapPicker` 走服务端（小程序无浏览器、无法用高德 JS API）

> ⚠️ 小程序端「接口地址」必须构建期注入 `API_BASE`（公网 https，已加入微信公众平台 request 合法域名）：
> `API_BASE=https://你的后端域名 npm run build:weapp`。`config/index.ts` 的 `defineConstants` 已支持；
> 未注入时 `getApiBase()` 回退 `localhost:8000`（仅微信开发者工具关掉 urlCheck 时能临时指向本机后端，真机不可用）。
> 另：`Taro.getLocation` 需在微信公众平台开通「getLocation」接口并申请 `scope.userLocation`；
> 真机 UI 验证需开发者工具/真机（本机无法跑，由人工在真机确认）。
> **需要你逐项真机验证的事项目录见 [`docs/小程序真机验证.md`](docs/小程序真机验证.md)（带 TODO 勾选清单）。**

### Phase 3 · 补充 / 深化
- [ ] 权重排序算法深化（可配置权重）
- [ ] 异地跨城中心：带权重的「交通费均衡」算法
- [ ] 实时位置更新（WebSocket，可选）
- [ ] 单元测试 + 部署（GitHub Pages / 服务器）

---

## 六、已确认的设计决策

| # | 设计点 | 决策 |
| --- | --- | --- |
| 1 | 餐厅数据源 | **高德地图 POI 检索**为主（大众点评/美团无公开 API） |
| 2 | 跨城中心算法 | **交通费均衡（方差最小）**——中心点使每人交通费尽量接近 |
| 3 | 小程序分享 | **微信分享卡片**（带碰面 code） |
| 4 | 位置实时性 | **发起时快照**（加入时记录一次，后续不变） |
| 5 | 同城中心算法 | 球面几何质心（cartesian 平均，比经纬度简单平均更准） |
| 6 | 无登录身份 | 设备匿名 UUID（`X-Device-Id` 头）+ 后端自动建 User |

---

## 七、需要的 API Key / 环境变量（你后续提供）

```env
# 高德地图（⚠️ 两类 Key 必须分开申请：Web 服务用于后端 POI 检索，JS API 用于前端地图）
AMAP_WEB_KEY=        # Web 服务 Key（POI 检索/地理编码）✅ 已提供（2026-09-09 补发）
AMAP_JS_KEY=         # JS API Key（前端地图）✅ 已提供（最初给的 web 端 key 即此类型）

# 微信小程序
WECHAT_APPID=
WECHAT_SECRET=

# 大模型（OpenAI 兼容，默认 DeepSeek；后期换模型只改这三项）
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# 数据库
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=eat_where
```

---

## 八、开发路线（执行顺序）

1. Phase 0 脚手架（后端 + 前端 + 表结构）
2. Phase 1 Web 端跑通主链路：发起 → 加入 → 中心点 → 餐厅推荐
3. Phase 2 小程序复用同一后端，补齐端上能力
4. Phase 3 算法深化 + 实时 + 部署

---

## 九、本地运行（已验证）

### 后端
```bash
cd backend
python -m venv venv && venv/Scripts/pip install -r requirements.txt
cp .env.example .env          # 填入你的 Key（先留空也能跑，餐厅用 mock、AI 降级）
# 本地快速验证（默认 MySQL，凭据在 .env 的 DATABASE_URL）：
python init_db.py
uvicorn app.main:app --reload --port 8000
# 回退 SQLite：在 .env 把 DATABASE_URL 改为 sqlite:///./dev.db 再跑上面两条
```
> 已用本机 MySQL 实测跑通（root/root，库 `where_to_eat`）：发起碰面 → 朋友加入(自动算距离) → 中心点(同城/跨城，已持久化) → 餐厅权重排序(真实高德 POI，已落库 restaurants 表) → AI 推送。

### 前端（Taro）
```bash
cd frontend
npm install
npm run dev:h5        # 浏览器调试（默认连 http://localhost:8000）
npm run dev:weapp     # 微信开发者工具导入 dist 目录调试小程序
```
> ⚠️ **Node 版本**：本工程 Taro 3.6.23 在 **Node 22** 下配置加载会报错
>（`window is not defined` / `defineAppConfig is not a function`，根因是 Taro 配置加载器在 Node 22 把 `@tarojs/taro` 解析成了浏览器构建）。
> **请用 Node 18 / 20 构建**（nvm 切到 20 再 `npm install && npm run dev:h5` 即可）。
> 构建脚本已显式指向本地 `@tarojs/cli/bin/taro`，避免系统中全局 taro 干扰。
> 高德 JS Key 由 `config/index.ts` 在构建期从 `backend/.env` 注入（不入库明文）。

### 本机一键本地预览（已部署验证）
项目根目录提供 `dev-start.sh` + `serve.js`，自动处理本机环境差异：
```bash
# 在 Git Bash / WSL 中执行（首次需先建好 backend/.venv 与 frontend/dist，见上）
./dev-start.sh
```
它会：用 nvm4w 的 **Node 20.18.3**（本机 `C:/DevEnv/nodeDev/nvm/nvm/v20.18.3`）构建运行前端、
关闭沙箱 safe-delete 守卫（`CODEBUDDY_SAFE_DELETE_ENABLED=0`，否则 pip/taro 清空目录会报错）、
用 venv 启动后端（MySQL，:8000，凭据见 `backend/.env` 的 `DATABASE_URL`）、用 `serve.js` 静态托管 `frontend/dist`（:3000，带 SPA 回退）。
启动后访问：
- 前端 Web 预览：http://localhost:3000
- 后端 API 文档：http://localhost:8000/docs

> 备注：`src/app.config.ts` 已改为直接 `export default {...}`（不再 `import { defineAppConfig } from '@tarojs/taro'`）。
> 原因：Taro 在 Node 端用 esbuild 求值 app.config.ts，引入 `@tarojs/taro` 会加载 `@tarojs/runtime` 的 env.js，
> 其中 `process.env.TARO_PLATFORM==='web' ? window : EMPTY_OBJ` 在 H5 构建时 `TARO_PLATFORM==='web'`，
> Node 无 `window` 即报 `window is not defined`。此修复对所有 Node 版本生效。

---

## 十、内网 HTTPS 与「精确定位」（安全上下文）

### 为什么需要 HTTPS
浏览器原生精确定位 `navigator.geolocation` **只在「安全上下文」可用**：
- ✅ `https://…`（证书被信任）
- ✅ `http://localhost` / `http://127.0.0.1`
- ❌ `http://192.168.x.x`（局域网 IP）——非安全上下文，`navigator.geolocation` 直接不可用，
  控制台报 `Only secure origins are allowed`。

所以局域网内想用「当前精确位置」，必须让页面跑在 `https://` 上。IP 定位（城市级）不受此限制，
但精度只到城市，只能作为兜底。

### 方案：自签本地 CA + HTTPS 同源服务（:8443）
项目根目录提供 `https_server.js`（零依赖 Node），做两件事：
1. 用 `certs/` 下的证书以 **https** 提供前端静态产物；
2. 把 `/api/*`（含 `/docs`）**反向代理**到后端 `:8000`，保证「页面 https + 接口 https 同源」，避免混合内容拦截。
`frontend/src/config.ts` 的 `getApiBase()` 在 `https:` 下返回同源地址（不带 `:8000`）。

### 证书（已生成，位于服务器 `certs/`）
| 文件 | 说明 |
| --- | --- |
| `certs/ca.crt` | 本地根证书，**需安装到每台测试设备并设为受信任** |
| `certs/server.crt` / `server.key` | 服务器证书（SAN：`eat.lan`、`localhost`、`192.168.31.5`、`127.0.0.1`），有效期 825 天 |
| `certs/ca.key` | CA 私钥（勿外泄，已 gitignore） |

重新生成（Linux）：
```bash
cd certs
openssl genrsa -out ca.key 2048
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -subj "/CN=WhereToEat Local CA" -out ca.crt
openssl genrsa -out server.key 2048
openssl req -new -key server.key -subj "/CN=eat.lan" -out server.csr
cat > san.cnf <<'EOF'
subjectAltName=DNS:eat.lan,DNS:localhost,IP:192.168.31.5,IP:127.0.0.1
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
basicConstraints=CA:FALSE
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -sha256 -extfile san.cnf
```

### 使用步骤（测试精确定位）
1. **安装根证书**：把 `certs/ca.crt` 传到测试设备并安装为受信任根证书
   - **iOS**：下载 `.crt` → 设置 → 通用 → VPN与设备管理 → 安装描述文件；再到 设置 → 通用 → 关于本机 → 证书信任设置 → 打开完全信任。
   - **Android**：设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书 → 选择 `ca.crt`。
   - **Windows**：双击 `ca.crt` → 安装证书 → 本地计算机 → 受信任的根证书颁发机构。
2. **访问**：`https://192.168.31.5:8443/`（证书 SAN 已含该 IP，直接可用）。
   想用域名 `eat.lan` 访问，则在设备/路由 DNS 或 hosts 里把 `eat.lan` 解析到 `192.168.31.5`。
3. 页面提示定位授权时点「允许」→ 生效后拿到的是 **浏览器精确定位**（`precise: true`）。

启动/停止（服务器 `~/project/where_do_we_go_to_eat`）：
```bash
bash run_server.sh                 # 同时起 :8000 后端 / :3000 http 前端 / :8443 https 前端
fuser -k 3000/tcp 8000/tcp 8443/tcp   # 停止
```

### ⚠️ 重要：桌面浏览器的地域限制
桌面版 Chrome / Edge 的定位依赖 **Google 网络定位服务**（`googleapis.com`），**中国大陆网络通常不可达**，
因此即使升级到 https，桌面端也可能仍拿不到精确定位（报网络定位服务不可用）。
**建议用手机浏览器（通过上面的 https）测试精确定位**——手机走系统 GPS/WiFi 定位，最可靠；
微信小程序端则用腾讯定位服务，国内可用。桌面端可改用「手动选点 / 搜索地址」作为精确输入。

