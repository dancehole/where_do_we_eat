import { View, Text } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import { AMAP_JS_KEY } from '../config'
import { loadAMap, getAMapLastError } from '../utils/amap'
import { reportDebug } from '../utils/debug'

// 构建期常量：仅 H5 渲染（小程序端请用原生 <Map> / Taro.chooseLocation）
const IS_H5 = process.env.TARO_ENV === 'h5'

export interface PickedPoint {
  lat: number
  lng: number
  addr: string
}

interface Props {
  /** 地图初始/重新居中的位置（一般传「大概位置」：自动定位到的城市级坐标，或搜索结果） */
  center?: { lat: number; lng: number } | null
  /** 用户在地图上点选 / 拖动标记后的结果（含反查地址） */
  onChange: (p: PickedPoint) => void
  height?: number
}

let seq = 0

/**
 * 地图选点：在高德地图上点选或拖动标记，选出具体位置。
 *
 * 设计要点（沿用 MapView 的踩坑经验）：
 *  - 高德 JSAPI 不能在 Taro 自定义元素 <taro-view-core> 上初始化，故动态创建一个原生 div 作为宿主；
 *  - 容器尺寸为 0 时 AMap 会白屏，因此等尺寸 > 0 再初始化；
 *  - ResizeObserver 监听尺寸变化调用 map.resize()；
 *  - 初始化/加载失败时把原因显示出来并上报 /api/debug/log，绝不静默空白。
 */
export default function MapPicker({ center, onChange, height = 260 }: Props) {
  const idRef = useRef<string>(`amap-pick-${++seq}`)
  const wrapRef = useRef<any>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const geocoderRef = useRef<any>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [err, setErr] = useState('')
  const [addr, setAddr] = useState('')

  const centerKey = center ? `${center.lat},${center.lng}` : ''

  // 落点处理：移动标记 + 反查地址 + 回调
  const handlePoint = (lat: number, lng: number) => {
    const map = mapRef.current
    if (!map) return
    if (markerRef.current) markerRef.current.setPosition([lng, lat])
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    const emit = (a: string) => {
      setAddr(a)
      onChangeRef.current({ lat, lng, addr: a })
    }
    if (geocoderRef.current) {
      try {
        geocoderRef.current.getAddress([lng, lat], (status: string, result: any) => {
          const a =
            status === 'complete' && result?.regeocode?.formattedAddress
              ? result.regeocode.formattedAddress
              : fallback
          emit(a)
        })
      } catch {
        emit(fallback)
      }
    } else {
      emit(fallback)
    }
  }

  useEffect(() => {
    if (!IS_H5) return
    if (!AMAP_JS_KEY) {
      setErr('未注入高德 JS Key（AMAP_JS_KEY 为空）')
      return
    }
    let cancelled = false
    let rafId = 0
    let tries = 0
    let ro: any = null

    const getEl = (): HTMLElement | null => {
      const byId = document.getElementById(idRef.current)
      if (byId) return byId as HTMLElement
      const r = wrapRef.current
      return r && r.nodeType === 1 ? (r as HTMLElement) : null
    }

    const ensureHost = (wrapper: HTMLElement): HTMLElement => {
      let host = wrapper.querySelector('div.amap-pick-host') as HTMLElement | null
      if (!host) {
        host = document.createElement('div')
        host.className = 'amap-pick-host'
        host.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;'
        wrapper.appendChild(host)
      }
      return host
    }

    const init = () => {
      if (cancelled) return
      const wrapper = getEl()
      if (!wrapper || wrapper.clientWidth === 0 || wrapper.clientHeight === 0) {
        if (++tries > 120) {
          setErr('地图容器尺寸为 0，无法初始化')
          return
        }
        rafId = requestAnimationFrame(init)
        return
      }
      const host = ensureHost(wrapper)

      loadAMap()
        .then(async (AMap: any) => {
          if (cancelled) return
          await new Promise<void>((resolve) => AMap.plugin(['AMap.Geocoder'], () => resolve()))
          if (cancelled) return
          geocoderRef.current = new AMap.Geocoder({})
          const c = center || { lat: 39.90923, lng: 116.397428 }
          const map = new AMap.Map(host, { center: [c.lng, c.lat], zoom: 12, resizeEnable: true })
          mapRef.current = map
          const marker = new AMap.Marker({ position: [c.lng, c.lat], draggable: true, map })
          markerRef.current = marker
          marker.on('dragend', () => {
            const pos = marker.getPosition()
            handlePoint(Number(pos.lat), Number(pos.lng))
          })
          map.on('click', (e: any) => {
            handlePoint(Number(e.lnglat.lat), Number(e.lnglat.lng))
          })
          if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => {
              try {
                map.resize?.()
              } catch {
                /* ignore */
              }
            })
            ro.observe(host)
          }
          setErr('')
          reportDebug(`[MapPicker] ok center=${centerKey} size=${host.clientWidth}x${host.clientHeight}`)
        })
        .catch((e: any) => {
          if (cancelled) return
          const m = e?.message || getAMapLastError() || '高德地图加载失败'
          setErr(m)
          reportDebug(`[MapPicker] 加载失败：${m}`, 'ERROR')
        })
    }

    init()
    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      if (ro) ro.disconnect()
      try {
        mapRef.current?.destroy?.()
      } catch {
        /* ignore */
      }
      mapRef.current = null
      markerRef.current = null
      geocoderRef.current = null
      const wrapper = document.getElementById(idRef.current)
      const host = wrapper?.querySelector('div.amap-pick-host')
      if (host && host.parentNode) host.parentNode.removeChild(host)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey, AMAP_JS_KEY])

  if (!IS_H5) return null

  return (
    <View>
      <View
        style={{
          width: '100%',
          height,
          position: 'relative',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#f3f4f6',
        }}
      >
        <View
          id={idRef.current}
          ref={wrapRef}
          style={{ display: 'block', width: '100%', height, position: 'absolute', top: 0, left: 0 }}
        />
        {err ? (
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
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              background: 'rgba(255,247,237,0.96)',
              color: '#b45309',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <Text>
              地图加载失败：{err}
              {'\n'}可展开下方「其他方式」手动输入经纬度。
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#6b6b6b' }}>
        在地图上点选或拖动标记，即可选具体位置
      </Text>
      {addr ? (
        <Text style={{ display: 'block', marginTop: 2, fontSize: 12, color: '#ff6b35', wordBreak: 'break-word' }}>
          已选：{addr}
        </Text>
      ) : null}
    </View>
  )
}
