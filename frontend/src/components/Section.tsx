import { ReactNode, useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useResponsive, tokens } from '../hooks/useResponsive'
import Icon, { IconName } from './Icon'

export interface SectionProps {
  title?: ReactNode
  icon?: IconName
  /** 右侧操作 */
  extra?: ReactNode
  children: ReactNode
  /** 强调色（默认暖橙） */
  tone?: 'orange' | 'blue' | 'green' | 'neutral'
  padding?: number
  /** 取消内部 padding，便于承载地图等满宽内容 */
  flush?: boolean
  /** 可折叠：标题栏可点击展开/收起 */
  collapsible?: boolean
  /** 折叠默认是否展开（仅 collapsible 时有效），默认 true */
  defaultOpen?: boolean
}

const TONE_BG: Record<NonNullable<SectionProps['tone']>, string> = {
  orange: 'rgba(255, 247, 237, 0.92)',
  blue: 'rgba(232, 244, 255, 0.92)',
  green: 'rgba(236, 253, 245, 0.92)',
  neutral: 'rgba(255, 255, 255, 0.86)',
}
const TONE_ICON: Record<NonNullable<SectionProps['tone']>, string> = {
  orange: '#ff6b35',
  blue: '#3b82f6',
  green: '#10b981',
  neutral: '#6b7280',
}

/**
 * 内容分组卡片：在 PageContainer 玻璃面之上，再加一层圆角小卡片
 *  用于：手动选择面板、碰面码卡片、参与者列表、AI 推荐结果等
 */
export default function Section({
  title,
  icon,
  extra,
  children,
  tone = 'neutral',
  padding,
  flush,
  collapsible,
  defaultOpen = true,
}: SectionProps) {
  const { mode } = useResponsive()
  const t = tokens(mode)
  const pad = padding ?? t.gap
  const [open, setOpen] = useState(defaultOpen)

  const headerVisible = title || extra || collapsible
  const headerMargin = collapsible && !open ? 0 : title ? t.gap - 4 : 0

  return (
    <View
      style={{
        background: TONE_BG[tone],
        borderRadius: t.radius - 2,
        padding: flush ? 0 : pad,
        marginBottom: t.gap,
        border: '1px solid rgba(0,0,0,0.04)',
        boxShadow: '0 2px 8px rgba(180, 100, 40, 0.05)',
      }}
    >
      {headerVisible && (
        <View
          onClick={collapsible ? () => setOpen((v) => !v) : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: headerMargin,
            gap: 8,
            cursor: collapsible ? 'pointer' : 'default',
          }}
        >
          {title && (
            <View style={{ display: 'flex', alignItems: 'center', gap: 6, color: TONE_ICON[tone] }}>
              {icon && <Icon name={icon} size={16} />}
              <Text style={{ fontSize: mode === 'mobile' ? 14 : 15, fontWeight: 600, color: '#2b2b2b' }}>
                {title}
              </Text>
            </View>
          )}
          <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {extra}
            {collapsible && (
              <Icon name={open ? 'chevron_down' : 'chevron_right'} size={16} color='#9ca3af' />
            )}
          </View>
        </View>
      )}
      {(!collapsible || open) && children}
    </View>
  )
}
