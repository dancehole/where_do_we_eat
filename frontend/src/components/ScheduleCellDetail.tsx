import { View, Text, Image } from '@tarojs/components'
import { LEVEL_META, formatDateLabel } from '../utils/schedule'

interface Props {
  visible: boolean
  date: string
  slot: string | null
  merge: any
  onClose: () => void
}

// 钻取抽屉：点合并图某格，列出每个人该格的选择（颜色圆点 + 昵称 + 文案）
export default function ScheduleCellDetail({ visible, date, slot, merge, onClose }: Props) {
  if (!visible) return null
  const entries: any[] =
    slot == null
      ? merge?.breakdown?.[date]?.day || []
      : merge?.breakdown?.[date]?.slots?.[slot] || []

  const title = `${formatDateLabel(date)}${slot ? '  ' + slot : ''}`

  return (
    <View
      onClick={onClose}
      style={{
        position: 'fixed',
        left: 0, right: 0, top: 0, bottom: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <View
        onClick={(e: any) => e?.stopPropagation?.()}
        style={{
          width: '100%',
          maxWidth: 720,
          background: '#fff',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          padding: '18px 18px 28px',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
        }}
      >
        <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: 700, color: '#2b2b2b' }}>{title}</Text>
          <View onClick={onClose} style={{ padding: 6, cursor: 'pointer' }}>
            <Text style={{ fontSize: 14, color: '#9ca3af' }}>关闭 ✕</Text>
          </View>
        </View>

        <Text style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
          共 {entries.length} 人作答
        </Text>

        {entries.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#9ca3af' }}>还没有人勾选这一格</Text>
        ) : (
          <View style={{ display: 'grid', gap: 10, maxHeight: '50vh', overflowY: 'auto' }}>
            {entries.map((e, i) => {
              const meta = e.level ? LEVEL_META[e.level] : null
              return (
                <View
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', background: '#f9fafb', borderRadius: 10,
                  }}
                >
                  {e.avatar ? (
                    <Image src={e.avatar} style={{ width: 32, height: 32, borderRadius: 999, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }} mode='aspectFill' />
                  ) : (
                    <View
                      style={{
                        width: 32, height: 32, borderRadius: 999,
                        background: 'rgba(255,107,53,0.12)', color: '#ff6b35',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0,
                      }}
                    >
                      {(e.nickname || '?')[0]}
                    </View>
                  )}
                  <Text style={{ flex: 1, fontSize: 14, color: '#2b2b2b' }}>{e.nickname || '匿名'}</Text>
                  {meta && (
                    <View style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 999, background: meta.fill, border: '1px solid rgba(0,0,0,0.15)' }} />
                      <Text style={{ fontSize: 12, color: '#4b5563' }}>{meta.label}</Text>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </View>
    </View>
  )
}
