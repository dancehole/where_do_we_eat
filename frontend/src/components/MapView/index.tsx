import { View, Text, Map } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import { AMAP_JS_KEY } from '../../config'
import { loadAMap, getAMapLastError, weappReverseGeocode } from '../../utils/amap'
import { reportDebug } from '../../utils/debug'
import { useResponsive } from '../../hooks/useResponsive'

export interface MapMarker {
  lat: number
  lng: number
  title?: string
  /** 标记类型：self=自己(蓝) / friend=朋友(绿) / center=碰面中心(红) / poi=默认(橙，餐厅等) */
  type?: 'self' | 'friend' | 'center' | 'poi'
}

/** 选点结果：坐标 + 反查地址 */
export interface PickedPoint {
  lat: number
  lng: number
  addr: string
}

interface Props {
  center: { lat: number; lng: number }
  markers?: MapMarker[]
  /** 自定义高度（像素）。不传则按设备模式自适应 */
  height?: number
  /** 点击某个标记时回调（传入 markers 数组中的下标），用于美食地图跳转到对应餐厅卡片 */
  onMarkerClick?: (index: number) => void
  /** 选点模式：点击 / 拖动地图即选中位置（返回反查地址）。用于「碰面」发起页把预览地图同时当选择器 */
  onPick?: (p: PickedPoint) => void
}

// 构建期常量：H5 构建时 Taro 会把 process.env.TARO_ENV 替换为字符串字面量，
// 因此下面 IS_H5 分支能让 <Map>（微信小程序组件）完全不进入 H5 包，
// 从根上避免 “H5 暂不支持 Map 组件” 的运行时告警。
const IS_H5 = process.env.TARO_ENV === 'h5'

// 各模式默认地图高度：小屏紧凑、PC 宽屏更高
function defaultHeight(mode: 'mobile' | 'tablet' | 'desktop') {
  return mode === 'mobile' ? 240 : mode === 'tablet' ? 320 : 460
}

// 标记颜色：self=自己(蓝) / friend=朋友(绿) / center=碰面中心(红) / poi=餐厅等(橙)
const MARKER_COLOR: Record<string, string> = {
  self: '#3b82f6',
  friend: '#10b981',
  center: '#ef4444',
  poi: '#ff6b35',
}

const escapeHtml = (s: string): string =>
  String(s || '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })

// 注入一次自定义标记样式：彩色水滴 + 文字标签 + 展开后 1s 落下动画 + 中心持续脉冲
function ensureMarkerStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById('wte-map-style')) return
  const s = document.createElement('style')
  s.id = 'wte-map-style'
  s.textContent = `
.wte-marker{display:flex;flex-direction:column;align-items:center;transform-origin:center bottom;
  animation:wteDrop .55s cubic-bezier(.2,.8,.3,1.25) both;animation-delay:1s;}
.wte-label{margin-bottom:6px;padding:2px 8px;border-radius:999px;background:var(--c);color:#fff;
  font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25);}
.wte-pin{width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--c);
  border:2px solid #fff;box-shadow:0 3px 7px rgba(0,0,0,.3);}
.wte-marker--center .wte-pin{width:26px;height:26px;animation:wtePulse 1.8s ease-out 1.7s infinite;}
@keyframes wteDrop{from{transform:translateY(-18px) scale(.5);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
@keyframes wtePulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}
  70%{box-shadow:0 0 0 12px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
`
  document.head.appendChild(s)
}

