import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import { useResponsive, tokens } from '../../hooks/useResponsive'

export default function MeetupList() {
  const [active, setActive] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const { mode } = useResponsive()
  const t = tokens(mode)

  const load = async () => {
    try {
      setActive(await api.listMine('active'))
    } catch {
      /* ignore */
    }
    try {
      setHistory(await api.history())
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load()
  }, [])

  // 响应式网格：手机单列、平板 2 列、PC 3 列
  const cols = mode === 'mobile' ? 1 : mode === 'tablet' ? 2 : 3

  const Item = (m: any) => (
    <View
      key={m.code}
      onClick={() => Taro.navigateTo({ url: `/pages/meetup-detail/index?code=${m.code}` })}
      style={{
        padding: t.gap,
        background: '#fff',
        borderRadius: t.radius - 2,
        border: '1px solid rgba(0,0,0,0.04)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        transition: 'transform .15s ease, box-shadow .15s ease',
        boxShadow: '0 1px 3px rgba(180,100,40,0.05)',
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: m.status === 'active' ? 'rgba(255,107,53,0.12)' : 'rgba(0,0,0,0.05)',
          color: m.status === 'active' ? '#ff6b35' : '#9ca3af',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name='users' size={22} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: 700, color: '#2b2b2b', fontSize: mode === 'mobile' ? 15 : 16 }}>
          碰面 {m.code}
        </Text>
        <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text style={{ color: '#6b6b6b', fontSize: 12 }}>
            {m.participant_count} 人
          </Text>
          <View
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: m.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.06)',
              color: m.status === 'active' ? '#059669' : '#6b7280',
            }}
          >
            {m.status === 'active' ? '进行中' : '已结束'}
          </View>
        </View>
      </View>
      <Icon name='arrow' size={18} color='#9ca3af' />
    </View>
  )

  return (
    <PageContainer
      title='我的碰面'
      subtitle='查看你发起或参与过的碰面'
      icon='users'
      tab='meetup'
      headerRight={
        <Button
          size='mini'
          style={{
            background: '#ff6b35',
            color: '#fff',
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
          }}
          onClick={() => Taro.navigateTo({ url: '/pages/meetup-create/index' })}
        >
          <Icon name='plus' size={14} color='#fff' /> 发起
        </Button>
      }
    >
      <Section title='进行中' icon='sparkle' tone='orange'>
        {active.length ? (
          <View
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: 12,
            }}
          >
            {active.map(Item)}
          </View>
        ) : (
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>暂无进行中的碰面</Text>
        )}
      </Section>

      <Section title='历史记录' icon='calendar'>
        {history.length ? (
          <View
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: 12,
            }}
          >
            {history.map(Item)}
          </View>
        ) : (
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>暂无历史记录</Text>
        )}
      </Section>
    </PageContainer>
  )
}
