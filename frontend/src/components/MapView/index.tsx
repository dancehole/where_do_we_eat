import { View, Text, Map } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import { AMAP_JS_KEY } from '../../config'
import { loadAMap, getAMapLastError } from '../../utils/amap'
import { reportDebug } from '../../utils/debug'
import { useResponsive } from '../../hooks/useResponsive'

export interface MapMarker {
  lat: number
  lng: number
  title?: string
}

interface Props {
  center: { lat: number; lng: number }
  markers?: MapMarker[]
  /** 自定义高度（像素）。不传则按设备模式自适应 */
  height?: number
}

// 构建期常量：H5 构建时 Taro 会把 process.env.TARO_ENV 替换为字符串字面量，
// 因此下面 IS_H5 分支能让 <Map>（微信小程序组件）完全不进入 H5 包，
// 从根上避免 “H5 暂不支持 Map 组件” 的运行时告警。
const IS_H5 = process.env.TARO_ENV === 'h5'

// 各模式默认地图高度：小屏紧凑、PC 宽屏更高
function defaultHeight(mode: 'mobile' | 'tablet' | 'desktop') {
  return mode === 'mobile' ? 240 : mode === 'tablet' ? 320 : 460
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
 */
export default function MapView({ center, markers = [], height }: Props) {
  const { mode } = useResponsive()
  const h = height ?? defaultHeight(mode)
  const ref = useRef<any>(null)
  const mapRef = useRef<any>(null)
  const idRef = useRef<string>(`amap-canvas-${++seq}`)
  const [err, setErr] = useState('')

  // 把对象/数组依赖序列化成字符串，避免每次父组件 render 都触发重建
  const centerKey = center ? `${center.lat},${center.lng}` : ''
  const markerKey = markers.map((m) => `${m.lat},${m.lng},${m.title || ''}`).join('|')

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
            }
            const map = mapRef.current
            if (typeof map.clearMap === 'function') map.clearMap()
            markers.forEach((m) => {
              new AMap.Marker({ position: [m.lng, m.lat], title: m.title, map })
            })
            const all = [{ lng: center.lng, lat: center.lat }, ...markers]
            if (all.length >= 2 && typeof map.setFitView === 'function') {
              map.setFitView()
            } else if (typeof map.setCenter === 'function') {
              map.setCenter([center.lng, center.lat])
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
      const wrapper = document.getElementById(idRef.current)
      const host = wrapper?.querySelector('div.amap-host')
      if (host && host.parentNode) host.parentNode.removeChild(host)
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
      </View>
    )
  }

  // 微信小程序：原生 Map 组件
  const wxMarkers = markers.map((m, i) => ({
    id: i,
    latitude: m.lat,
    longitude: m.lng,
    title: m.title || '',
    width: 24,
    height: 24,
  }))
  return (
    <Map
      longitude={center.lng}
      latitude={center.lat}
      scale={12}
      markers={wxMarkers}
      style={{ width: '100%', height: h, marginTop: 12 }}
    />
  )
}
