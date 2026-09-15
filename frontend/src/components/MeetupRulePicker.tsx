import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { api } from '../services/api'
import { useResponsive } from '../hooks/useResponsive'

/** 碰面规则选项：同城 / 异地 两大类，各自含若干子规则（仅记录选择，算法后续补充）。 */
export const RULE_OPTIONS: Record<'same_city' | 'travel', { key: string; label: string }[]> = {
  same_city: [
    { key: 'same_city:nearest', label: '离大家最近' },
    { key: 'same_city:time', label: '每个人时间相近' },
    { key: 'same_city:transit', label: '公共交通最近' },
    { key: 'same_city:drive', label: '开车最近' },
  ],
  travel: [
    { key: 'travel:geo', label: '地理位置接近' },
    { key: 'travel:time', label: '时间相近' },
  ],
}

export const RULE_LABELS: Record<string, string> = Object.fromEntries(
  (Object.keys(RULE_OPTIONS) as Array<'same_city' | 'travel'>).flatMap((k) =>
    RULE_OPTIONS[k].map((o) => [o.key, o.label])
  )
)

interface Props {
  code: string
  /** 当前已保存的规则 key（来自后端） */
  value?: string | null
  onChange?: (rule: string) => void
}

/**
 * 选择碰面规则：先选「同城 / 异地」，再选具体子规则。
 * 当前只把选择持久化到后端，具体算法待后续补充（中心计算仍走原 geo 逻辑）。
 */
export default function MeetupRulePicker({ code, value, onChange }: Props) {
  const { mode } = useResponsive()
  const t = tokens(mode)
  const [modeSel, setModeSel] = useState<'same_city' | 'travel'>(
    value?.startsWith('travel') ? 'travel' : 'same_city'
  )
  const [saving, setSaving] = useState(false)

  const current = value || ''
  const pick = async (key: string) => {
    if (key === current) return
    setSaving(true)
    try {
      await api.setMeetupRule(code, key)
      onChange?.(key)
      Taro.showToast({ title: '已保存规则', icon: 'success' })
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const tab = (k: 'same_city' | 'travel', label: string) => {
    const active = modeSel === k
    return (
      <Button
        size='mini'
        onClick={() => setModeSel(k)}
        style={{
          background: active ? '#ff6b35' : '#fff',
          color: active ? '#fff' : '#ff6b35',
          border: '1px solid #ff6b35',
          borderRadius: 999,
          padding: '8px 18px',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {label}
      </Button>
    )
  }

  return (
    <View>
      <View style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {tab('same_city', '同城')}
        {tab('travel', '异地')}
      </View>
      <Text
        style={{
          display: 'block',
          fontSize: 12,
          color: '#6b6b6b',
          marginBottom: 8,
        }}
      >
        选择「{modeSel === 'same_city' ? '同城' : '异地'}」下的碰面规则（算法将在后续补充，当前仅记录你的选择）
      </Text>
      <View style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {RULE_OPTIONS[modeSel].map((o) => {
          const active = current === o.key
          return (
            <Button
              key={o.key}
              size='mini'
              loading={saving && active}
              onClick={() => pick(o.key)}
              style={{
                background: active ? 'rgba(16,185,129,0.12)' : '#fff',
                color: active ? '#059669' : '#374151',
                border: `1px solid ${active ? '#10b981' : 'rgba(0,0,0,0.1)'}`,
                borderRadius: 999,
                padding: '7px 14px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {o.label}
            </Button>
          )
        })}
      </View>
      {current && (
        <Text style={{ display: 'block', marginTop: 10, fontSize: 12, color: '#059669' }}>
          当前规则：{RULE_LABELS[current] || current}
        </Text>
      )}
    </View>
  )
}
