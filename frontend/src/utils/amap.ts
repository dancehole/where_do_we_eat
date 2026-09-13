import { AMAP_JS_KEY, AMAP_SECURITY_CODE, getApiBase } from '../config'
import { reportDebug } from './debug'
import Taro from '@tarojs/taro'

// 懒加载高德 JS API（H5 专用）。若已加载则直接复用，避免重复注入 script。
let loadPromise: Promise<any> | null = null
// 最近一次失败原因，供 UI 展示（地图加载不出来时用户能看到具体原因，而不是空白）
let lastError = ''

export function getAMapLastError(): string {
  return lastError
}

// 注入 JSAPI 脚本（H5 专用）。本项目统一使用 1.4.15：
// - 避开 JSAPI 2.0 在非白名单域名下的内部崩溃（reportAllChanges 读 startTime undefined）；
// - 但仍需在加载脚本【前】设置 securityJsCode：1.4.15 的 Geocoder/AutoComplete 等 Web 服务
//   SDK（restapi.amap.com）会读取 window._AMapSecurityConfig.securityJsCode 来计算 sec_code，
//   不设置则 sec_code 为空串 MD5 → 报 INVALID_USER_SCODE(10008)。
function injectAMap(version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const w: any = window
    // 必须在脚本 onload 之前设置（高德官方要求：先声明安全密钥，再加载地图脚本）。
    if (AMAP_SECURITY_CODE) {
      w._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE }
    }
    const s = document.createElement('script')
    let done = false
    const finish = (ok: boolean, err?: Error) => {
      if (done) return
      done = true
      clearTimeout(timer)
      s.onload = null
      s.onerror = null
      ok ? resolve() : reject(err)
    }
    // 超时保护：脚本被拦截/挂起时不能永久 pending，否则地图永远是空白
    const timer = setTimeout(
      () => finish(false, new Error(`高德脚本加载超时（${version}，请检查网络或该域名是否被拦截）`)),
      15000
    )
    s.src = `https://webapi.amap.com/maps?v=${version}&key=${AMAP_JS_KEY}`
    s.async = true
    s.onload = () => finish(true)
    s.onerror = () => finish(false, new Error(`高德脚本网络加载失败（${version}）`))
    document.head.appendChild(s)
  })
}

// 懒加载高德 JS API（H5 专用）。统一 1.4.15：用 securityJsCode 喂给 web 服务 SDK（修 INVALID_USER_SCODE），
// 同时避开 2.0 的 startTime 崩溃。
//
// ⚠️ 关键修复：失败后必须把 loadPromise 置空。
// 之前失败后 loadPromise 会保留一个 rejected promise，导致此后**每一次** loadAMap() 都直接失败，
// 地图/搜索/定位会永久性地全部不可用（首次失败后无论怎么重试都救不回来）。
export function loadAMap(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('非 H5 环境'))
  }
  const w: any = window
  if (w.AMap) return Promise.resolve(w.AMap)
  if (loadPromise) return loadPromise

  loadPromise = injectAMap('1.4.15')
    .then(() => {
      if (!w.AMap) {
        throw new Error('高德脚本已加载但未初始化 window.AMap（密钥被拒或域名未授权）')
      }
      lastError = ''
      return w.AMap
    })
    .catch((e: any) => {
      loadPromise = null // 允许下次重试
      lastError = e?.message || String(e)
      reportDebug(`[AMap] loadAMap 失败: ${lastError}`, 'ERROR')
      throw e instanceof Error ? e : new Error(lastError)
    })
  return loadPromise
}

// 运行时按需加载插件（不依赖初始 script 的 plugin 参数）
export function withPlugin(AMap: any, plugin: string | string[]): Promise<any> {
  return new Promise((resolve) => {
    AMap.plugin(plugin, () => resolve(AMap))
  })
}

export interface GeoPoint {
  lat: number
  lng: number
  addr?: string
  /** true=浏览器精确定位（WGS-84→GCJ-02）；false=高德网络/IP 定位（城市级，非安全上下文兜底） */
  precise?: boolean
}

// 浏览器 HTML5 精确定位（WGS-84）；localhost 属于安全上下文，可直接用。需用户授权。
function browserLocate(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('当前环境不支持浏览器定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err?.message || '用户拒绝或浏览器定位失败')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  })
}

// WGS-84 → 高德 GCJ-02（地图显示与坐标存储都用 GCJ-02）
function toGCJ02(AMap: any, lat: number, lng: number): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (!AMap.convertFrom) return resolve({ lat, lng })
    AMap.convertFrom([lng, lat], 'gps', (status: string, result: any) => {
      const p = result?.locations?.[0]
      if (status === 'complete' && p) resolve({ lat: Number(p.lat), lng: Number(p.lng) })
      else resolve({ lat, lng })
    })
  })
}