// 小程序 callout 背景色需 #RRGGBBAA
function hexToRgba(hex: string, alpha = 0.95): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const a = Math.round(alpha * 255)
  return `#${[r, g, b, a].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

let seq = 0

/**
 * 跨端地图：
 * - H5：动态加载高德 JS API，在容器内 new AMap.Map 标点（复用实例，避免重复创建）。
 * - 微信小程序：使用原生 <Map> 组件（自带地图，坐标用 gcj02，与高德一致）。
 *
 * H5 下地图空白是最常见的坑，这里做了三重兜底：
 *   ① 等容器尺寸 > 0 再初始化（flex/grid 布局下首帧可能为 0，AMap 会渲染空白）
 *   ② ResizeObserver 监听容器尺寸变化并调用 map.resize()（侧栏/折叠展开后不白屏）
 *   ③ 初始化失败时把原因显示在容器上并上报后端 /api/debug/log，绝不静默空白
 *
 * 选点模式（onPick 非空）：把「预览图」同时当「选择器」——点击/拖动地图即选中位置，
 * 用于「碰面」发起页，避免再额外弹出一个地图选点器（从两张图减到一张图）。
 */
export default function MapView({ center, markers = [], height, onMarkerClick, onPick }: Props) {
  const { mode } = useResponsive()
  const h = height ?? defaultHeight(mode)
  const ref = useRef<any>(null)
  const mapRef = useRef<any>(null)
  const idRef = useRef<string>(`amap-canvas-${++seq}`)
  const [err, setErr] = useState('')
  // 用 ref 持有最新回调，避免地图初始化时的闭包拿到旧值
  const onMarkerClickRef = useRef(onMarkerClick)
  onMarkerClickRef.current = onMarkerClick
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const geocoderRef = useRef<any>(null)

  // 把对象/数组依赖序列化成字符串，避免每次父组件 render 都触发重建
  const centerKey = center ? `${center.lat},${center.lng}` : ''
  const markerKey = markers
    .map((m) => `${m.lat},${m.lng},${m.title || ''},${m.type || 'poi'}`)
    .join('|')

  useEffect(() => {
    if (!IS_H5) return
    if (!AMAP_JS_KEY) {
      const m = '未注入高德 JS Key（AMAP_JS_KEY 为空），请检查 backend/.env'
      setErr(m)
      reportDebug(`[Map] ${m}`, 'ERROR')
      return
    }

    let cancelled = false
    let tries = 0
    let rafId = 0
    let ro: any = null

    const getEl = (): HTMLElement | null => {
      const byId = document.getElementById(idRef.current)
      if (byId) return byId as HTMLElement
      const r = ref.current
      return r && r.nodeType === 1 ? (r as HTMLElement) : null
    }

    // ⚠️ 关键：高德 JSAPI 不能在 Taro 的自定义元素 <taro-view-core> 上初始化
    // （实测报 `Cannot read properties of undefined (reading '___amap___')`，
    //  换成原生 <div> 就正常）。所以这里用一个普通 div 作为地图宿主，
    //  由脚本动态创建并挂到 Taro 容器里，既保住跨端结构，又满足高德对容器元素类型的要求。
    const ensureHost = (wrapper: HTMLElement): HTMLElement => {
      let host = wrapper.querySelector('div.amap-host') as HTMLElement | null
      if (!host) {
        host = document.createElement('div')
        host.className = 'amap-host'
        host.style.cssText =
          'position:absolute;top:0;left:0;width:100%;height:100%;background:transparent;'
        wrapper.appendChild(host)
      }
      return host
    }

    // 选点模式：反查地址后回调（高德 Geocoder 未就绪时回退为坐标字符串）
    const reverseGeocodePoint = (lat: number, lng: number) => {
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      const done = (addr: string) => {
        if (onPickRef.current) onPickRef.current({ lat, lng, addr })
      }
      const g: any = geocoderRef.current
      if (g && typeof g.getAddress === 'function') {
        try {
          g.getAddress([lng, lat], (status: string, result: any) => {
            const a =
              status === 'complete' && result?.regeocode?.formattedAddress
                ? result.regeocode.formattedAddress
                : fallback
            done(a)
          })
        } catch {
          done(fallback)
        }
      } else {
        done(fallback)
      }
    }

    const init = () => {
      if (cancelled) return
      const wrapper = getEl()
      if (!wrapper || wrapper.clientWidth === 0 || wrapper.clientHeight === 0) {
        tries += 1
        if (tries > 120) {
          const m = `地图容器尺寸为 0（w=${wrapper?.clientWidth ?? 'null'} h=${wrapper?.clientHeight ?? 'null'}），无法初始化`
          setErr(m)
          reportDebug(`[Map] ${m}`, 'ERROR')
          return
        }
        rafId = requestAnimationFrame(init)
        return
      }

      const host = ensureHost(wrapper)

      loadAMap()
        .then((AMap: any) => {
          if (cancelled) return
          try {
            if (!mapRef.current) {
              mapRef.current = new AMap.Map(host, {
                center: [center.lng, center.lat],
                zoom: 12,
                resizeEnable: true,
              })
              // 容器尺寸变化（响应式断点、抽屉展开等）后让高德重算画布
              if (typeof ResizeObserver !== 'undefined') {
                ro = new ResizeObserver(() => {
                  try {
                    mapRef.current?.resize?.()
                  } catch {
                    /* ignore */
                  }
                })
                ro.observe(host)
              }
              // 选点模式：加载 Geocoder，点击 / 拖动地图即选中位置
              // （碰面发起页把预览图同时当选择器，省掉额外弹出的选点地图）
              if (onPickRef.current) {
                try {
                  AMap.plugin(['AMap.Geocoder'], () => {
                    try {
                      geocoderRef.current = new AMap.Geocoder({})
                    } catch {
                      /* ignore */
                    }
                  })
                } catch {
                  /* ignore */
                }
                mapRef.current.on('click', (e: any) => {
                  const lat = Number(e?.lnglat?.lat)
                  const lng = Number(e?.lnglat?.lng)
                  if (!lat || !lng) return
                  reverseGeocodePoint(lat, lng)
                })
              }
            }
            const map = mapRef.current
            if (typeof map.clearMap === 'function') map.clearMap()
            ensureMarkerStyle()
            markers.forEach((m, i) => {
              const type = m.type || 'poi'
              const color = MARKER_COLOR[type] || MARKER_COLOR.poi
              const label =
                m.title ||
                (type === 'center' ? '碰面中心' : type === 'self' ? '我' : type === 'friend' ? '朋友' : '')
              const html =
                `<div class="wte-marker wte-marker--${type}" style="--c:${color}">` +
                `<div class="wte-label">${escapeHtml(label)}</div>` +
                `<div class="wte-pin"></div>` +
                `</div>`
              // 选点模式下，让第 0 个标记（通常是「我」）可拖动微调
              const pickable = !!(onPickRef.current && i === 0)
              const mk = new AMap.Marker({
                position: [m.lng, m.lat],
                content: html,
                anchor: 'bottom-center',
                title: label,
                map,
                zIndex: type === 'center' ? 200 : type === 'self' ? 120 : 100,
                draggable: pickable,
              })
              // 点击标记 → 回调对应餐厅下标（美食地图跳转到卡片）
              if (mk && typeof mk.on === 'function') {
                mk.on('click', () => {
                  if (onMarkerClickRef.current) onMarkerClickRef.current(i)
                })
                if (pickable) {
                  mk.on('dragend', () => {
                    const pos = mk.getPosition()
                    const lat = Number(pos?.lat)
                    const lng = Number(pos?.lng)
                    if (lat && lng) reverseGeocodePoint(lat, lng)
                  })
                }
              }
            })
            if (onPickRef.current) {
              // 选点模式：保持稳定缩放，避免每次点选都被 fitView 缩放跳动
              if (typeof map.setCenter === 'function') map.setCenter([center.lng, center.lat])
            } else {
              const all = [{ lng: center.lng, lat: center.lat }, ...markers]
              if (all.length >= 2 && typeof map.setFitView === 'function') {
                map.setFitView()
              } else if (typeof map.setCenter === 'function') {
                map.setCenter([center.lng, center.lat])
              }
            }
            setErr('')
            reportDebug(
              `[Map] ok center=${centerKey} markers=${markers.length} size=${host.clientWidth}x${host.clientHeight}`
            )
          } catch (e: any) {
            const m = `地图初始化异常：${e?.message || e}`
            setErr(m)
            reportDebug(`[Map] ${m}`, 'ERROR')
          }
        })
        .catch((e: any) => {
          if (cancelled) return
          setErr(e?.message || getAMapLastError() || '高德地图加载失败')
        })
    }

    init()
    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, markerKey, AMAP_JS_KEY])

  // 组件卸载时销毁实例并移除地图宿主 div，避免内存泄漏与残留 DOM
  useEffect(
    () => () => {
      try {
        mapRef.current?.destroy?.()
      } catch {
        /* ignore */
      }
      mapRef.current = null
      if (typeof document !== 'undefined') {
        const wrapper = document.getElementById(idRef.current)
        const host = wrapper?.querySelector('div.amap-host')
        if (host && host.parentNode) host.parentNode.removeChild(host)
      }
    },
    []
  )

  if (IS_H5) {
    return (
      <View className='map-canvas' style={{ width: '100%', height: h, marginTop: 12, position: 'relative' }}>
        <View
          id={idRef.current}
          ref={ref}
          style={{ display: 'block', width: '100%', height: h, position: 'absolute', top: 0, left: 0 }}
        />
        {err && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              padding: 12,
              boxSizing: 'border-box',
              display: 'flex',
              background: 'rgba(255,247,237,0.96)',
              color: '#b45309',
              fontSize: 12,
              lineHeight: 1.5,
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <Text>地图加载失败：{err}</Text>
          </View>
        )}
        {onPick && !err && (
          <View
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              zIndex: 2,
              background: 'rgba(255,107,53,0.92)',
              color: '#fff',
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 999,
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              pointerEvents: 'none',
            }}
          >
            <Text>点击地图选点 · 可拖动标记微调</Text>
          </View>
        )}
      </View>
    )
  }

  // 微信小程序：原生 Map 组件
  const wxMarkers = markers.map((m, i) => {
    const type = m.type || 'poi'
    const color = MARKER_COLOR[type] || MARKER_COLOR.poi
    const label =
      m.title ||
      (type === 'center' ? '碰面中心' : type === 'self' ? '我' : type === 'friend' ? '朋友' : '')
    return {
      id: i,
      latitude: m.lat,
      longitude: m.lng,
      width: 26,
      height: 26,
      callout: {
        content: label,
        color: '#ffffff',
        fontSize: 12,
        borderRadius: 8,
        bgColor: hexToRgba(color, 0.95),
        padding: 6,
        display: 'ALWAYS' as const,
        textAlign: 'center' as const,
      },
    }
  })
  return (
    <View>
      <Map
        longitude={center.lng}
        latitude={center.lat}
        scale={12}
        markers={wxMarkers}
        style={{ width: '100%', height: h, marginTop: 12 }}
        onMarkerTap={(e: any) => {
          const id = e?.detail?.markerId
          if (typeof id === 'number' && onMarkerClickRef.current) onMarkerClickRef.current(id)
        }}
        onTap={async (e: any) => {
          if (!onPickRef.current) return
          const lat = Number(e?.detail?.latitude)
          const lng = Number(e?.detail?.longitude)
          if (!lat || !lng) return
          const a = await weappReverseGeocode(lat, lng)
          onPickRef.current({ lat, lng, addr: a })
        }}
      />
      {onPick && (
        <Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#6b6b6b' }}>
          点击地图任意位置选点（小程序地图暂不支持拖动标记）
        </Text>
      )}
    </View>
  )
}
