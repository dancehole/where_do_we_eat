import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import PageContainer from '../../components/PageContainer'
import Section from '../../components/Section'
import Icon from '../../components/Icon'
import { useResponsive, tokens } from '../../hooks/useResponsive'

export default function ScheduleList() {
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { mode } = useResponsive()
  const t = tokens(mode)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.listMySchedules()
      setList(Array.isArray(data) ? data : [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const created = list.filter((m) => m.is_creator)
  const joined = list.filter((m) => !m.is_creator)

  const cols = mode === 'mobile' ? 1 : mode === 'tablet' ? 2 : 3

  const Item = (m: any) => (
    <View
      key={m.code}
      onClick={() => Taro.navigateTo({ url: `/pages/schedule-detail/index?code=${m.code}` })}
      style={{
        padding: t.gap,
        background: '#fff',
        borderRadius: t.radius - 2,
        border: '1px solid rgba(0,0,0,0.04)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(180,100,40,0.05)',
      }}
    >
      <View
        style={{
          width: 44, height: 44, borderRadius: 12,
          background: m.status === 'open' ? 'rgba(255,107,53,0.12)' : 'rgba(0,0,0,0.05)',
          color: m.status === 'open' ? '#ff6b35' : '#9ca3af',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <Icon name='calendar' size={22} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: 700, color: '#2b2b2b', fontSize: mode === 'mobile' ? 15 : 16 }}>
          {m.title}
        </Text>
        <Text style={{ display: 'block', fontSize: 12, color: '#6b6b6b', marginTop: 2 }}>
          {m.start_date} ~ {m.end_date}
          {m.granular_hours ? ' · 精确到小时' : ''}
        </Text>
        <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text style={{ color: '#6b6b6b', fontSize: 12 }}>{m.participant_count} 人</Text>
          <View
            style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 999,
              background: m.status === 'open' ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.06)',
              color: m.status === 'open' ? '#059669' : '#6b7280',
            }}
          >
            {m.status === 'open' ? '编辑中' : '已锁定'}
          </View>
        </View>
      </View>
      <Icon name='arrow' size={18} color='#9ca3af' />
    </View>
  )

  return (
    <PageContainer
      title='我的排期'
      subtitle='约个大家都有空的时间'
      icon='calendar'
      tab='schedule'
      headerRight={
        <Button
          size='mini'
          style={{
            background: '#ff6b35', color: '#fff', borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13,
          }}
          onClick={() => Taro.navigateTo({ url: '/pages/schedule-create/index' })}
        >
          <Icon name='plus' size={14} color='#fff' /> 新建
        </Button>
      }
    >
      {loading ? (
        <Text style={{ color: '#9ca3af', fontSize: 13 }}>加载中...</Text>
      ) : (
        <>
          <Section title='我发起的' icon='sparkle' tone='orange'>
            {created.length ? (
              <View style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>
                {created.map(Item)}
              </View>
            ) : (
              <Text style={{ color: '#9ca3af', fontSize: 13 }}>还没有发起的排期</Text>
            )}
          </Section>

          <Section title='我参与的' icon='users' tone='blue'>
            {joined.length ? (
              <View style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>
                {joined.map(Item)}
              </View>
            ) : (
              <Text style={{ color: '#9ca3af', fontSize: 13 }}>还没有参与的排期</Text>
            )}
          </Section>
        </>
      )}
    </PageContainer>
  )
}
