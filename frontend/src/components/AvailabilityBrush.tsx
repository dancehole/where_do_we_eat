import { View, Text } from '@tarojs/components'
import { Level, LEVEL_META, LEVELS, EMPTY_FILL } from '../utils/schedule'
import { useResponsive, tokens } from '../hooks/useResponsive'

interface Props {
  value: Level
  onChange: (lv: Level) => void
}

// 画笔调色板：4 色 + 橡皮（橡皮=清除/未作答）。选中项高亮描边。
export default function AvailabilityBrush({ value, onChange }: Props) {
  const { mode } = useResponsive()
  const t = tokens(mode)

  const items: { lv: Level; fill: string; label: string }[] = [
    ...LEVELS.map((lv) => ({ lv, fill: LEVEL_META[lv].fill, label: LEVEL_META[lv].short })),
    { lv: null, fill: EMPTY_FILL, label: '橡皮' },
  ]

  return (
    <View
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <Text style={{ fontSize: 12, color: '#6b6b6b', marginRight: 2 }}>画笔</Text>
      {items.map((it) => {
        const on = it.lv === value
        return (
          <View
            key={it.lv ?? 'erase'}
            onClick={() => onChange(it.lv)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 999,
              background: on ? 'rgba(255,107,53,0.12)' : '#fff',
              border: on ? '1.5px solid #ff6b35' : '1px solid rgba(0,0,0,0.08)',
              cursor: 'pointer',
              boxShadow: on ? '0 1px 4px rgba(255,107,53,0.18)' : 'none',
            }}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                background: it.fill,
                border: '1px solid rgba(0,0,0,0.12)',
              }}
            />
            <Text style={{ fontSize: 12, color: on ? '#ff6b35' : '#4b5563', fontWeight: on ? 600 : 400 }}>
              {it.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
