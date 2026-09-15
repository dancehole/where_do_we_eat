import { CSSProperties } from 'react'
import { Image } from '@tarojs/components'
import Taro from '@tarojs/taro'

/**
 * 自包含图标集（不依赖外部图标库，可主题化）
 *  - 统一 24×24 viewBox，stroke 色随 color 参数
 *  - 用法：<Icon name="pin" />，可选 size / color / style
 *
 * ⚠️ 微信小程序原生不支持 <svg> 组件：Taro 编译后 <svg> 是未知组件，
 *    渲染期会抛错且项目无错误边界 → 整页白屏。所以这里统一用 <Image> 加载
 *    SVG 的 base64 data URI（H5 / 小程序两端都支持），从根上规避白屏。
 */

// 图标 inner markup（viewBox 0 0 24 24，stroke 样式由外层 svg 决定）
const ICONS: Record<string, string> = {
  // 定位针
  pin: '<path d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13z"/><circle cx="12" cy="9" r="2.5"/>',
  // 多人
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/><circle cx="17" cy="9" r="2.8"/><path d="M14 20c0-2.6 2-4.5 5-4.5s3 .9 3 2"/>',
  // 餐厅 / 刀叉
  fork:
    '<path d="M7 2v8a2 2 0 0 0 2 2v10"/><path d="M11 2v6"/><path d="M7 2v3"/><path d="M16 2c-1.5 0-3 1.5-3 4s1.5 4 3 4v12"/>',
  // 分享
  share:
    '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 11l8-4"/><path d="M8 13l8 4"/>',
  // 日历
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4M16 3v4"/>',
  // 搜索
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  // 加号
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  // AI 闪光
  sparkle:
    '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z"/>',
  // 箭头
  arrow: '<path d="M5 12h14"/><path d="M13 5l7 7-7 7"/>',
  // 复制
  copy:
    '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  // 结束 / 停止
  end: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6"/><path d="M15 9l-6 6"/>',
  // 筷子（品牌点缀）
  chopsticks: '<path d="M3 21l6-18"/><path d="M9 21l6-18"/><path d="M5 7l4 .5"/>',
  // 目标 / 中心点
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  // 返回（左箭头）
  back: '<path d="M19 12H5"/><path d="M11 5l-7 7 7 7"/>',
  // 首页
  home:
    '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5"/><path d="M10 21v-6h4v6"/>',
  // 我的（用户）
  user:
    '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5"/>',
  // 折叠箭头（下）
  chevron_down: '<path d="M6 9l6 6 6-6"/>',
  // 折叠箭头（右）
  chevron_right: '<path d="M9 6l6 6-6 6"/>',
}

export type IconName = keyof typeof ICONS

export interface IconProps {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
  style?: CSSProperties
}

// 小程序端无 btoa 时走 Taro 的 arrayBuffer 转换；图标字符串为纯 ASCII，直接按字节编码即可
function toBase64(str: string): string {
  if (typeof btoa !== 'undefined') return btoa(str)
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
  return Taro.arrayBufferToBase64(bytes.buffer)
}

function iconUri(name: IconName, size: number, color: string, sw: number): string {
  const inner = ICONS[name] || ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  return `data:image/svg+xml;base64,${toBase64(svg)}`
}

export default function Icon({ name, size = 18, color, strokeWidth = 1.8, className, style }: IconProps) {
  const inner = ICONS[name]
  if (!inner) return null
  const merged: CSSProperties = { display: 'inline-block', verticalAlign: 'middle', ...style }
  // H5：内联 svg（保留 currentColor 继承，视觉与历史一致）
  if (process.env.TARO_ENV === 'h5') {
    return (
      <svg
        width={size}
        height={size}
        viewBox='0 0 24 24'
        fill='none'
        stroke={color || 'currentColor'}
        strokeWidth={strokeWidth}
        strokeLinecap='round'
        strokeLinejoin='round'
        className={className}
        style={merged}
        aria-hidden='true'
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    )
  }
  // 微信小程序原生不支持 <svg>：用 <Image> 加载 svg data URI
  return (
    <Image
      src={iconUri(name, size, color || '#333333', strokeWidth)}
      className={className}
      style={{ ...merged, width: size, height: size }}
      mode='aspectFit'
    />
  )
}