// GCJ-02 坐标 → 可读地址
function reverseGeocode(AMap: any, lat: number, lng: number): Promise<string> {
  return new Promise((resolve) => {
    const geocoder = new AMap.Geocoder({})
    geocoder.getAddress([lng, lat], (status: string, result: any) => {
      if (status === 'complete' && result?.regeocode?.formattedAddress) {
        resolve(result.regeocode.formattedAddress as string)
      } else {
        resolve(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      }
    })
  })
}

// 高德 IP 定位兜底：无需授权，城市级；仅在浏览器精确定位不可用/被拒时触发。
// ⚠️ 关键：noGeoLocation:true 强制【只走 IP 定位】。
// 否则 AMap.Geolocation 默认「先浏览器 HTML5 定位」——而在 http://192.168.x.x 这类非安全上下文下，
// navigator.geolocation 为 undefined，插件内部会直接抛 SecurityError 导致整个定位失败（用户反馈"无法获取位置"）。
// 设 noGeoLocation:true 后插件跳过浏览器定位、直接回退到 IP，局域网/HTTP 也能拿到城市级坐标。
// 注意：非安全源下该插件有时【既不回调也不报错】（挂起），所以外层包一个超时，避免整个定位链路卡死。
function amapIpLocate(AMap: any): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      reject(new Error('高德 JS IP 定位超时'))
    }, 6000)
    const geo = new AMap.Geolocation({ noGeoLocation: true, timeout: 5000, needAddress: true })
    geo.getCurrentPosition((status: string, result: any) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (status === 'complete' && result?.position) {
        resolve({
          lat: Number(result.position.lat),
          lng: Number(result.position.lng),
          addr: result.formattedAddress || `${result.position.lat}, ${result.position.lng}`,
        })
      } else {
        reject(new Error(result?.message || result?.info || '网络定位失败'))
      }
    })
  })
}

// 从任意 IP 服务返回的 JSON 里解析经纬度（兼容 latitude/longitude、lat/lng、loc "lat,lng"）
function parseLatLng(d: any): { lat: number; lng: number; addr: string } | null {
  if (!d || typeof d !== 'object') return null
  if (d.success === false) return null
  let lat: number | null = null
  let lng: number | null = null
  const addr = `${d.region || d.region_name || ''}${d.city || ''}`.trim()
  if (d.latitude != null && d.longitude != null) {
    lat = Number(d.latitude)
    lng = Number(d.longitude)
  } else if (d.lat != null && d.lng != null) {
    lat = Number(d.lat)
    lng = Number(d.lng)
  } else if (d.loc) {
    const [a, b] = String(d.loc).split(',')
    lat = Number(a)
    lng = Number(b)
  }
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null
  return { lat, lng, addr: addr || '网络定位' }
}

// 浏览器侧可直接跨域访问的公共 IP 定位服务（均返回 Access-Control-Allow-Origin: *）
//   api.ip.sb：对大陆网络友好，直接给 latitude/longitude
//   ipwho.is：直接给 latitude/longitude
//   ipinfo.io：给 loc = "lat,lng"
// 说明：ipapi.co 近期会返回 403（限流），故不再列为首选。
const IP_SERVICES: string[] = [
  'https://api.ip.sb/geoip/',
  'https://ipwho.is/',
  'https://ipinfo.io/json',
]

// 获取本机公网 IP。服务端看不到客户端的公网出口 IP（内网里只看到内网 IP），
// 所以由浏览器自己取，再交给服务端按这个 IP 定位。
function getClientPublicIp(): Promise<string> {
  const urls = ['https://api.ip.sb/ip', 'https://ipwho.is/ip', 'https://api.ipify.org']
  const tryOne = (i: number): Promise<string> => {
    if (i >= urls.length) return Promise.reject(new Error('获取公网 IP 失败'))
    return new Promise<string>((resolve, reject) => {
      Taro.request({ url: urls[i], method: 'GET' })
        .then((res: any) => {
          const d = res.data
          const ip = typeof d === 'string' ? d.trim() : d && d.ip ? String(d.ip).trim() : ''
          const ok = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.includes(':')
          ok ? resolve(ip) : reject(new Error('无有效 IP'))
        })
        .catch(() => reject(new Error('请求失败')))
    }).catch((e) => (i + 1 < urls.length ? tryOne(i + 1) : Promise.reject(e)))
  }
  return tryOne(0)
}

