import { useEffect, useState } from 'react'

// 断点（与 CSS 媒体查询保持一致，单位 px）：
//   mobile  : < 768        手机竖屏
//   tablet  : 768 ~ 1199   平板 / 手机横屏
//   desktop : >= 1200      PC 大屏
export type DeviceMode = 'mobile' | 'tablet' | 'desktop'

function calcMode(w: number): DeviceMode {
  if (w >= 1200) return 'desktop'
  if (w >= 768) return 'tablet'
  return 'mobile'
}

// 返回当前设备模式与视口宽度，并在 resize / orientationchange 时更新。
// 仅在 H5（浏览器）环境有意义；小程序端永远按 mobile 处理（Taro 组件不响应媒体查询）。
export function useResponsive(): { mode: DeviceMode; width: number; isH5: boolean } {
  const getW = () =>
    typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 375
  const [width, setWidth] = useState<number>(getW())
  const [mode, setMode] = useState<DeviceMode>(calcMode(getW()))

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => {
      const w = window.innerWidth
      setWidth(w)
      setMode(calcMode(w))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    onResize()
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  return { mode, width, isH5: typeof window !== 'undefined' }
}

// 各模式下的布局令牌，组件直接读取即可，无需重复写媒体查询。
// maxWidth = 0 表示占满容器（非 0 时内容居中、最大宽受限）。
export const layout = {
  mobile: { maxWidth: 0, pad: 16, radius: 12, gap: 12, titleSize: 20 },
  tablet: { maxWidth: 720, pad: 24, radius: 16, gap: 16, titleSize: 24 },
  desktop: { maxWidth: 1080, pad: 32, radius: 18, gap: 20, titleSize: 28 },
} as const

export function tokens(mode: DeviceMode) {
  return layout[mode]
}
