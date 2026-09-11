// 后端基础地址解析。
//
// 优先级：
//   1) process.env.API_BASE —— 构建期显式注入（生产/小程序需要时用）
//   2) H5 运行时：自动取「当前页面主机名 + 8000 端口」
//        localhost:3000        -> http://localhost:8000
//        192.168.31.2:3000     -> http://192.168.31.2:8000     ← 内网其它设备访问开箱即用
//   3) 兜底：http://localhost:8000
//
// 注意：微信小程序没有 window，必须靠 process.env.API_BASE（且需 https + 已配置 request 合法域名）。
export function getApiBase(): string {
  const explicit = (process.env.API_BASE || '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const loc = window.location
    const { protocol, hostname } = loc
    // HTTPS 场景：走「同源反向代理」（https_server.js 把 /api/* 转发到后端 :8000）。
    // 若仍拼 :8000 会变成 https 页面请求 http://host:8000 → 触发混合内容拦截。
    if (protocol === 'https:') {
      return loc.origin.replace(/\/+$/, '')
    }
    // file:// 直接打开产物时不适用，退回 localhost
    if (protocol === 'http:') {
      return `${protocol}//${hostname}:8000`
    }
  }
  return 'http://localhost:8000'
}

// 兼容既有 `import { API_BASE }` 的写法（H5 下模块加载时 window 已存在）
export const API_BASE = getApiBase()

// 高德 JS API Key（构建期由 Taro defineConstants 从 backend/.env 注入，不入库明文）
export const AMAP_JS_KEY: string = process.env.AMAP_JS_KEY || ''
// 高德 JS API 安全密钥。本项目固定使用 JSAPI 1.4.15（避开 2.0 在非白名单域名下的崩溃），
// 但仍需在加载脚本前设置 securityJsCode，否则 Geocoder/AutoComplete 等 Web 服务会报
// INVALID_USER_SCODE(10008)。在 backend/.env 的 AMAP_SECURITY_CODE 配置。
export const AMAP_SECURITY_CODE: string = process.env.AMAP_SECURITY_CODE || ''