// 服务端 IP 定位兜底（城市级，GCJ-02）。与浏览器安全上下文无关。
// 尽量带上「本机公网 IP」，让服务端按客户端真实出口 IP 定位（否则只能定位到服务器所在城市）。
function backendIpLocate(): Promise<GeoPoint> {
  const base = getApiBase()
  return getClientPublicIp()
    .catch(() => '')
    .then((ip) => Taro.request({ url: `${base}/api/geo/ip${ip ? `?ip=${encodeURIComponent(ip)}` : ''}`, method: 'GET' }))
    .then((res: any) => {
      const d = res.data || {}
      if (d.ok && d.lat != null && d.lng != null) {
        return { lat: d.lat, lng: d.lng, addr: d.addr || '网络定位', precise: false } as GeoPoint
      }
      throw new Error(d.reason || '服务端 IP 定位失败')
    })
    .catch((e: any) => {
      throw new Error(e?.message || '服务端 IP 定位请求失败')
    })
}

// 公共 CORS IP 定位兜底（城市级，WGS-84）：浏览器直连公开 HTTPS IP 服务。
// 返回的 WGS-84 会转成高德 GCJ-02 再使用，避免在高德地图上偏移。
function publicIpLocate(): Promise<GeoPoint> {
  const tryOne = (i: number): Promise<GeoPoint> => {
    if (i >= IP_SERVICES.length) return Promise.reject(new Error('所有公共 IP 定位均失败'))
    return new Promise<GeoPoint>((resolve, reject) => {
      Taro.request({ url: IP_SERVICES[i], method: 'GET' })
        .then((res: any) => {
          const p = parseLatLng(res.data)
          if (p) resolve({ ...p, precise: false })
          else reject(new Error('解析失败'))
        })
        .catch(() => reject(new Error('请求失败')))
    }).catch((e) => (i + 1 < IP_SERVICES.length ? tryOne(i + 1) : Promise.reject(e)))
  }
  return tryOne(0).then(async (p) => {
    // WGS-84 → GCJ-02（高德地图/存储用 GCJ-02）
    try {
      const AMap = await loadAMap()
      const g = await toGCJ02(AMap, p.lat, p.lng)
      return { ...p, lat: g.lat, lng: g.lng }
    } catch {
      return p
    }
  })
}

// 定位环境快照（用于 UI 诊断 + 日志）：为什么精确定位不可用，一眼可见
export function getLocateEnv(): {
  secure: boolean
  hasGeolocation: boolean
  protocol: string
  host: string
} {
  const w: any = typeof window !== 'undefined' ? window : null
  return {
    secure: !!(w && w.isSecureContext),
    hasGeolocation: typeof navigator !== 'undefined' && !!navigator.geolocation,
    protocol: (w && w.location && w.location.protocol) || '',
    host: (w && w.location && w.location.host) || '',
  }
}

// 给任意 Promise 套一层超时，避免个别浏览器 getCurrentPosition 既不回调也不报错导致整链卡死
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

const errMsg = (e: any) => (e && e.message ? e.message : String(e))

// 定位策略（多级兜底）：
//   ① 浏览器精确定位（WGS-84→GCJ-02→反查地址）——仅安全上下文（https / localhost）可用；
//   ② 高德 JS IP 定位（城市级）——非安全上下文可用，但部分环境会挂起/失败；
//   ③ 公共 CORS IP 定位（城市级，WGS-84→GCJ-02）——浏览器直连 api.ip.sb → ipwho.is → ipinfo.io，
//      直接拿到【本机出口 IP】对应城市；
//   ④ 服务端 IP 定位（城市级，GCJ-02）——携带本机公网 IP，让服务端按客户端出口 IP 解析，作为最后兜底。
// 每一级的失败原因都会被记录下来（UP 到后端日志 + 拼进抛出的错误），便于排查“为什么定位失败”。
export async function amapLocate(): Promise<GeoPoint> {
  const env = getLocateEnv()
  const reasons: string[] = []
  reportDebug(
    `[locate] begin secureContext=${env.secure} geolocation=${env.hasGeolocation} origin=${env.protocol}//${env.host}`,
    'INFO'
  )

  // ① 浏览器精确定位
  if (env.hasGeolocation) {
    try {
      const AMap = await loadAMap()
      await withPlugin(AMap, ['AMap.Geocoder', 'AMap.Geolocation'])
      const wgs = await withTimeout(
        browserLocate(),
        9000,
        '浏览器定位超时（网络定位服务可能不可达，如国内访问 Google 定位服务被墙）'
      )
      const g = await toGCJ02(AMap, wgs.lat, wgs.lng)
      const addr = await reverseGeocode(AMap, g.lat, g.lng)
      reportDebug('[locate] ① 浏览器精确定位成功', 'INFO')
      return { lat: g.lat, lng: g.lng, addr, precise: true }
    } catch (e) {
      const m = errMsg(e)
      reasons.push('浏览器精确定位失败：' + m)
      reportDebug('[locate] ① 浏览器精确定位失败：' + m, 'ERROR')
    }
  } else {
    const m = env.secure
      ? '当前浏览器不支持 geolocation'
      : `非安全上下文（当前 ${env.protocol}//${env.host}，需 https 或 localhost）`
    reasons.push('浏览器精确定位不可用：' + m)
    reportDebug('[locate] ① 跳过浏览器定位：' + m, 'ERROR')
  }

  // ② 高德 JS IP 定位
  try {
    const AMap = await loadAMap()
    await withPlugin(AMap, ['AMap.Geolocation'])
    const ip = await amapIpLocate(AMap)
    reportDebug('[locate] ② 高德 JS IP 定位成功', 'INFO')
    return { ...ip, precise: false }
  } catch (e) {
    const m = errMsg(e)
    reasons.push('高德网络定位失败：' + m)
    reportDebug('[locate] ② 高德 JS IP 定位失败：' + m, 'ERROR')
  }

  // ③ 公共 CORS IP 定位（浏览器直连，首选 api.ip.sb）：拿到的是【本机出口 IP】对应城市，
  //    比服务端定位更贴近用户；且不受安全上下文限制。
  try {
    const p = await publicIpLocate()
    reportDebug('[locate] ③ 公共 IP 定位成功（ip.sb/ipwho.is/ipinfo）', 'INFO')
    return p
  } catch (e) {
    const m = errMsg(e)
    reasons.push('公共网络定位失败：' + m)
    reportDebug('[locate] ③ 公共 IP 定位失败：' + m, 'ERROR')
  }

  // ④ 服务端 IP 定位（携带本机公网 IP，让服务端按客户端出口 IP 解析）
  try {
    const p = await backendIpLocate()
    reportDebug('[locate] ④ 服务端 IP 定位成功', 'INFO')
    return p
  } catch (e) {
    const m = errMsg(e)
    reasons.push('服务端网络定位失败：' + m)
    reportDebug('[locate] ④ 服务端 IP 定位失败：' + m, 'ERROR')
  }

  throw new Error('定位失败：' + reasons.join('；'))
}

// 地址关键词 -> 坐标（微信小程序专用）：小程序无浏览器、无法加载高德 JS API，
// 故地址搜索必须走服务端 Web 服务（后端 /api/geo/geocode）。返回候选列表供用户选择。
async function weappGeocode(keyword: string): Promise<GeoPoint[]> {
  const base = getApiBase()
  const res: any = await Taro.request({
    url: `${base}/api/geo/geocode?keyword=${encodeURIComponent(keyword)}`,
    method: 'GET',
  })
  const d = res.data || {}
  if (d.ok && Array.isArray(d.list) && d.list.length) {
    return d.list.map((g: any) => ({ lat: Number(g.lat), lng: Number(g.lng), addr: g.addr }))
  }
  throw new Error(d.reason || '未找到该地点，换个关键词试试')
}

// 坐标 -> 可读地址（微信小程序专用）：小程序无法用高德 JS Geocoder，走服务端 /api/geo/regeo。
export async function weappReverseGeocode(lat: number, lng: number): Promise<string> {
  const base = getApiBase()
  try {
    const res: any = await Taro.request({
      url: `${base}/api/geo/regeo?lat=${lat}&lng=${lng}`,
      method: 'GET',
    })
    const d = res.data || {}
    if (d.ok && d.addr) return d.addr
  } catch {
    /* ignore */
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

// 地址关键词 -> 坐标（高德地理编码），返回候选列表供用户选择
export async function amapGeocode(keyword: string): Promise<GeoPoint[]> {
  // 微信小程序：无浏览器、无法加载高德 JS API，地址搜索走服务端 Web 服务
  if (process.env.TARO_ENV === 'weapp') {
    return weappGeocode(keyword)
  }
  const AMap = await loadAMap()
  await withPlugin(AMap, 'AMap.Geocoder')
  const geocoder = new AMap.Geocoder({ city: '全国' })
  return new Promise((resolve, reject) => {
    geocoder.getLocation(keyword, (status: string, result: any) => {
      if (status === 'complete' && result?.geocodes?.length) {
        resolve(
          result.geocodes.map((g: any) => ({
            lat: Number(g.location.lat),
            lng: Number(g.location.lng),
            addr: g.formattedAddress,
          }))
        )
      } else {
        reject(new Error(result?.info ? `搜索失败：${result.info}` : '未找到该地点，换个关键词试试'))
      }
    })
  })
}
